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

from google.genai import errors


def is_zero_quota(exc: BaseException) -> bool:
    """True for a 429 that means 'no quota for this model', not 'slow down'."""
    return isinstance(exc, errors.ClientError) and "limit: 0" in str(exc)


def is_transient(exc: BaseException) -> bool:
    """Retry predicate. Rate limits yes, permanent denials and 4xx no."""
    if isinstance(exc, errors.ServerError):
        return True
    if isinstance(exc, errors.ClientError):
        return exc.code == 429 and not is_zero_quota(exc)
    return False


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

    if isinstance(exc, errors.ClientError) and exc.code == 429:
        return (
            f"\nRate limited on '{model}' after several retries.\n"
            f"Lower GEMINI_RPM in .env, or wait for the daily quota to reset.\n"
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
