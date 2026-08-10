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

# Pin a named version, never `gemini-flash-latest`. A floating alias would mean
# pages cached in week 3 and week 6 were read by different model versions, which
# makes the eval numbers incomparable and the cache internally inconsistent.
# Verified working on free tier 2026-08-07; `gemini-3.6-flash` also works and is
# worth A/B-ing during the spike — neither has been measured on math extraction.
VISION_MODEL = os.environ.get("GEMINI_VISION_MODEL", "gemini-3.5-flash")

# Used when the primary model returns finish_reason=RECITATION — it refuses to
# transcribe a page it recognises as memorised published text.
#
# The refusal is intermittent, not deterministic. Within one session a given
# page was refused at temperature 0, 0.3, 0.6 and 0.9, and by 3.6-flash and
# 3.5-flash-lite as well; a later run read that same page with the primary
# model on the first try. So the retry order is: primary, primary again, then
# this fallback.
FALLBACK_VISION_MODEL = os.environ.get("GEMINI_FALLBACK_VISION_MODEL", "gemini-2.5-flash")

EMBED_MODEL = os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "768"))

# A dense page of markdown plus formula readings and figure descriptions runs
# long. Too low and the JSON comes back truncated, which surfaces as a schema
# failure that looks like a prompt problem but is not.
MAX_OUTPUT_TOKENS = int(os.environ.get("GEMINI_MAX_OUTPUT_TOKENS", "16384"))
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

# Retrieval-score floor for the refusal path. Mirrored in src/lib/retrieve.ts —
# change both together.
#
# Measured 2026-08-10 on a 4-chunk Vietnamese corpus with gemini-embedding-001:
#
#   in scope      0.648 – 0.750
#   out of scope  0.462 – 0.566   ("giá cổ phiếu VNM", "cách nấu phở bò",
#                                   "capital of France", "thay lốp xe máy")
#
# The lesson is the floor, not the gap: this model scores *completely
# unrelated* text around 0.5. There is no universal scale where 0.35 means
# "unrelated" — the initial 0.35 guess let every off-topic question through,
# silently disabling the refusal path.
#
# 0.60 separates the two groups on this sample, but the sample is 7 questions
# over 4 chunks. Re-measure on the full corpus with eval_dataset.json before
# treating this number as settled.
MIN_COSINE = 0.60


def assert_ready(need_supabase: bool = True) -> None:
    """Fail fast with a useful message instead of a stack trace 200 pages in.

    `need_supabase` is False for the render and spike stages, which never touch
    the database — the whole point of `spike` is to run it in week 1, before the
    Supabase project exists.
    """
    required = [("GEMINI_API_KEY", GEMINI_API_KEY)]
    if need_supabase:
        required += [
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY),
        ]
    missing = [name for name, value in required if not value]
    if missing:
        raise SystemExit(
            f"Missing env vars: {', '.join(missing)}. "
            f"Copy .env.example to .env and fill them in."
        )
    for d in (RAW_DIR, PAGES_DIR, CACHE_DIR):
        d.mkdir(parents=True, exist_ok=True)
