"""Cheap token estimation.

Calling countTokens for every candidate chunk would double the number of API
requests during ingest for no retrieval benefit. Instead we estimate from
character count with a per-language ratio.

Why per-language: Vietnamese diacritics and short syllables fragment into more
tokens per character than English. Budgeting both at English's ~4 chars/token
produces Vietnamese chunks roughly 40-50% over the intended size, which quietly
degrades retrieval precision. Calibrate the constants in config.py once during
the week-1 spike by running countTokens on ~20 sample pages of each language and
comparing against len(text).
"""

from __future__ import annotations

from .. import config
from ..pipeline.models import Lang


def estimate_tokens(text: str, lang: Lang = "en") -> int:
    ratio = config.CHARS_PER_TOKEN.get(lang, 3.0)
    return max(1, int(len(text) / ratio))


def budget_chars(n_tokens: int, lang: Lang = "en") -> int:
    """Inverse of estimate_tokens — how many characters fit in a token budget."""
    ratio = config.CHARS_PER_TOKEN.get(lang, 3.0)
    return int(n_tokens * ratio)
