"""Turning Gemini API failures into something actionable.

The raw failure for an exhausted quota is a forty-line traceback ending in
`tenacity.RetryError`, with the one sentence that matters buried in the middle.
Worse, tenacity retries it four times with exponential backoff first — so you
wait two minutes to be told nothing useful.

Two distinctions this module draws:

  transient   a real rate limit. Backing off and retrying works.
  permanent   `limit: 0` — the project has no quota for this model at all,
              usually because the model was retired from the free tier.
              Retrying can never succeed.
"""

from __future__ import annotations

import re

from google.genai import errors
from tenacity import wait_exponential

#: Google returns the wait it wants in a RetryInfo detail, and repeats it in
#: prose. Either form is more reliable than guessing.
_RETRY_DELAY = re.compile(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)s")
_RETRY_PROSE = re.compile(r"retry in (\d+(?:\.\d+)?)s")


def is_zero_quota(exc: BaseException) -> bool:
    """True for a 429 that means 'no quota for this model', not 'slow down'."""
    return isinstance(exc, errors.ClientError) and "limit: 0" in str(exc)


def is_daily_quota(exc: BaseException) -> bool:
    """True when the model's requests-per-DAY budget is gone.

    Worth separating from a per-minute limit because the response looks the
    same — a 429 carrying a retryDelay of about thirty seconds — while the
    correct reaction is the opposite. Waiting thirty seconds achieves nothing;
    the quota returns tomorrow.

    Free tier gives `gemini-3.5-flash` twenty requests per day. Since the quota
    is per model, the useful move is to switch models, not to wait.
    """
    return isinstance(exc, errors.ClientError) and (
        "GenerateRequestsPerDayPerProjectPerModel" in str(exc)
    )


def is_transient(exc: BaseException) -> bool:
    """Retry predicate. Per-minute rate limits yes; everything else no."""
    if isinstance(exc, errors.ServerError):
        return True
    if isinstance(exc, errors.ClientError):
        if exc.code != 429:
            return False
        return not is_zero_quota(exc) and not is_daily_quota(exc)
    return False


def retry_delay_seconds(exc: BaseException) -> float | None:
    """The wait Google asked for, if it said."""
    text = str(exc)
    for pattern in (_RETRY_DELAY, _RETRY_PROSE):
        m = pattern.search(text)
        if m:
            return float(m.group(1))
    return None


def wait_as_api_asked(retry_state) -> float:
    """Tenacity wait strategy: obey the server, fall back to exponential.

    The binding free-tier quota for vision ingest is input *tokens* per minute,
    not requests — a run pacing itself at 6 requests/minute still hit the limit,
    because each page image is roughly 1900 input tokens. A request-per-minute
    limiter cannot see that coming.

    Rather than model every quota dimension, honour the retryDelay the API
    returns. It is authoritative about whichever limit was actually hit, and it
    adapts on its own when Google changes the tiers.
    """
    exc = retry_state.outcome.exception() if retry_state.outcome else None
    hinted = retry_delay_seconds(exc) if exc is not None else None
    if hinted is not None:
        # A small margin: the server's window and ours are not aligned, and
        # coming back one second early wastes the whole wait.
        return hinted + 2.0
    return wait_exponential(min=2, max=60)(retry_state)


def explain(exc: BaseException, model: str) -> str:
    """A message that tells the reader what to actually do next."""
    if is_zero_quota(exc):
        return (
            f"\nModel '{model}' has no free-tier quota on this API key.\n"
            f"'limit: 0' means the model is not available to your project at "
            f"all — it is not a temporary rate limit, so retrying will not "
            f"help. The model was most likely retired from the free tier.\n\n"
            f"List the models your key can actually call:\n"
            f"  .venv/Scripts/python -m ingest.main models\n\n"
            f"Then set GEMINI_VISION_MODEL in .env to one of them."
        )

    if is_daily_quota(exc):
        return (
            "\nEvery configured model has spent its daily request quota.\n"
            "Free tier grants each model its own per-day budget — 20 requests "
            "for gemini-3.5-flash — so ingest rotates through the chain and "
            "has now exhausted all of it.\n\n"
            "Cached pages are safe. Re-run tomorrow and it resumes where it "
            "stopped.\nTo go faster, add more models to GEMINI_VISION_MODELS "
            "in .env — each one\nbrings its own daily budget. List candidates "
            "with:\n  .venv/Scripts/python -m ingest.main models"
        )

    if isinstance(exc, errors.ClientError) and exc.code == 429:
        return (
            f"\nRate limited on '{model}' after several retries.\n"
            f"Lower GEMINI_RPM in .env and re-run.\n"
            f"Pages already cached are safe — re-running skips them."
        )

    if isinstance(exc, errors.ClientError) and exc.code in (401, 403):
        return (
            f"\nGEMINI_API_KEY was rejected ({exc.code}).\n"
            f"Check the key in .env, or create a new one at "
            f"https://aistudio.google.com"
        )

    if isinstance(exc, errors.ClientError) and exc.code == 404:
        return (
            f"\nModel '{model}' does not exist.\n"
            f"Run:  .venv/Scripts/python -m ingest.main models"
        )

    return f"\nAPI call to '{model}' failed: {type(exc).__name__}: {exc}"
