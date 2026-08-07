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
import re
from pathlib import Path

from google import genai
from google.genai import types
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from .. import config
from ..utils.apierrors import is_transient
from ..utils.ratelimit import RateLimiter
from .models import Page, PageExtraction

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


@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(min=2, max=60),
    retry=retry_if_exception(is_transient),
    # Surface the original API error, not tenacity's RetryError wrapper — the
    # caller needs the status code to say anything useful about it.
    reraise=True,
)
def _call(image_bytes: bytes, page_no: int, model: str) -> tuple[str, str]:
    """One vision request. Returns (text, finish_reason)."""
    client = _get_client()
    assert _limiter is not None
    _limiter.acquire()

    response = client.models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            _PROMPT.replace("{page_number}", str(page_no)),
        ],
        config=types.GenerateContentConfig(
            # Extraction, not creative writing. Temperature 0 also makes the
            # eval numbers reproducible across runs.
            temperature=0.0,
            response_mime_type="application/json",
            # Load-bearing, not a nicety. Asking for JSON by mime type alone,
            # the model emits LaTeX backslashes unescaped — `\prod` instead of
            # `\\prod` — and `\p` is not a legal JSON escape, so the whole page
            # fails to parse. Constraining generation to the schema makes the
            # backend produce correctly escaped strings. Verified on a page of
            # graphical-model equations that failed without it.
            response_schema=PageExtraction,
            max_output_tokens=config.MAX_OUTPUT_TOKENS,
        ),
    )
    finish = ""
    if response.candidates:
        finish = str(response.candidates[0].finish_reason or "")
    return response.text or "", finish


#: A backslash not starting a legal JSON escape. LaTeX is full of these:
#: \prod, \psi, \mathcal all produce sequences json.loads rejects.
_BAD_ESCAPE = re.compile(r'\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})')


def _repair_escapes(raw: str) -> str:
    """Double any backslash that is not part of a valid JSON escape.

    Safety net only — `response_schema` should prevent this from ever being
    needed. Kept because losing a page of dense equations to one stray
    backslash is a bad trade for four lines of code.
    """
    return _BAD_ESCAPE.sub(r"\\\\", raw)


def _parse(raw: str, page_no: int) -> Page | None:
    for candidate in (raw, _repair_escapes(raw)):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        try:
            data.setdefault("page", page_no)
            return Page.model_validate(data)
        except ValueError:
            return None
    return None


def extract_page(image_path: Path, page_no: int) -> tuple[Page | None, str, str]:
    """Read one page, falling back to a second model when the first refuses.

    Returns (page, raw_text, failure). `failure` is "" on success, otherwise:

        "recitation"  every model refused to transcribe the page as memorised
                      published text. The page is unrecoverable by this route.
        "schema"      a model answered but the JSON did not validate. Inspect
                      the saved raw response and fix the prompt.

    A failure is never fatal — one bad page must not abort a 300-page document.
    """
    data = image_path.read_bytes()
    models = [config.VISION_MODEL]
    if config.FALLBACK_VISION_MODEL != config.VISION_MODEL:
        models.append(config.FALLBACK_VISION_MODEL)

    last_raw = ""
    saw_output = False

    for model in models:
        raw, finish = _call(data, page_no, model)

        # RECITATION means the model will not transcribe this page at all, and
        # it returns no text with it. Retrying the same model is pointless —
        # the refusal holds across temperatures — so go straight to the next.
        if "RECITATION" in finish or not raw.strip():
            continue

        saw_output = True
        last_raw = raw
        page = _parse(raw, page_no)
        if page is not None:
            page.extracted_by = model
            return page, raw, ""

    return None, last_raw, "schema" if saw_output else "recitation"
