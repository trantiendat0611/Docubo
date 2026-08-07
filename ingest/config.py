"""Central config. Everything tunable lives here so experiments are one edit."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

# --- paths -----------------------------------------------------------------
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"  # source PDFs (gitignored)
PAGES_DIR = DATA_DIR / "pages"  # rendered page PNGs
CACHE_DIR = DATA_DIR / "cache"  # one JSON per page, the vision-call cache

# --- gemini ----------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
VISION_MODEL = os.environ.get("GEMINI_VISION_MODEL", "gemini-2.0-flash")
EMBED_MODEL = os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "768"))
RPM = int(os.environ.get("GEMINI_RPM", "15"))

# --- supabase --------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# --- rendering -------------------------------------------------------------
# Starting point, not yet validated. Confirm during the week-1 spike: if the
# model misreads subscripts or small indices, raise to 300 and re-run. Higher
# dpi costs nothing in quota, only in upload size.
RENDER_DPI = 200

# --- chunking --------------------------------------------------------------
TARGET_TOKENS = 700  # brief asks for 500-800
MAX_TOKENS = 900
OVERLAP_TOKENS = 80

# Rough chars-per-token, used instead of calling countTokens for every chunk.
# Vietnamese fragments into more tokens per character than English, so a single
# character budget would produce chunks ~40% too large on Vietnamese pages.
CHARS_PER_TOKEN = {"en": 4.0, "vi": 2.6, "mixed": 3.0}

# --- retrieval defaults (mirrored in src/lib for the TS side) --------------
MATCH_LIMIT = 8
CANDIDATE_LIMIT = 30
RRF_K = 60


def assert_ready() -> None:
    """Fail fast with a useful message instead of a stack trace 200 pages in."""
    missing = [
        name
        for name, value in [
            ("GEMINI_API_KEY", GEMINI_API_KEY),
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY),
        ]
        if not value
    ]
    if missing:
        raise SystemExit(
            f"Missing env vars: {', '.join(missing)}. "
            f"Copy .env.example to .env and fill them in."
        )
    for d in (RAW_DIR, PAGES_DIR, CACHE_DIR):
        d.mkdir(parents=True, exist_ok=True)
