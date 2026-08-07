"""Stage 1 — PDF to per-page PNG.

PyMuPDF rather than pdf2image: pdf2image shells out to poppler's pdftoppm, which
is not installed on Windows by default. PyMuPDF is a pip-only dependency.

Pages are rendered one file each, named p0001.png, so the vision stage can map a
cache miss straight to an image path without re-opening the PDF.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pymupdf

from .. import config


def content_hash(pdf_path: Path) -> str:
    """sha256 of the source file, used to skip already-ingested documents."""
    h = hashlib.sha256()
    with pdf_path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def doc_slug(pdf_path: Path) -> str:
    """Stable per-document directory name for pages/ and cache/."""
    return pdf_path.stem.lower().replace(" ", "-")[:60]


def render(pdf_path: Path, dpi: int = config.RENDER_DPI) -> list[Path]:
    """Render every page to PNG. Returns paths in page order, 1-indexed names.

    Skips pages already on disk, so an interrupted run resumes for free.
    """
    out_dir = config.PAGES_DIR / doc_slug(pdf_path)
    out_dir.mkdir(parents=True, exist_ok=True)

    paths: list[Path] = []
    with pymupdf.open(pdf_path) as doc:
        zoom = dpi / 72.0
        matrix = pymupdf.Matrix(zoom, zoom)
        for i, page in enumerate(doc, start=1):
            out = out_dir / f"p{i:04d}.png"
            if not out.exists():
                page.get_pixmap(matrix=matrix).save(out)
            paths.append(out)
    return paths


def page_count(pdf_path: Path) -> int:
    with pymupdf.open(pdf_path) as doc:
        return doc.page_count
