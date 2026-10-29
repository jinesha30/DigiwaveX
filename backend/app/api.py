"""app/api.py — thin HTTP boundary over the deterministic engine and tutor.

This module keeps the existing ``POST /circuit/state`` endpoint completely
unchanged. A new, thin route is added on the same ``app`` instance:

    POST /tutor

The tutor route is the AI tutoring pipeline. It:
    1. builds and validates the deterministic circuit state via the engine,
    2. obtains the deterministic oracle result,
    3. constructs AgentState,
    4. runs the LangGraph,
    5. returns the final tutor response.

Everything the tutor does is optional and degrades gracefully: if
GEMINI_API_KEY is missing the request still returns a valid (but plain)
answer, and if a single LLM node fails it falls back to the deterministic
facts with a clear message. The student is never left with a 500 and no
world.
"""

from __future__ import annotations

import copy
import logging
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.experiments.engine import ExperimentNotFound, build_circuit_state
from app.graph.graph import make_graph
from app.graph.state import AgentState
from app.llm.client import GeminiNotConfigured, is_gemini_configured
from app.oracle.encoders import ENCODERS

try:
    from pathlib import Path
    from dotenv import load_dotenv
    _api_dir = Path(__file__).resolve().parent.parent
    load_dotenv(_api_dir / ".env")
    load_dotenv(_api_dir.parent / ".env")
    load_dotenv()
except ImportError:
    pass

log = logging.getLogger(__name__)

# Reuse the existing FastAPI app object so the existing /circuit/state
# endpoint is untouched.
app = FastAPI(
    title="DigiWave X Circuit + Tutor API",
    description=(
        "Deterministic experiment engine (line coding, DSSS) plus an AI "
        "tutoring pipeline on top of it."
    ),
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- HTTP request/response models (defined before use) ---


class Connection(BaseModel):
    """A single wiring knot: '<block>.<port>' -> '<block>.<port>'."""

    from_: str = Field(..., alias="from", description="Source port, e.g. source.out")
    to: str = Field(..., description="Destination port, e.g. encoder.in")

    @property
    def from_port(self) -> str:
        return self.from_


# The existing circuit request/response models (Pydantic only as a boundary,
# no business logic here). Kept identical to the original implementation.


class CircuitRequest(BaseModel):
    """The full request body for POST /circuit/state."""

    experiment_id: str = Field(..., description="Experiment id, e.g. 'line_coding'")
    block_inputs: dict[str, dict[str, Any]] = Field(
        ...,
        description="Student-set block inputs, keyed by block id.",
    )
    connections: list[Connection] = Field(
        ...,
        description="Student-built wiring using canonical port refs.",
    )


class CircuitResponse(BaseModel):
    """The response body. Exactly the engine's return value, JSON-serialized."""

    experiment_id: str | None = None
    blocks: list[dict[str, Any]]
    connections: list[dict[str, str]]
    wiring_status: dict[str, Any]
    dirty: bool
    oracle: dict[str, Any]
    diagnosis: dict[str, Any] | None = None


# Force pydantic to resolve all forward references before the app serves
# requests (TutorRequest -> Connection -> CircuitRequest is a cross-import).

@app.post(
    "/circuit/state",
    summary="Run one experiment end to end",
    description=(
        "Deterministic engine. Returns the engine's result unchanged; no "
        "waveform, DC component, transitions, or wiring logic lives here."
    ),
    tags=["circuit"],
)
async def post_circuit_state(payload: CircuitRequest) -> CircuitResponse:
    """Run the deterministic experiment and return its full state object."""
    try:
        result = build_circuit_state(
            experiment_id=payload.experiment_id,
            block_inputs=payload.block_inputs,
            connections=[{"from": c.from_port, "to": c.to} for c in payload.connections],
        )
        return CircuitResponse(**result)
    except Exception as exc:
        # The engine is where the real validation/errors live; the API only
        # translates exceptions into HTTP errors so the frontend can show
        # them to the student.
        if isinstance(exc, KeyError):
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@app.get("/health", summary="Health check")
async def health_check():
    return {
        "status": "online",
        "service": "DigiWave X Circuit + Tutor API",
        "version": "0.2.0",
        "gemini_configured": is_gemini_configured(),
        "schemes": list(ENCODERS.keys()),
    }


class DirectEncodeRequest(BaseModel):
    scheme: str = Field(default="nrz", description="Encoding scheme")
    bits: list[int] = Field(default=[1, 0, 1, 1, 0], description="List of 0 and 1 bits")
    voltage: float = Field(default=1.0, description="Peak voltage")


@app.post("/api/encode", summary="Quick direct line encoding calculation")
async def post_direct_encode(payload: DirectEncodeRequest):
    try:
        from app.oracle.encoders import encode as oracle_encode
        from app.oracle.decoders import decode as oracle_decode, check_ami_violation
        import numpy as np

        waveform = oracle_encode(payload.scheme, payload.bits)
        scaled = [float(v * payload.voltage) for v in waveform]
        dc_comp = float(sum(scaled) / len(scaled))
        transitions = sum(1 for i in range(1, len(scaled)) if scaled[i] != scaled[i - 1])
        decoded = oracle_decode(payload.scheme, waveform, 2)
        ami_cv = check_ami_violation(waveform, 2) if payload.scheme == "ami" else []

        return {
            "scheme": payload.scheme,
            "bits": payload.bits,
            "samples_per_bit": 2,
            "waveform": scaled,
            "dc_component": dc_comp,
            "transitions": transitions,
            "decoded_bits": decoded,
            "roundtrip_match": decoded == payload.bits,
            "ami_violations": ami_cv,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class DirectDsssRequest(BaseModel):
    bits: list[int] = Field(default=[1, 0, 1], description="Information bits")
    chip_rate: int = Field(default=4, description="Chips per bit")
    carrier_freq: float = Field(default=500.0, description="Carrier frequency in Hz")
    pn_seed: int = Field(default=0, description="Pseudo-noise generator seed")


@app.post("/api/dsss", summary="Run Direct Sequence Spread Spectrum modulation & coherent detection")
async def post_direct_dsss(payload: DirectDsssRequest):
    try:
        from app.oracle.dsss import run_dsss_chain
        result = run_dsss_chain(
            bits=payload.bits,
            chip_rate=payload.chip_rate,
            fc=payload.carrier_freq,
            pn_seed=payload.pn_seed,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class DirectAmRequest(BaseModel):
    Em: float = Field(default=2.0, description="Modulating signal amplitude in Volts")
    fm: float = Field(default=1000.0, description="Modulating signal frequency in Hz")
    Ec: float = Field(default=4.0, description="Carrier signal amplitude in Volts")
    fc: float = Field(default=455000.0, description="Carrier signal frequency in Hz")
    rf_link: str = Field(default="closed_dsbfc", description="closed_dsbfc or open_dsbsc")
    load_resistance: float = Field(default=50.0, description="Load resistance in Ohms")


@app.post("/api/am", summary="Direct calculation of AM DSB-FC modulation, trapezoid, and power")
async def post_direct_am(payload: DirectAmRequest):
    try:
        from app.oracle.am_modulator import calculate_am
        return calculate_am(
            Em=payload.Em,
            fm=payload.fm,
            Ec=payload.Ec,
            fc=payload.fc,
            rf_link=payload.rf_link,
            load_resistance=payload.load_resistance,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --- NEW tutor boundary ---

class TutorRequest(BaseModel):
    experiment_id: str = Field(..., description="Experiment id, e.g. 'line_coding'")
    student_query: str = Field(..., description="The student's question")
    block_inputs: dict[str, dict[str, Any]] = Field(
        default_factory=dict, description="Student-set block inputs, keyed by block id."
    )
    connections: list[Connection] = Field(
        default_factory=list, description="Student-built wiring using canonical port refs."
    )


class TutorResponse(BaseModel):
    turn_id: str
    answer: str
    hint_level: int
    hint_text: str | None
    diagnosis_summary: str | None
    faults: list[dict[str, Any]]
    citations: list[str]
    what_if: dict[str, Any] | None
    confidence: float | None
    stage: str
    next_action: str | None
    enough_evidence: bool
    deterministic_oracle: dict[str, Any] | None = None
    deterministic_wiring_status: dict[str, Any] | None = None
    error: str | None = None


@app.post(
    "/tutor",
    summary="Ask the AI tutor a question about a DigiWave X circuit",
    description=(
        "Builds the deterministic circuit state, runs the LangGraph, and "
        "returns the final tutor response. Deterministic circuit facts are "
        "grounded in the engine; the LLM provides pedagogy only. If "
        "GEMINI_API_KEY is missing, a helpful plain-text fallback is returned."
    ),
    tags=["tutor"],
)
async def post_tutor(payload: TutorRequest) -> TutorResponse:
    # 1. Build the deterministic circuit state (oracle + wiring + diagnosis).
    #    This is unchanged from the circuit endpoint.
    try:
        engine_result = build_circuit_state(
            experiment_id=payload.experiment_id,
            block_inputs=payload.block_inputs,
            connections=[{"from": c.from_port, "to": c.to} for c in payload.connections],
        )
    except Exception as exc:
        # Fail to 400 for invalid experiment/inputs; the engine already
        # surfaces the real messages.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 2. If Gemini is not configured, fall back to the deterministic engine immediately
    #    without running the heavy LangGraph/RAG pipeline.
    if not is_gemini_configured():
        return _tutor_fallback(payload, engine_result)

    # 3. Construct AgentState from the request + deterministic state.
    state = _build_agent_state(payload, engine_result)

    # 4. Run the LangGraph.
    try:
        graph = make_graph()
        final_state = graph.invoke(state, config={"configurable": {"thread_id": uuid.uuid4().hex}})
    except GeminiNotConfigured as exc:
        # Graceful fallback for the tutorial path: the engine is still right,
        # and the student gets a clear message instead of a 500.
        log.warning("tutor graph skipped: %s", exc)
        return _tutor_fallback(payload, engine_result)
    except Exception as exc:  # noqa: BLE001
        log.exception("tutor graph failed")
        return _tutor_fallback(payload, engine_result, error=str(exc))

    # 5. Return the final response; attach the deterministic engine facts
    #    alongside so the frontend (and the student) can cross-check without
    #    trusting the LLM's numbers.
    final = final_state.get("final_response")
    if final is None:
        return _tutor_fallback(payload, engine_result, error="Tutor produced no final response.")

    return TutorResponse(
        turn_id=final.get("turn_id", uuid.uuid4().hex),
        answer=final.get("answer", "No answer produced."),
        hint_level=final.get("hint_level", 0),
        hint_text=final.get("hint_text"),
        diagnosis_summary=final.get("diagnosis_summary"),
        faults=final.get("faults", []),
        citations=final.get("citations", []),
        what_if=final.get("what_if"),
        confidence=final.get("confidence"),
        stage=final.get("stage", ""),
        next_action=final.get("next_action"),
        enough_evidence=final.get("enough_evidence", False),
        deterministic_oracle=engine_result.get("oracle"),
        deterministic_wiring_status=engine_result.get("wiring_status"),
        error=final.get("error"),
    )


def _build_agent_state(request: TutorRequest, engine_result: dict[str, Any]) -> AgentState:
    """Map the HTTP request + engine result onto AgentState.

    The agent state model expects one canonical home per fact. The engine's
    result is already the canonical home for the circuit section, so we
    copy it in rather than rebuilding it.
    """
    circuit = engine_result
    block_inputs = request.block_inputs
    connections = [{c.from_: c.to} for c in request.connections] if request.connections else []

    experiment_id = request.experiment_id

    # One-shot engine rebuild for the exact circuit shape the graph expects.
    # (The engine returns block inputs keyed by block id; the graph state
    # carries `engine_result` which holds the same object.)
    return {
        "query": request.student_query,
        "intent": None,
        "next_action": None,
        "student": {"student_id": "student-0001"},
        "experiment": {
            "experiment_id": experiment_id,
            "stage": "observe",
            "theory_tags": circuit.get("theory_tags", []),
        },
        "circuit": {
            **circuit,
            # Keep the canonical engine_result for downstream nodes.
            "engine_result": engine_result,
        },
        "knowledge": {},
        "tutor": {},
        "verification": {"retry_count": 0},
        "evaluation": {"turn_id": uuid.uuid4().hex, "session_id": "session-0001"},
        "final_response": None,
    }


def _tutor_fallback(
    request: TutorRequest,
    engine_result: dict[str, Any],
    error: str | None = None,
) -> TutorResponse:
    """Return a helpful fallback when Gemini is unavailable.

    The deterministic engine is still the source of truth, so this response
    is better than an empty one: it restates the circuit's ground truth and
    points the student at the right explanation.
    """
    probe = engine_result
    oracle = probe.get("oracle") or {}
    wiring = probe.get("wiring_status") or {}

    scheme = oracle.get("scheme")
    transitions = oracle.get("transitions")
    dc_comp = oracle.get("dc_component")
    dc_str = f"{dc_comp:.4f}" if isinstance(dc_comp, (int, float)) else str(dc_comp)
    levels = oracle.get("levels")

    circuit_valid = wiring.get("valid") is True
    missing = wiring.get("missing") or "none"
    unexpected = wiring.get("unexpected") or "none"

    answer = (
        f"I can't load the AI tutor right now because GEMINI_API_KEY is not configured. "
        f"Here is what I can tell you deterministically from the engine:\n\n"
        f"Circuit: {'VALID' if circuit_valid else 'INVALID'}\n"
        f"Missing: {missing}\n"
        f"Unexpected: {unexpected}\n"
        f"scheme={scheme}, transitions={transitions}, dc_component={dc_str}, levels={levels}\n\n"
        f"Ask me to explain any of these numbers, and I'll explain them in "
        f"pedagogical terms the moment the API key is configured."
    )
    return TutorResponse(
        turn_id=uuid.uuid4().hex,
        answer=answer,
        hint_level=0,
        hint_text=None,
        diagnosis_summary=(
            f"Deterministic circuit: scheme={scheme}, transitions={transitions}, dc={dc_str}"
            if scheme
            else ("Healthy circuit" if circuit_valid else "Wiring fault detected")
        ),
        faults=[],
        citations=[],
        what_if=None,
        confidence=0.4,
        stage="observe",
        next_action=None,
        enough_evidence=True,
        deterministic_oracle=oracle if oracle else None,
        deterministic_wiring_status=wiring if wiring else None,
        error=error or ("GEMINI_API_KEY is not set" if not is_gemini_configured() else None),
    )
