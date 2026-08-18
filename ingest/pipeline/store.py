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


def check_schema() -> list[tuple[str, bool, str]]:
    """Verify the database is ready, without ingesting anything.

    Every check exercises something that only fails at runtime: the tables, the
    pgvector column type, and both RPCs. Running this after the SQL migrations
    turns 200+ lines of never-executed SQL into something known-good.

    Returns (label, ok, detail) rows so the caller can print them all rather
    than aborting on the first failure.
    """
    rows: list[tuple[str, bool, str]] = []
    client = _get()

    for table in ("documents", "chunks", "query_log"):
        try:
            res = client.table(table).select("*", count="exact").limit(1).execute()
            rows.append((f"table {table}", True, f"{res.count} rows"))
        except Exception as exc:
            rows.append((f"table {table}", False, str(exc)[:120]))

    # A non-zero probe vector: cosine distance against an all-zero vector is
    # undefined, and an empty table would hide the problem until the first real
    # query.
    probe = [1.0] + [0.0] * (config.EMBED_DIM - 1)

    try:
        client.rpc(
            "hybrid_search",
            {
                "query_embedding": probe,
                "query_en": "test query",
                "query_vi": "câu hỏi thử",
                "match_limit": 1,
                "candidate_limit": 5,
                "rrf_k": 60,
                "filter_documents": None,
            },
        ).execute()
        rows.append(("rpc hybrid_search", True, "callable"))
    except Exception as exc:
        rows.append(("rpc hybrid_search", False, str(exc)[:200]))

    try:
        client.rpc("dense_search", {"query_embedding": probe, "match_limit": 1}).execute()
        rows.append(("rpc dense_search", True, "callable"))
    except Exception as exc:
        rows.append(("rpc dense_search", False, str(exc)[:200]))

    return rows


def search(
    query_embedding: list[float],
    query_en: str,
    query_vi: str,
    match_limit: int = config.MATCH_LIMIT,
) -> list[dict]:
    """Call the hybrid_search RPC.

    The query path proper lives in TypeScript; this exists so retrieval can be
    exercised and measured without the web app running — which is what the eval
    harness needs for --retrieval-only.
    """
    res = (
        _get()
        .rpc(
            "hybrid_search",
            {
                "query_embedding": query_embedding,
                "query_en": query_en,
                "query_vi": query_vi,
                "match_limit": match_limit,
                "candidate_limit": config.CANDIDATE_LIMIT,
                "rrf_k": config.RRF_K,
                "filter_documents": None,
            },
        )
        .execute()
    )
    return res.data or []


def dense_search(
    query_embedding: list[float],
    match_limit: int = config.MATCH_LIMIT,
) -> list[dict]:
    """Vector similarity only, no lexical arms.

    Exists so the contribution of the full-text arms can be measured rather
    than assumed. Reporting hybrid numbers without this comparison says nothing
    about whether the extra complexity earned its place.
    """
    res = (
        _get()
        .rpc(
            "dense_search",
            {"query_embedding": query_embedding, "match_limit": match_limit},
        )
        .execute()
    )
    return res.data or []


def chunks_by_id(ids: list[int]) -> dict[int, dict]:
    """Chunks by primary key, keyed by id, filename joined in from documents.

    Citations returned by /api/chat now carry chunkId (src/lib/types.ts)
    precisely so a caller can reload this exact text later — the eval
    faithfulness judge needs the same context blocks the generator actually
    saw, and re-running retrieval is not guaranteed to return the same rows
    (ranking depends on the query embedding, which is not reproducible byte
    for byte).
    """
    if not ids:
        return {}
    res = (
        _get()
        .table("chunks")
        .select("id, page_start, page_end, display_text, documents(filename)")
        .in_("id", ids)
        .execute()
    )
    out: dict[int, dict] = {}
    for row in res.data or []:
        doc = row.pop("documents", None) or {}
        row["filename"] = doc.get("filename", "")
        out[row["id"]] = row
    return out


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
    """Insert the document, or update the mutable fields if the file is known.

    Returning early on a content_hash match would be wrong: re-ingesting an
    unchanged file is exactly how an owner gets assigned to documents that were
    ingested before authentication existed. Skipping the update makes that
    command report success and change nothing.

    Chunk ownership follows automatically — replace_chunks deletes and reinserts
    every chunk, and the chunks_owner_trg trigger copies owner_id down from the
    document row this call just updated.
    """
    existing = find_document(doc.content_hash)
    if existing:
        patch = {
            field: value
            for field, value in (
                ("owner_id", doc.owner_id),
                ("title", doc.title),
                ("source_url", doc.source_url),
            )
            if value is not None
        }
        if patch:
            _get().table("documents").update(patch).eq("id", existing["id"]).execute()
        return existing["id"]

    res = _get().table("documents").insert(doc.model_dump()).execute()
    return res.data[0]["id"]


def owner_of(document_id: str) -> str | None:
    res = (
        _get()
        .table("documents")
        .select("owner_id")
        .eq("id", document_id)
        .limit(1)
        .execute()
    )
    return res.data[0]["owner_id"] if res.data else None


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
