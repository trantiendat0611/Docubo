"""Ingest CLI.

    python -m ingest.main spike  data/raw/paper.pdf --pages 12,31,44
    python -m ingest.main render data/raw/paper.pdf
    python -m ingest.main vision data/raw/paper.pdf
    python -m ingest.main index  data/raw/paper.pdf
    python -m ingest.main all    data/raw/paper.pdf

The stages are separate subcommands on purpose. `vision` is the only one that
spends quota, and it never re-reads a page that is already cached — so `index`
can be re-run as many times as you like while tuning the chunker.

Start with `spike`: it runs vision on a handful of pages and prints the result
for a human to judge, without touching the database.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from google.genai import errors
from tqdm import tqdm

from . import config
from .pipeline import cache, chunk, embed, render, store, vision
from .pipeline.models import Document
from .utils.apierrors import explain


def _resolve(pdf: str) -> Path:
    p = Path(pdf)
    if not p.is_absolute():
        p = config.ROOT / p
    if not p.exists():
        raise SystemExit(f"Not found: {p}")
    return p


def cmd_models(args: argparse.Namespace) -> None:
    """Which models can this API key actually call?

    Free-tier model availability changes over time — a model that worked last
    month can start returning 429 with `limit: 0`. This is the first thing to
    run when that happens.
    """
    from google import genai

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    generate: list[str] = []
    embed_models: list[str] = []
    for m in client.models.list():
        actions = list(getattr(m, "supported_actions", None) or [])
        name = (m.name or "").removeprefix("models/")
        if "generateContent" in actions:
            generate.append(name)
        if "embedContent" in actions:
            embed_models.append(name)

    print(
        f"Currently configured: vision={config.VISION_MODEL} embed={config.EMBED_MODEL}\n"
    )
    print("generateContent:")
    for n in generate:
        print(f"  {n}")
    print("\nembedContent:")
    for n in embed_models:
        print(f"  {n}")
    print(
        "\nListed here means the model exists, not that your key has free-tier "
        "quota for it.\nTo confirm quota, set it in .env and run `spike` on one "
        "page."
    )


def cmd_checkdb(args: argparse.Namespace) -> None:
    """Confirm the SQL migrations landed, before spending any quota on ingest."""
    results = store.check_schema()
    for label, ok, detail in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {label:22} {detail}")

    if all(ok for _, ok, _ in results):
        print("\nDatabase ready. Next: python -m ingest.main all <pdf>")
        return

    raise SystemExit(
        "\nSomething is missing. Run db/001_schema.sql, db/002_hybrid_search.sql\n"
        "and db/003_security.sql in the Supabase SQL editor, in that order.\n"
        "If a table passes but an RPC fails, only 002 needs re-running."
    )


def cmd_query(args: argparse.Namespace) -> None:
    """Retrieval only — no generation, no quota beyond one embedding call.

    Use this to sanity-check retrieval after an ingest, and to compare hybrid
    against dense-only when tuning.
    """
    vector = embed.embed_query(args.question)
    results = store.search(vector, args.query_en or args.question, args.question)

    if not results:
        print("No results. Either the corpus is empty or nothing matched.")
        return

    print(f"query: {args.question}\n")
    for i, r in enumerate(results, start=1):
        pages = (
            f"p.{r['page_start']}"
            if r["page_start"] == r["page_end"]
            else f"p.{r['page_start']}-{r['page_end']}"
        )
        snippet = " ".join(r["display_text"].split())[:150]
        print(
            f"[{i}] rrf={r['rrf_score']:.5f}  cos={r['cosine_sim']:.3f}  "
            f"{r['filename']} {pages} ({r['lang']})\n    {snippet}…\n"
        )

    top = results[0]["cosine_sim"]
    verdict = (
        "would answer"
        if top >= config.MIN_COSINE
        else f"would REFUSE (below MIN_COSINE={config.MIN_COSINE})"
    )
    print(f"top cosine {top:.3f} -> {verdict}")


def cmd_render(args: argparse.Namespace) -> None:
    pdf = _resolve(args.pdf)
    paths = render.render(pdf)
    print(f"{len(paths)} pages -> {paths[0].parent}")


def cmd_vision(args: argparse.Namespace) -> None:
    pdf = _resolve(args.pdf)
    slug = render.doc_slug(pdf)
    paths = render.render(pdf)

    todo = [(i, p) for i, p in enumerate(paths, start=1) if not cache.has(slug, i)]
    print(f"{len(paths)} pages, {len(todo)} need vision, {len(paths) - len(todo)} cached")
    if not todo:
        return

    failed: dict[str, list[int]] = {"recitation": [], "schema": []}
    by_model: Counter[str] = Counter()

    for page_no, image_path in tqdm(todo, desc="vision"):
        page, raw, failure = vision.extract_page(image_path, page_no)
        if page is None:
            failed[failure].append(page_no)
            if raw:
                cache.save_raw(slug, page_no, raw)
            continue
        by_model[page.extracted_by] += 1
        cache.save(slug, page)

    done = len(todo) - len(failed["recitation"]) - len(failed["schema"])
    print(f"\nextracted {done}/{len(todo)} pages")

    if by_model:
        print("by model: " + ", ".join(f"{m} {n}" for m, n in by_model.most_common()))

    spent = vision.exhausted_models()
    if spent:
        print(
            f"daily quota spent on: {', '.join(spent)}\n"
            "Each model has its own per-day budget. Add more to "
            "GEMINI_VISION_MODELS in .env,\nor re-run tomorrow — cached pages "
            "are skipped."
        )

    if failed["recitation"]:
        print(
            f"\n{len(failed['recitation'])} pages refused as recitation: "
            f"{failed['recitation']}\n"
            "Every configured model declined to transcribe these as memorised "
            "published text.\nThey are not in the corpus and questions about "
            "them will be refused. Note the count\nin REQUIREMENTS.md as a "
            "coverage limitation."
        )

    if failed["schema"]:
        print(
            f"\n{len(failed['schema'])} pages failed schema validation: "
            f"{failed['schema']}\n"
            "Raw responses saved as *.raw.txt in the cache dir. Fix the prompt, "
            "delete nothing\nelse, and re-run — cached pages are skipped."
        )


def cmd_index(args: argparse.Namespace) -> None:
    pdf = _resolve(args.pdf)
    slug = render.doc_slug(pdf)

    pages = cache.load_all(slug)
    if not pages:
        raise SystemExit("No cached pages. Run the `vision` stage first.")

    chunks = chunk.build_chunks(pages)
    print(f"{len(pages)} pages -> {len(chunks)} chunks")
    if not chunks:
        raise SystemExit("Chunker produced nothing — check the cached markdown.")

    lang = chunk.dominant_lang(pages)
    print(
        f"language: {lang}  |  with formula: "
        f"{sum(c.has_formula for c in chunks)}  |  with figure: "
        f"{sum(c.has_figure for c in chunks)}"
    )

    if args.dry_run:
        print("\n--- first chunk, both representations ---")
        print("[display_text]\n" + chunks[0].display_text[:600])
        print("\n[embed_text]\n" + chunks[0].embed_text[:600])
        return

    vectors = embed.embed_documents([c.embed_text for c in chunks])

    doc_id = store.upsert_document(
        Document(
            filename=pdf.name,
            title=args.title or pdf.stem,
            source_url=args.source_url,
            lang=lang,
            n_pages=len(pages),
            content_hash=render.content_hash(pdf),
        )
    )
    n = store.replace_chunks(doc_id, chunks, vectors)
    print(f"stored {n} chunks under document {doc_id}")


def cmd_spike(args: argparse.Namespace) -> None:
    """Week-1 sanity check: does the model actually read this document?

    Pick the hardest pages you have — one dense with equations, one with a
    chart, one plain prose — and read the output yourself before committing to
    this architecture.
    """
    pdf = _resolve(args.pdf)
    slug = render.doc_slug(pdf)
    paths = render.render(pdf)

    wanted = [int(x) for x in args.pages.split(",")] if args.pages else [1, 2, 3]
    for page_no in wanted:
        if page_no < 1 or page_no > len(paths):
            print(f"page {page_no} out of range (1..{len(paths)})")
            continue

        page, raw, failure = vision.extract_page(paths[page_no - 1], page_no)
        print("\n" + "=" * 70)
        print(f"PAGE {page_no}   image: {paths[page_no - 1]}")
        print("=" * 70)

        if failure == "recitation":
            print(
                "REFUSED AS RECITATION by every model in the chain "
                f"({', '.join(config.VISION_MODELS)}).\n"
                "They will not transcribe this page as memorised published "
                "text.\nAdd another model to GEMINI_VISION_MODELS, or accept "
                "the page as outside\nthe corpus."
            )
            continue

        if page is None:
            print("SCHEMA FAILURE. Raw response:\n")
            print(raw[:2000])
            cache.save_raw(slug, page_no, raw)
            continue

        print(
            f"lang={page.lang}  boilerplate={page.is_boilerplate}  "
            f"formulas={len(page.formulas)}  figures={len(page.figures)}  "
            f"model={page.extracted_by}\n"
        )
        print("--- markdown ---")
        print(page.markdown[:1500])
        for f in page.formulas[:3]:
            print(f"\n--- {f.id} ---\n  latex: {f.latex}\n  plain: {f.plain}")
        for g in page.figures[:2]:
            print(
                f"\n--- {g.id} ({g.kind}) ---\n  caption: {g.caption}"
                f"\n  description: {g.description[:300]}\n  data: {g.data[:300]}"
            )

        out = config.CACHE_DIR / f"spike-{slug}-p{page_no:04d}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page.model_dump_json(indent=2), encoding="utf-8")
        print(f"\nsaved: {out}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="ingest")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("models")
    sub.add_parser("check-db")

    q = sub.add_parser("query")
    q.add_argument("question")
    q.add_argument(
        "--query-en",
        help="English phrasing for the fts_en arm. In the app the guardrail "
        "call produces this; here you supply it to test cross-lingual "
        "retrieval.",
    )

    for name in ("render", "vision", "index", "spike", "all"):
        p = sub.add_parser(name)
        p.add_argument("pdf")
        if name in ("index", "all"):
            p.add_argument("--title")
            p.add_argument("--source-url")
            p.add_argument("--dry-run", action="store_true")
        if name == "spike":
            p.add_argument("--pages", help="comma-separated, e.g. 12,31,44")

    args = parser.parse_args(argv)
    config.assert_ready(need_supabase=args.cmd in ("index", "all", "check-db", "query"))

    handlers = {
        "models": cmd_models,
        "check-db": cmd_checkdb,
        "query": cmd_query,
        "render": cmd_render,
        "vision": cmd_vision,
        "index": cmd_index,
        "spike": cmd_spike,
    }
    try:
        if args.cmd == "all":
            cmd_vision(args)
            cmd_index(args)
        else:
            handlers[args.cmd](args)
    except errors.APIError as exc:
        # A traceback here tells the reader nothing they can act on. The status
        # code does.
        raise SystemExit(explain(exc, config.VISION_MODEL)) from exc


if __name__ == "__main__":
    main(sys.argv[1:])
