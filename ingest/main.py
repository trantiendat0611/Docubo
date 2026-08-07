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
from pathlib import Path

from tqdm import tqdm

from . import config
from .pipeline import cache, chunk, embed, render, store, vision
from .pipeline.models import Document


def _resolve(pdf: str) -> Path:
    p = Path(pdf)
    if not p.is_absolute():
        p = config.ROOT / p
    if not p.exists():
        raise SystemExit(f"Not found: {p}")
    return p


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

    failures: list[int] = []
    for page_no, image_path in tqdm(todo, desc="vision"):
        page, raw = vision.extract_page(image_path, page_no)
        if page is None:
            failures.append(page_no)
            cache.save_raw(slug, page_no, raw)
            continue
        cache.save(slug, page)

    if failures:
        print(f"\n{len(failures)} pages failed schema validation: {failures}")
        print("Raw responses saved as *.raw.txt in the cache dir. Fix the prompt,")
        print("delete nothing else, and re-run — cached pages will be skipped.")


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

        page, raw = vision.extract_page(paths[page_no - 1], page_no)
        print("\n" + "=" * 70)
        print(f"PAGE {page_no}   image: {paths[page_no - 1]}")
        print("=" * 70)

        if page is None:
            print("SCHEMA FAILURE. Raw response:\n")
            print(raw[:2000])
            cache.save_raw(slug, page_no, raw)
            continue

        print(
            f"lang={page.lang}  boilerplate={page.is_boilerplate}  "
            f"formulas={len(page.formulas)}  figures={len(page.figures)}\n"
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
    config.assert_ready()

    if args.cmd == "render":
        cmd_render(args)
    elif args.cmd == "vision":
        cmd_vision(args)
    elif args.cmd == "index":
        cmd_index(args)
    elif args.cmd == "spike":
        cmd_spike(args)
    elif args.cmd == "all":
        cmd_vision(args)
        cmd_index(args)


if __name__ == "__main__":
    main(sys.argv[1:])
