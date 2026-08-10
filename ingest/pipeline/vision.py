"""Stage 2 — page image to structured content, via Gemini.

The only stage that spends vision quota. Everything it returns is cached to
disk by the caller before any downstream stage runs.

Several pages per request, with each image preceded by a label naming its page
number. Sending the whole PDF as one blob would be cheaper still but loses
reliable page attribution, and page numbers are what the citations point at —
labelled batching keeps attribution while cutting requests, which is the only
quota dimension that actually binds.

A batch is all-or-nothing: one page tripping RECITATION voids the response for
the rest. `extract_batch` therefore returns whatever parsed, and the caller
retries the gaps one page at a time.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from google import genai
from google.genai import errors, types
from tenacity import retry, retry_if_exception, stop_after_attempt

from .. import config
from ..utils.apierrors import is_daily_quota, is_transient, wait_as_api_asked
from ..utils.ratelimit import RateLimiter
from .models import BatchExtraction, Page, PageExtraction

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "page_extract.md"
_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_client: genai.Client | None = None
_limiter: RateLimiter | None = None

#: Models that have spent their daily budget during this run. Process-lifetime
#: only — the quota resets overnight, so persisting it would be wrong.
_EXHAUSTED: set[str] = set()


def _chain() -> list[str]:
    """Models still worth trying, primary first and twice (see config)."""
    ordered = [config.VISION_MODELS[0], *config.VISION_MODELS]
    return [m for m in ordered if m not in _EXHAUSTED]


def exhausted_models() -> list[str]:
    """For the CLI to report which models ran out."""
    return sorted(_EXHAUSTED)


def _get_client() -> genai.Client:
    global _client, _limiter
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
        _limiter = RateLimiter(config.RPM)
    return _client


@retry(
    # Generous, because each attempt now waits exactly as long as the server
    # asked. A 300-page run that dies at page 180 has wasted far more than the
    # few minutes these retries can cost.
    stop=stop_after_attempt(8),
    wait=wait_as_api_asked,
    retry=retry_if_exception(is_transient),
    # Surface the original API error, not tenacity's RetryError wrapper — the
    # caller needs the status code to say anything useful about it.
    reraise=True,
)
def _call(items: list[tuple[Path, int]], model: str) -> tuple[str, str]:
    """One vision request covering one or more pages. Returns (text, finish)."""
    client = _get_client()
    assert _limiter is not None
    _limiter.acquire()

    if len(items) == 1:
        instruction = f"The page number for this image is: {items[0][1]}"
        schema: type = PageExtraction
    else:
        instruction = (
            'You receive SEVERAL page images. Return {"pages": [...]} with one '
            'object per image, in the order given. Set each object\'s "page" '
            "field to the page number stated in the label immediately before "
            "its image. Do not merge pages, do not skip pages, and do not "
            "reorder them."
        )
        schema = BatchExtraction

    contents: list[object] = [_PROMPT.replace("{page_instruction}", instruction)]
    for path, page_no in items:
        if len(items) > 1:
            contents.append(f"--- PAGE {page_no} ---")
        contents.append(
            types.Part.from_bytes(data=path.read_bytes(), mime_type="image/png")
        )

    response = client.models.generate_content(
        model=model,
        contents=contents,
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
            response_schema=schema,
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


def _load(raw: str) -> object | None:
    for candidate in (raw, _repair_escapes(raw)):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    return None


def _parse(raw: str, page_no: int) -> Page | None:
    data = _load(raw)
    if not isinstance(data, dict):
        return None
    try:
        data.setdefault("page", page_no)
        return Page.model_validate(data)
    except ValueError:
        return None


def _parse_batch(raw: str, expected: list[int]) -> dict[int, Page]:
    """Pull whatever pages came back, keyed by page number.

    Tolerant on purpose: a batch that returns six of eight pages is still six
    pages saved. The caller retries whatever is missing one page at a time.
    """
    data = _load(raw)
    if not isinstance(data, dict):
        return {}

    wanted = set(expected)
    out: dict[int, Page] = {}
    for i, entry in enumerate(data.get("pages") or []):
        if not isinstance(entry, dict):
            continue
        # Positional order is a fallback for an *omitted* page number, not a
        # correction for a wrong one. Rewriting a number the model actually
        # stated would silently file content under the wrong page, and page
        # numbers are what the citations point at.
        if not entry.get("page") and i < len(expected):
            entry["page"] = expected[i]
        try:
            page = Page.model_validate(entry)
        except ValueError:
            continue
        if page.page in wanted:
            out[page.page] = page
    return out


def extract_page(image_path: Path, page_no: int) -> tuple[Page | None, str, str]:
    """Read one page, falling back to a second model when the first refuses.

    Returns (page, raw_text, failure). `failure` is "" on success, otherwise:

        "recitation"  every model refused to transcribe the page as memorised
                      published text. The page is unrecoverable by this route.
        "schema"      a model answered but the JSON did not validate. Inspect
                      the saved raw response and fix the prompt.

    A failure is never fatal — one bad page must not abort a 300-page document.
    """
    last_raw = ""
    saw_output = False

    for model in _chain():
        try:
            raw, finish = _call([(image_path, page_no)], model)
        except errors.ClientError as exc:
            if not is_daily_quota(exc):
                raise
            # This model is finished for the day. Retire it for the rest of the
            # run and try the next one — waiting would not help, the budget
            # resets tomorrow.
            _EXHAUSTED.add(model)
            if not _chain():
                raise
            continue

        # RECITATION comes back with no text at all, so there is nothing to
        # parse — move to the next attempt.
        if "RECITATION" in finish or not raw.strip():
            continue

        saw_output = True
        last_raw = raw
        page = _parse(raw, page_no)
        if page is not None:
            page.extracted_by = model
            return page, raw, ""

    return None, last_raw, "schema" if saw_output else "recitation"


def extract_batch(items: list[tuple[Path, int]]) -> dict[int, Page]:
    """Read several pages in one request. Returns only what came back cleanly.

    Never raises on a partial result — the caller is expected to retry missing
    pages individually, which is also the recovery path when one page in the
    batch trips RECITATION and takes the whole response with it.

    Daily-quota errors still propagate through the model chain the same way as
    for single pages.
    """
    if not items:
        return {}
    if len(items) == 1:
        page, _, _ = extract_page(items[0][0], items[0][1])
        return {items[0][1]: page} if page else {}

    expected = [n for _, n in items]

    for model in _chain():
        try:
            raw, finish = _call(items, model)
        except errors.ClientError as exc:
            if not is_daily_quota(exc):
                raise
            _EXHAUSTED.add(model)
            if not _chain():
                raise
            continue

        if "RECITATION" in finish or not raw.strip():
            continue

        found = _parse_batch(raw, expected)
        if found:
            for page in found.values():
                page.extracted_by = model
            return found

    return {}
