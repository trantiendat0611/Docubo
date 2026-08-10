"""Tests for the chunker.

The chunker is the only stage with real logic that runs without an API key, so
it is the only stage CI can meaningfully test. Keep these fast and offline.
"""

from __future__ import annotations

import json

from ingest import config
from ingest.pipeline.chunk import _to_embed_text, build_chunks
from ingest.pipeline.models import Figure, Formula, Page
from ingest.pipeline.vision import _repair_escapes


def _page(**kw) -> Page:
    base = {
        "page": 1,
        "lang": "vi",
        "is_boilerplate": False,
        "markdown": "",
        "formulas": [],
        "figures": [],
    }
    return Page(**{**base, **kw})


def test_display_math_becomes_spoken_reading():
    page = _page(
        markdown="Hàm mất mát được định nghĩa:\n\n$$L = \\frac{1}{n}\\sum e_i^2$$",
        formulas=[
            Formula(
                id="eq-1-1",
                latex="L = \\frac{1}{n}\\sum e_i^2",
                plain="Hàm mất mát bằng trung bình bình phương sai số trên n mẫu.",
            )
        ],
    )
    out = _to_embed_text(page.markdown, page)

    assert "trung bình bình phương sai số" in out
    # The raw LaTeX must not survive into the embedded text — that is the whole
    # point of the dual representation.
    assert "\\frac" not in out
    assert "$$" not in out


def test_figure_placeholder_becomes_description():
    page = _page(
        markdown="Xem biểu đồ dưới đây.\n\n[[FIGURE:fig-1-1]]",
        figures=[
            Figure(
                id="fig-1-1",
                kind="chart",
                caption="Đường cong mất mát",
                description="Loss giảm dần theo epoch.",
                data="epoch 0: 2.4, epoch 50: 0.3",
            )
        ],
    )
    out = _to_embed_text(page.markdown, page)

    assert "Đường cong mất mát" in out
    assert "epoch 50: 0.3" in out
    assert "[[FIGURE" not in out


def test_display_text_keeps_latex():
    page = _page(
        markdown="Định nghĩa:\n\n$$e = mc^2$$",
        formulas=[Formula(id="eq-1-1", latex="e = mc^2", plain="Năng lượng bằng...")],
    )
    chunks = build_chunks([page])

    assert chunks
    assert "$$e = mc^2$$" in chunks[0].display_text
    assert chunks[0].has_formula


def test_boilerplate_pages_are_skipped():
    pages = [
        _page(page=1, is_boilerplate=True, markdown="# Mục lục\n\nChương 1 ... 5"),
        _page(page=2, markdown="Nội dung thật, đủ dài để tạo thành một chunk hợp lệ."),
    ]
    chunks = build_chunks(pages)

    assert all(c.page_start == 2 for c in chunks)


def test_formula_stays_with_its_paragraph():
    page = _page(
        markdown=(
            "Ta định nghĩa hàm mất mát như sau, với n là số mẫu trong tập huấn luyện.\n\n"
            "$$L = \\frac{1}{n}\\sum e_i^2$$"
        ),
        formulas=[Formula(id="eq-1-1", latex="L", plain="Hàm mất mát.")],
    )
    chunks = build_chunks([page])

    assert len(chunks) == 1
    assert "số mẫu" in chunks[0].display_text
    assert "$$" in chunks[0].display_text


def test_repair_escapes_rescues_unescaped_latex():
    r"""The real page-44 failure: `\prod` emitted with a single backslash.

    `\p` is not a legal JSON escape, so the whole page is lost even though the
    extraction itself was correct.
    """
    broken = r'{"latex": "p(x) = \prod_{k} p(x_k|pa_k)"}'

    try:
        json.loads(broken)
        raise AssertionError("expected the unrepaired string to be invalid JSON")
    except json.JSONDecodeError:
        pass

    fixed = json.loads(_repair_escapes(broken))
    assert fixed["latex"] == r"p(x) = \prod_{k} p(x_k|pa_k)"


def test_repair_escapes_leaves_valid_escapes_alone():
    """Must not double-escape sequences that were already correct."""
    ok = r'{"a": "line\nbreak", "b": "quote\"inside", "c": "\\frac{1}{2}", "d": "\u00e9"}'

    assert json.loads(_repair_escapes(ok)) == json.loads(ok)
    # The already-correct `\\frac` must survive as a single literal backslash,
    # not become `\\\\frac`.
    assert json.loads(_repair_escapes(ok))["c"] == r"\frac{1}{2}"


def test_page_with_no_blank_lines_is_still_split():
    """Real fallback-model output: headings run inline, no blank lines at all.

    Without oversize splitting the whole page becomes one block, and a single
    block is never divided by the packing loop.
    """
    sentence = "Machine learning la mot linh vuc cua tri tue nhan tao. "
    page = _page(lang="vi", markdown=sentence * 200)

    chunks = build_chunks([page])

    assert len(chunks) > 1
    over = [c for c in chunks if c.n_tokens > config.MAX_TOKENS]
    assert not over, f"{len(over)} chunks exceed MAX_TOKENS"


def test_normal_page_is_not_resplit():
    """Blocks within budget must pass through untouched."""
    page = _page(lang="en", markdown="First paragraph here.\n\nSecond paragraph here.")

    chunks = build_chunks([page])

    assert len(chunks) == 1
    assert "First paragraph" in chunks[0].display_text
    assert "Second paragraph" in chunks[0].display_text


def test_budget_counts_expanded_figure_text():
    """Figure placeholders expand hugely between display and embed text.

    `[[FIGURE:x]]` is 17 characters of markdown that becomes several hundred
    characters of description once embedded. Budgeting on the markdown packed
    two figure-heavy pages into one chunk 40% over MAX_TOKENS in the first real
    ingest.
    """
    long_description = "Mo ta chi tiet ve bieu do. " * 60

    def figure_page(n: int) -> Page:
        return _page(
            page=n,
            lang="vi",
            markdown=f"Doan van ngan tren trang {n}.\n\n[[FIGURE:fig-{n}-1]]",
            figures=[
                Figure(
                    id=f"fig-{n}-1",
                    kind="chart",
                    caption=f"Bieu do {n}",
                    description=long_description,
                    data="",
                )
            ],
        )

    chunks = build_chunks([figure_page(1), figure_page(2)])

    # Each figure carries enough text to fill a chunk on its own, so they must
    # not end up packed together.
    assert len(chunks) >= 2
    over = [c for c in chunks if c.n_tokens > config.MAX_TOKENS]
    assert not over, f"{[c.n_tokens for c in over]} exceed MAX_TOKENS"


def test_retry_delay_is_parsed_from_the_api_error():
    """The 429 body says how long to wait; blind backoff ignores it."""
    from ingest.utils.apierrors import retry_delay_seconds

    structured = (
        "429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'details': "
        "[{'@type': 'type.googleapis.com/google.rpc.RetryInfo', "
        "'retryDelay': '27s'}]}}"
    )
    assert retry_delay_seconds(Exception(structured)) == 27.0

    prose = "You exceeded your current quota. Please retry in 41.5s."
    assert retry_delay_seconds(Exception(prose)) == 41.5

    assert retry_delay_seconds(Exception("connection reset")) is None


def test_batch_parse_keeps_only_expected_pages():
    """A batch response is tolerated partially: six of eight is six saved."""
    from ingest.pipeline.vision import _parse_batch

    raw = json.dumps(
        {
            "pages": [
                {"page": 41, "lang": "en", "markdown": "page forty one"},
                {"page": 42, "lang": "en", "markdown": "page forty two"},
                {"page": 99, "lang": "en", "markdown": "not requested"},
            ]
        }
    )
    got = _parse_batch(raw, [41, 42, 43])

    assert sorted(got) == [41, 42]
    assert got[41].markdown == "page forty one"


def test_batch_parse_falls_back_to_positional_order():
    """Model omitted the page field; order is the only signal left."""
    from ingest.pipeline.vision import _parse_batch

    raw = json.dumps(
        {
            "pages": [
                {"page": 0, "lang": "en", "markdown": "first"},
                {"page": 0, "lang": "en", "markdown": "second"},
            ]
        }
    )
    got = _parse_batch(raw, [7, 8])

    assert sorted(got) == [7, 8]
    assert got[7].markdown == "first"
    assert got[8].markdown == "second"


def test_batch_parse_survives_broken_json():
    from ingest.pipeline.vision import _parse_batch

    assert _parse_batch("not json at all", [1, 2]) == {}
