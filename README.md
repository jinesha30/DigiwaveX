# DigiWave X

AI-verified virtual laboratory for Digital Communication practicals.

## Status

Phase 1 complete: ground-truth oracle (NRZ-L, Manchester, AMI) with tests.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run the tests

```bash
cd backend
pytest
```

All 24 tests should pass. These verify the encoding rules against
hand-worked examples, so they are the safety net for every component
built on top of the oracle.

## Try the oracle

```bash
cd backend
python -c "from app.oracle.encoders import encode; print(encode('ami',[1,0,1,1,0]))"
```

## Project layout

```
backend/
  app/
    oracle/      encoders.py  <- Phase 1 (done)
    ingestion/   Phase 2: chunking + ChromaDB
    graph/       Phase 4: LangGraph nodes
    llm/         Phase 3: provider-agnostic LLM interface
  tests/
  scripts/
## Launching the Presentation Frontend

You can present DigiWave X to the judges with a single click:

### Option 1: One-Click Batch Script
Double-click `start_presentation.bat` in the root folder, which starts the backend and opens the frontend.

### Option 2: Run Development Servers
```bash
# Terminal 1: FastAPI Backend
cd backend
.venv\Scripts\activate
uvicorn app.api:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend
cd frontend
python -m http.server 5173
```
Open **`http://localhost:5173`** in your browser.

## Judge Presentation Features
- **Deterministic NumPy Oracle**: Supports Polar NRZ-L, Unipolar NRZ, NRZ-M, Unipolar RZ, Bipolar RZ, Manchester, and AMI with exact mathematical verification.
- **Virtual Digital Storage Oscilloscope (DSO)**: Dual-channel CRT oscilloscope with phosphor glow, timebase/volt controls, DC offset, and real-time transition telemetry.
- **Hardware Patch Bay Workbench**: Modular breadboard with interactive banana jacks and Bézier patch cables, verifying required connections against trainer kit schematics.
- **AI Socratic Tutor ("Dr. Wave")**: LangGraph pedagogical agent with 3-level hint escalation, textbook RAG citations, and confidence scoring.
- **Misconception & Fault Injection Sandbox**: Detects AMI polarity reset errors, Manchester convention flips, and wiring open circuits.
- **Counterfactual "What-If" Explorer & DSSS Spread Spectrum**: Real-time signal diffing and wideband PN code spreading simulation.
- **One-Click Judge Tour**: 5-step guided walkthrough dock designed specifically for presentation judges.

