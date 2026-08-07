"""Stage 4 — chunks to vectors.

Two things that are easy to get wrong and expensive to discover late:

1. `task_type`. Gemini's embedding model produces different vectors depending on
   whether the text is a document being stored or a question being asked. Chunks
   must use RETRIEVAL_DOCUMENT, the query path must use RETRIEVAL_QUERY. Getting
   this wrong does not error — it just quietly costs you retrieval quality.

2. `output_dimensionality`. Locked at 768 in config, matched by vector(768) in
   the schema. Changing it means re-embedding everything and altering the column.
"""

from __future__ import annotations

from google import genai
from google.genai import types
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from .. import config
from ..utils.apierrors import is_transient
from ..utils.ratelimit import RateLimiter

_BATCH = 32

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
    reraise=True,
)
def _embed_batch(texts: list[str], task_type: str) -> list[list[float]]:
    client = _get_client()
    assert _limiter is not None
    _limiter.acquire()

    response = client.models.embed_content(
        model=config.EMBED_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=config.EMBED_DIM,
        ),
    )
    return [e.values for e in response.embeddings]


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed chunk text for storage."""
    out: list[list[float]] = []
    for i in range(0, len(texts), _BATCH):
        out.extend(_embed_batch(texts[i : i + _BATCH], "RETRIEVAL_DOCUMENT"))
    return out


def embed_query(text: str) -> list[float]:
    """Embed a question. Used by the eval harness; the app does this in TS."""
    return _embed_batch([text], "RETRIEVAL_QUERY")[0]
