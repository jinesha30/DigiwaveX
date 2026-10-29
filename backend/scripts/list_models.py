"""Print the Gemini models your API key can actually use.
Run:  python scripts/list_models.py
Put one of the printed names (without 'models/') into backend/.env as GEMINI_MODEL=...
"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
from google import genai
key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if not key:
    sys.exit("No GEMINI_API_KEY in backend/.env")
c = genai.Client(api_key=key)
for m in c.models.list():
    if "generateContent" in (getattr(m, "supported_actions", None) or []):
        print(m.name.replace("models/", ""))