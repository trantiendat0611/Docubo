"""Faithfulness judge — is every claim in an answer supported by its context?

Reuses config.VISION_MODELS as the judge's model chain. These are the exact
models src/lib/gemini.ts rotates through for chat generation, so a model that
answered the question is a model whose daily budget the judge call also draws
from — deliberately, not incidentally: it is the same free-tier wall.

Text-only, so the two vision-specific complications in
ingest/pipeline/vision.py do not apply here: no batching (one judgment per
question) and no RECITATION (a judge call sends no page image, so there is
nothing for the model to recognise as memorised published text). What does
carry over unchanged is daily-quota rotation, because requests-per-day is
per model regardless of what the request contains.
"""

from __future__ import annotations

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field
from tenacity import retry, retry_if_exception, stop_after_attempt

from ingest import config
from ingest.pipeline.vision import _repair_escapes
from ingest.utils.apierrors import is_daily_quota, is_transient, wait_as_api_asked

from .metrics import FAITHFULNESS_PROMPT

_client: genai.Client | None = None

#: Separate from ingest.pipeline.vision._EXHAUSTED on purpose. A full run with
#: --judge spends both vision-shaped and judge-shaped calls against the same
#: models in the same process, and a model already exhausted by ingest earlier
#: today is not necessarily exhausted for judging right now if this run starts
#: a fresh process — conflating the two sets would carry ingest's exhaustion
#: into a job that never made an ingest call.
_EXHAUSTED: set[str] = set()


class FaithfulnessJudgment(BaseModel):
    """The judge's response schema, passed to the API as response_schema."""

    n_claims: int
    n_supported: int
    unsupported: list[str] = Field(default_factory=list)
    score: float


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _chain() -> list[str]:
    return [m for m in config.VISION_MODELS if m not in _EXHAUSTED]


def build_context(chunks: list[dict]) -> str:
    """Same block shape as buildContext in src/lib/prompt.ts.

    The judge must see exactly what the generator saw, block numbers included
    — FAITHFULNESS_PROMPT asks it to grade against CONTEXT, and a differently
    shaped context would be grading a different question.

    `chunks` must already be in citation order (n=1 first): the caller looks
    each citation's chunkId up in a dict, which does not preserve order on its
    own.
    """
    blocks = []
    for i, c in enumerate(chunks, start=1):
        pages = (
            f"p.{c['page_start']}"
            if c["page_start"] == c["page_end"]
            else f"p.{c['page_start']}-{c['page_end']}"
        )
        blocks.append(
            f'<block n="{i}" source="{c["filename"]}" pages="{pages}">\n'
            f"{c['display_text']}\n</block>"
        )
    return "\n\n".join(blocks)


@retry(
    stop=stop_after_attempt(5),
    wait=wait_as_api_asked,
    retry=retry_if_exception(is_transient),
    reraise=True,
)
def _call(model: str, context: str, question: str, answer: str) -> tuple[str, str]:
    """One judge request. Returns (text, finish_reason) — mirrors
    ingest/pipeline/vision.py's _call, for the same reason: finish_reason is
    the only way to tell RECITATION (empty text, real refusal, worth trying
    the next model) apart from any other cause of empty text.
    """
    client = _get_client()
    response = client.models.generate_content(
        model=model,
        contents=(
            f"{FAITHFULNESS_PROMPT}\nCONTEXT:\n{context}\n\n"
            f"QUESTION:\n{question}\n\nANSWER:\n{answer}"
        ),
        config=types.GenerateContentConfig(
            # Grading, not creative writing — and 0 keeps repeat runs on the
            # same report comparable.
            temperature=0.0,
            response_mime_type="application/json",
            response_schema=FaithfulnessJudgment,
        ),
    )
    finish = ""
    if response.candidates:
        finish = str(response.candidates[0].finish_reason or "")
    return response.text or "", finish


def judge(
    context: str, question: str, answer: str
) -> tuple[FaithfulnessJudgment | None, str | None]:
    """Grade one answer against its context, rotating models on a spent day.

    Returns (judgment, reason). reason is None on success, otherwise the
    cause the *last* model tried gave up for:

        "daily_quota"   every model reachable has spent today's budget
        "recitation"    the model refused as memorised published text — a
                         real risk here, not just at ingest: CONTEXT and
                         ANSWER both reproduce document text close to
                         verbatim, per the grounding prompt's instruction to
                         reproduce formulas exactly, which is the same shape
                         of input that trips RECITATION on page images
        "empty"         a model returned nothing and it was not RECITATION
        "unparseable"   a model answered but never valid JSON, even after
                         the same escape repair vision.py uses

    None for the judgment (not a score of 0) either way: a missing judgment
    and a genuinely unfaithful answer are different failures, and averaging
    them together would make faithfulness look worse than it is for a reason
    that has nothing to do with grounding. The reason exists so a run that
    comes back all-unscored says why instead of leaving that to be guessed —
    quota and RECITATION need opposite reactions (wait for reset vs nothing
    to be done), and this codebase has been burned before by exactly that
    kind of default error message being useless.
    """
    reason: str | None = None

    for model in _chain():
        try:
            raw, finish = _call(model, context, question, answer)
        except errors.ClientError as exc:
            if not is_daily_quota(exc):
                raise
            _EXHAUSTED.add(model)
            reason = "daily_quota"
            continue

        if not raw.strip():
            reason = "recitation" if "RECITATION" in finish else "empty"
            continue

        judgment = _parse(raw)
        if judgment is not None:
            return judgment, None
        reason = "unparseable"

    return None, reason


def _parse(raw: str) -> FaithfulnessJudgment | None:
    """Validate the judge's JSON, repairing the one failure mode known to
    recur: `unsupported` quotes claims verbatim from the answer, and an
    answer is free to contain raw LaTeX (the grounding prompt requires
    reproducing formulas exactly). A quoted `\\alpha` or `\\frac` is the same
    bad-JSON-escape trap ingest/pipeline/vision.py exists to repair, just
    arriving from a different direction — the source there is a page image,
    here it is the model's own prior answer.
    """
    for candidate in (raw, _repair_escapes(raw)):
        try:
            return FaithfulnessJudgment.model_validate_json(candidate)
        except ValueError:
            continue
    return None
