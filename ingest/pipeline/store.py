"""Stage 5 — persist to Supabase.

Uses the service_role key, so this module must never be imported by anything
that runs in a browser.
"""

from __future__ import annotations

from supabase import Client, create_client

from .. import config
from .models import Chunk, Document

_client: Client | None = None


def _get() -> Client:
    global _client
    if _client is None:
        _client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
    return _client


def find_document(content_hash: str) -> dict | None:
    res = (
        _get()
        .table("documents")
        .select("*")
        .eq("content_hash", content_hash)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def upsert_document(doc: Document) -> str:
    existing = find_document(doc.content_hash)
    if existing:
        return existing["id"]
    res = _get().table("documents").insert(doc.model_dump()).execute()
    return res.data[0]["id"]


def replace_chunks(
    document_id: str, chunks: list[Chunk], vectors: list[list[float]]
) -> int:
    """Delete this document's chunks and insert the new set.

    Replace rather than upsert: a chunking change shifts every boundary, so
    chunk_index N in the new run is not the same content as chunk_index N in the
    old one. Leaving stale rows behind silently poisons retrieval.
    """
    client = _get()
    client.table("chunks").delete().eq("document_id", document_id).execute()

    rows = [
        {
            "document_id": document_id,
            "chunk_index": c.chunk_index,
            "page_start": c.page_start,
            "page_end": c.page_end,
            "lang": c.lang,
            "display_text": c.display_text,
            "embed_text": c.embed_text,
            "embedding": v,
            "has_formula": c.has_formula,
            "has_figure": c.has_figure,
            "figure_refs": [f.model_dump() for f in c.figure_refs],
            "n_tokens": c.n_tokens,
        }
        for c, v in zip(chunks, vectors, strict=True)
    ]

    for i in range(0, len(rows), 100):
        client.table("chunks").insert(rows[i : i + 100]).execute()
    return len(rows)
