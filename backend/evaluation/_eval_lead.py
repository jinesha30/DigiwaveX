"""evaluation/_eval_lead.py — self-contained evaluation runner entry point.

Wraps eval_runner to run dataset evaluation end-to-end against the uvicorn server.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

EVAL_DIR = BACKEND / "evaluation"
if str(EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(EVAL_DIR))

from eval_runner import main

if __name__ == "__main__":
    raise SystemExit(main())