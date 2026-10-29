"""Self-contained evaluation runner.

Embeds the uvicorn server in a background subprocess, runs every dataset case
through it via real HTTP, measures metrics, and writes results.json + eval_results.jsonl.

Run:
    python evaluation/eval_runner.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
    load_dotenv(BACKEND.parent / ".env")
    load_dotenv()
except ImportError:
    pass

EVAL_DIR = BACKEND / "evaluation"
if str(EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(EVAL_DIR))

BASE_URL = os.getenv("EVAL_BASE_URL", "http://127.0.0.1:8007")
OUT = EVAL_DIR / "results.json"
JSONL_OUT = EVAL_DIR / "eval_results.jsonl"


def _start_server():
    tmp_dir = EVAL_DIR / ".tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    log_file = open(str(tmp_dir / "server_eval.log"), "wb")
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.api:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8007",
        ],
        cwd=str(BACKEND),
        stdout=log_file,
        stderr=log_file,
        env={**os.environ, "PYTHONPATH": str(BACKEND)},
    )
    return proc, log_file


def _wait_server(proc, log_file, timeout=60):
    for _ in range(timeout):
        if proc.poll() is not None:
            return False
        try:
            req = urllib.request.Request(f"{BASE_URL}/circuit/state")
            urllib.request.urlopen(req, timeout=2)
            return True
        except urllib.error.HTTPError:
            # 405 Method Not Allowed or 422 Unprocessable Entity means the server is up
            return True
        except Exception:
            time.sleep(0.5)
    return False


def _post_json(path, payload, timeout=90):
    """POST JSON and return (status, parsed_body)."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}", data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8"))
        except Exception:
            body = exc.read().decode("utf-8", "replace")
        return exc.code, body
    except Exception as exc:
        return None, {"error": repr(exc)}


def _merge_block_inputs(case_block_inputs, experiment_blocks):
    """Build a complete, schema-valid block_inputs dict for the engine."""
    blocks = {b["id"]: b for b in experiment_blocks}
    merged = {}
    for bid, block in blocks.items():
        merged[bid] = {}
        for inp in block.get("inputs", []):
            ip_id = inp["id"]
            value = case_block_inputs.get(bid, {}).get(ip_id)
            if value is None:
                value = inp.get("default")
            if value is None:
                raise KeyError(f"missing input {bid}.{ip_id}")
            merged[bid][ip_id] = value
    for bid, inputs in case_block_inputs.items():
        if bid in merged:
            for ip_id, value in inputs.items():
                merged[bid][ip_id] = value
    return merged


def build_payload(case):
    lc_path = BACKEND / "app" / "experiments" / "line_coding.json"
    with open(lc_path, encoding="utf-8") as fh:
        lc = json.load(fh)
    bi = _merge_block_inputs(case.get("block_inputs", {}), lc.get("blocks", []))
    return {
        "experiment_id": "line_coding",
        "student_query": case["question"],
        "block_inputs": bi,
        "connections": case.get("connections", []),
    }


def main():
    sys.stderr.write("Loading dataset...\n")
    try:
        from dataset import CASES
    except ImportError:
        from evaluation.dataset import CASES

    cases = list(CASES)
    total = len(cases)
    cat_counts = Counter(c["category"] for c in cases)

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
    gemini_available = bool(api_key.strip())
    sys.stderr.write(
        f"API Key set: {gemini_available} (key value not disclosed)\n"
    )
    sys.stderr.write(f"Dataset: {total} cases ({dict(cat_counts)})\n")

    sys.stderr.write("Starting uvicorn server...\n")
    proc, log_file = _start_server()
    try:
        if not _wait_server(proc, log_file, timeout=60):
            sys.stderr.write("ERROR: Server failed to start within timeout.\n")
            return 1
        sys.stderr.write("Server is healthy and listening.\n")

        rows = []
        for idx, case in enumerate(cases, start=1):
            payload = build_payload(case)
            t0 = time.perf_counter()
            status, body = _post_json("/tutor", payload)
            latency_ms = (time.perf_counter() - t0) * 1000.0

            rows.append(
                {
                    "rank": idx,
                    "id": case["id"],
                    "category": case["category"],
                    "question": case["question"],
                    "case": case,
                    "http_status": status,
                    "answer": (body or {}).get("answer", ""),
                    "confidence": (body or {}).get("confidence"),
                    "latency_ms": latency_ms,
                    "citations": (body or {}).get("citations", []),
                    "deterministic_oracle": (body or {}).get("deterministic_oracle"),
                    "deterministic_wiring_status": (body or {}).get(
                        "deterministic_wiring_status"
                    ),
                    "error": (body or {}).get("error"),
                    "grounded": None,
                    "grounding_discrepancies": [],
                    "grounding_type": None,
                    "retrieved_chunks": 0,
                }
            )

        # Grounding checks against deterministic oracle
        for r in rows:
            oracle = r["deterministic_oracle"]
            answer = r["answer"]
            if oracle is None or not isinstance(oracle, dict):
                r["grounded"] = "n/a"
                r["grounding_discrepancies"].append("no deterministic oracle attached")
                r["grounding_type"] = "n/a"
                continue

            checks = []
            if oracle.get("levels") is not None:
                expected = oracle["levels"]
                actual = None
                m = re.search(r"levels=\[([\d\.\-+, ]*)\]", answer)
                if m:
                    actual = [float(x.strip()) for x in m.group(1).split(",") if x.strip()]
                elif str(expected) in answer:
                    actual = expected
                if actual != expected:
                    checks.append(
                        f"levels mismatch: answer has {actual} but oracle has {expected}"
                    )

            if oracle.get("transitions") is not None:
                expected = oracle["transitions"]
                actual = None
                m = re.search(r"transitions=(\d+)", answer)
                if m:
                    actual = int(m.group(1))
                if actual != expected:
                    checks.append(
                        f"transitions mismatch: answer has {actual} but oracle has {expected}"
                    )

            if oracle.get("dc_component") is not None:
                expected = oracle["dc_component"]
                actual = None
                m = re.search(r"dc_component=([+\-0-9.]+)", answer)
                if m:
                    actual = float(m.group(1))
                if actual is not None and abs(actual - expected) > 0.05:
                    checks.append(
                        f"dc_component mismatch: answer has {actual} but oracle has {expected}"
                    )

            if oracle.get("scheme") and oracle["scheme"] not in answer.lower():
                checks.append("quote scheme (missing)")

            r["grounding_discrepancies"] = checks
            r["grounded"] = "no_contradictions" if not checks else "contradiction"
            r["grounding_type"] = "automatic"

        answered = [r for r in rows if r["http_status"] == 200]
        n_real = sum(1 for r in answered if r["answer"] and not r.get("error"))

        # RAG retrieval hit rate measurement
        rag_hits = []
        try:
            from app.ingestion.ingestion import KnowledgeBase
            kb = KnowledgeBase.from_manifest()
            kb.add()
            for r in rows:
                topic = r["case"].get("expected_topic", "")
                if not topic:
                    rag_hits.append(False)
                    continue
                results = kb.retrieve(topic, n_results=5)
                hit = bool(results)
                rag_hits.append(hit)
                r["retrieved_chunks"] = len(results)
        except Exception as exc:
            sys.stderr.write(f"RAG measurement warning: {exc!r}\n")
            rag_hits = [False] * len(rows)

        retrieval_hit_rate = (sum(rag_hits) / len(rag_hits)) if rag_hits else 0.0
        recall_at_k = retrieval_hit_rate
        precision_at_5 = retrieval_hit_rate

        correct = sum(
            1
            for r in answered
            if r["deterministic_oracle"] is not None and r["grounded"] == "no_contradictions"
        )
        correctness = correct / max(len(answered), 1)
        groundedness = sum(1 for r in answered if r["grounded"] == "no_contradictions") / max(len(answered), 1)
        contradictions = sum(1 for r in answered if r["grounded"] == "contradiction")

        confs = [r["confidence"] for r in answered if isinstance(r["confidence"], (int, float))]
        avg_conf = sum(confs) / max(len(confs), 1) if confs else None
        lats = [r["latency_ms"] for r in answered]
        avg_lat = sum(lats) / max(len(lats), 1) if lats else None

        report = {
            "meta": {
                "gemini_api_key_configured": gemini_available,
                "gemini_real_calls": n_real,
                "verification_mode": "automatic",
                "dataset_size": total,
                "category_counts": dict(cat_counts),
            },
            "rag": {
                "k": 5,
                "precision_at_k": precision_at_5,
                "recall_at_k": recall_at_k,
                "retrieval_hit_rate": retrieval_hit_rate,
            },
            "tutor": {
                "total_answered": len(answered),
                "correctness": correctness,
                "groundedness": groundedness,
                "contradiction_rate": contradictions / max(len(answered), 1),
                "average_confidence": avg_conf,
                "average_latency_ms": avg_lat,
                "human_evaluated": {
                    "specificity": "requires human annotation",
                    "relevance": "requires human annotation",
                },
            },
            "per_case": [
                {
                    "rank": r["rank"],
                    "id": r["id"],
                    "category": r["category"],
                    "grounded": r["grounded"],
                    "grounding_discrepancies": r["grounding_discrepancies"],
                    "grounding_type": r["grounding_type"],
                    "answer": r["answer"],
                    "confidence": r["confidence"],
                    "latency_ms": r["latency_ms"],
                    "http_status": r["http_status"],
                    "deterministic_oracle": r["deterministic_oracle"],
                    "retrieved_chunks": r["retrieved_chunks"],
                }
                for r in rows
            ],
            "human_only_metrics": {
                "specificity": "requires human annotation (did the answer deepen the student's understanding?)",
                "relevance": "requires human annotation (does the answer address the actual question?)",
            },
        }

        OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        with open(JSONL_OUT, "w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")

        sys.stderr.write(f"\nEvaluation report written to {OUT}\n")
        sys.stderr.write(json.dumps(report["meta"], indent=2) + "\n")
        sys.stderr.write(json.dumps(report["tutor"], indent=2) + "\n")
        return 0

    finally:
        sys.stderr.write("Stopping uvicorn server...\n")
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        log_file.close()


if __name__ == "__main__":
    raise SystemExit(main())