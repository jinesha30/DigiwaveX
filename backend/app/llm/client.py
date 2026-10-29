"""app/llm/client.py — thin, testable Gemini abstraction.

Design
------
* The real model is fetched from the GEMINI_API_KEY environment variable.
  Nothing is hardcoded.
* Production graph nodes call :func:`gemini_generate` (returns a string),
  so every node can be unit-tested with a monkeypatched stub — no SDK
  dependency is required.
* If GEMINI_API_KEY is missing or empty the module exposes a
  ``GeminiNotConfigured`` exception. Graph entry points check this once
  and raise a clear HTTP 503 instead of failing deep inside a node.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
    _backend_root = Path(__file__).resolve().parent.parent.parent
    load_dotenv(_backend_root / ".env")
    load_dotenv(_backend_root.parent / ".env")
    load_dotenv()
except ImportError:
    pass


def _get_api_key() -> str | None:
    """Read API key from environment, supporting GEMINI_API_KEY or GOOGLE_API_KEY."""
    return (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or os.getenv("GOOGLE_GENAI_API_KEY")
    )

try:  # pragma: no cover - SDK import time
    from google import genai
except ImportError as exc:  # pragma: no cover
    genai = None  # type: ignore[assignment]
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


class GeminiNotConfigured(Exception):
    """Raised when GEMINI_API_KEY is absent or empty."""


class GeminiClient:
    """Thin façade over the Google GenAI REST API.

    Public surface is deliberately small so the LangGraph nodes can inject
    a stub for tests:

        client = GeminiClient()
        result = client.generate(chat, system_prompt, user_msg)

    The client is *not* a singleton that eagerly initialises the SDK on
    import. Initialisation happens lazily — the first call to
    :meth:`generate` — which makes import side-effects predictable.
    """

    # gemini-2.5-flash was shut down on the Gemini Developer API (Oct 16, 2026) and now returns 404.
    MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    FALLBACK_MODELS = ("gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash")

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self._api_key = api_key or _get_api_key()
        self._model = model or self.MODEL
        self._client: genai.Client | None = None
        self._lock = threading.Lock()
        # Set only when the SDK import itself failed (as opposed to a missing
        # key). ``None`` otherwise, so ``ready`` can inspect it safely.
        self._import_error: BaseException | None = None
        try:
            import google.genai  # noqa: F401
        except ImportError as exc:  # pragma: no cover
            self._import_error = exc

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def generate(
        self,
        system_prompt: str,
        user_message: str,
        *,
        timeout: float = 60.0,
        temperature: float = 0.4,
    ) -> str:
        """Return a *string* completion from the configured model."""
        if not self.ready:
            raise GeminiNotConfigured(
                "GEMINI_API_KEY is not set. Set it before calling generate()."
            )
        # Lazy SDK initialisation.
        if self._client is None:
            with self._lock:
                if self._client is None:
                    self._client = genai.Client(api_key=self._api_key)
        contents = [
            genai.types.Content(role="user", parts=[genai.types.Part(text=system_prompt)]),
            genai.types.Content(role="user", parts=[genai.types.Part(text=user_message)]),
        ]
        config = genai.types.GenerateContentConfig(
            temperature=temperature, top_p=0.95, top_k=40, max_output_tokens=8192,
        )
        # Try the configured model first; on 404/NOT_FOUND (retired model) try fallbacks.
        tried, response, last_exc = [], None, None
        for name in [self._model, *self.FALLBACK_MODELS]:
            if name in tried:
                continue
            tried.append(name)
            try:
                response = self._client.models.generate_content(
                    model=name, config=config, contents=contents)
                self._model = name  # remember the one that worked
                break
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                msg = str(exc)
                if "404" in msg or "NOT_FOUND" in msg:
                    continue
                raise
        if response is None:
            raise last_exc
        # The SDK returns a parts list; grab the text verbatim.
        text = ""
        if response and getattr(response, "candidates", None):
            for cand in response.candidates:
                if getattr(cand, "content", None) is not None:
                    for part in cand.content.parts:
                        if getattr(part, "text", None):
                            text += part.text
        return text

    @property
    def ready(self) -> bool:
        """True when the SDK has a usable API key, False otherwise."""
        if self._import_error is not None:
            return False
        return bool(self._api_key and self._api_key.strip())

    @property
    def model(self) -> str:
        return self._model

    @classmethod
    def from_env(cls) -> "GeminiClient":
        return cls()


# Singleton used by the graph wiring functions. The graph entry point should
# call :func:`get_graph_client` once and cache the result for the process.
_client: GeminiClient | None = None


def get_graph_client() -> GeminiClient:
    """Return a cached GeminiClient for graph use.

    Raises GeminiNotConfigured immediately if the key is missing, so the
    top-level API route can return HTTP 503 before running the graph.
    """
    global _client
    if _client is None:
        _client = GeminiClient()
        if not _client.ready:
            raise GeminiNotConfigured(
                "GEMINI_API_KEY is not set. The tutor route requires it."
            )
    return _client


def is_gemini_configured() -> bool:
    """Read-only check for callers that want to fail gracefully before work."""
    key = _get_api_key()
    return bool(key and key.strip())