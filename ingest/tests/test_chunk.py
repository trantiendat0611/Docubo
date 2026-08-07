"""Tests for the chunker.

The chunker is the only stage with real logic that runs without an API key, so
it is the only stage CI can meaningfully test. Keep these fast and offline.
"""

from __future__ import annotations

from ingest.pipeline.chunk import _to_embed_text, build_chunks
from ingest.pipeline.models import Figure, Formula, Page


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
