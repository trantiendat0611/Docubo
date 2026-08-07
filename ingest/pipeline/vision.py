"""Stage 2 — page image to structured content, via Gemini.

The only stage that spends vision quota. Everything it returns is cached to
disk by the caller before any downstream stage runs.

One page per request, deliberately. Sending the whole PDF in one call is cheaper
but loses reliable page attribution, and page numbers are what the citations in
the UI point at.

NOTE: verify the google-genai call surface against the installed version during
the week-1 spike — this SDK's API changed shape recently.
"""

from __future__ import annotations

import json
from pathlib import Path

from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential

from .. import config
from ..utils.ratelimit import RateLimiter
from .models import Page

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "page_extract.md"
_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_client: genai.Client | None = None
_limiter: RateLimiter | None = None


def _get_client() -> genai.Client:
    global _client, _limiter
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
        _limiter = RateLimiter(config.RPM)
    return _client


@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=2, max=60))
def _call(image_bytes: bytes, page_no: int) -> str:
    client = _get_client()
    assert _limiter is not None
    _limiter.acquire()

    response = client.models.generate_content(
        model=config.VISION_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            _PROMPT.replace("{page_number}", str(page_no)),
        ],
        config=types.GenerateContentConfig(
            # Extraction, not creative writing. Temperature 0 also makes the
            # eval numbers reproducible across runs.
            temperature=0.0,
            response_mime_type="application/json",
        ),
    )
    return response.text or ""


def extract_page(image_path: Path, page_no: int) -> tuple[Page | None, str]:
    """Read one page.

    Returns (page, raw_text). `page` is None when the response failed schema
    validation — the caller should persist raw_text and move on rather than
    aborting the whole document over one bad page.
    """
    raw = _call(image_path.read_bytes(), page_no)
    try:
        data = json.loads(raw)
        data.setdefault("page", page_no)
        return Page.model_validate(data), raw
    except (json.JSONDecodeError, ValueError):
        return None, raw
