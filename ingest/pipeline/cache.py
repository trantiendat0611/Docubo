"""The quota guard.

Every vision response is written here as one JSON file per page. Nothing
downstream is allowed to call the vision model for a page that already has a
cache file. This is what makes it safe to iterate on chunking, swap the
embedding model, or rebuild the database — none of those touch vision quota.

Delete a single file to force one page to be re-read; delete the directory to
re-read a document from scratch.
"""

from __future__ import annotations

from pathlib import Path

from .. import config
from .models import Page


def _path(doc_slug: str, page_no: int) -> Path:
    return config.CACHE_DIR / doc_slug / f"p{page_no:04d}.json"


def has(doc_slug: str, page_no: int) -> bool:
    return _path(doc_slug, page_no).exists()


def load(doc_slug: str, page_no: int) -> Page | None:
    p = _path(doc_slug, page_no)
    if not p.exists():
        return None
    return Page.model_validate_json(p.read_text(encoding="utf-8"))


def save(doc_slug: str, page: Page) -> None:
    p = _path(doc_slug, page.page)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(page.model_dump_json(indent=2, exclude_none=False), encoding="utf-8")


def load_all(doc_slug: str) -> list[Page]:
    """Every cached page for a document, in page order."""
    d = config.CACHE_DIR / doc_slug
    if not d.exists():
        return []
    pages = [
        Page.model_validate_json(f.read_text(encoding="utf-8"))
        for f in sorted(d.glob("p*.json"))
    ]
    return sorted(pages, key=lambda p: p.page)


def save_raw(doc_slug: str, page_no: int, text: str) -> Path:
    """Dump an unparseable vision response for inspection.

    When the model returns something that fails schema validation, keeping the
    raw text is how you fix the prompt instead of guessing.
    """
    p = config.CACHE_DIR / doc_slug / f"p{page_no:04d}.raw.txt"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    return p
