"""Measure what a rule in the extraction prompt is worth.

    .venv/Scripts/python -m ingest.ablate --list
    .venv/Scripts/python -m ingest.ablate translate

Each run drops one numbered rule from `prompts/page_extract.md`, re-extracts a
page chosen to exercise that rule, and prints the result beside the cached
output produced with the rule in place.

The cache is what makes this cheap: it already holds the "with rule" half of
every comparison, so a run costs one vision request rather than two.

Written to answer a question the repository cannot: the prompt was tuned
without a commit per revision, so why each rule exists is not recorded
anywhere. Measuring now is not the same as a development log, and section 2 of
SKILL_MY_PROJECT.md says so where these numbers are used.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from ingest import config
from ingest.pipeline import vision

# Rule number in the prompt, the page that exercises it, and what to look for.
EXPERIMENTS: dict[str, dict[str, object]] = {
    "invent": {
        "rule": 5,
        "doc": "testta1",
        "page": 15,
        "claim": "Bỏ 'Never invent' → model bịa nội dung thay vì ghi [unreadable]",
        "look": "So số hình và phần mô tả: có mô tả nào nói chi tiết mà ảnh không có?",
    },
    "translate": {
        "rule": 2,
        "doc": "testtv1",
        "page": 3,
        "claim": "Bỏ 'Do not translate' → model dịch trang tiếng Việt sang tiếng Anh",
        "look": "So trường lang và ngôn ngữ thật của markdown.",
    },
    "headers": {
        "rule": 7,
        "doc": "testta1",
        "page": 15,
        "claim": "Bỏ quy tắc bỏ header/footer → chúng lọt vào markdown, làm bẩn chỉ mục",
        "look": "Tìm tên tài liệu hoặc số trang lặp lại ở đầu/cuối markdown.",
    },
    "boilerplate": {
        "rule": 6,
        "doc": "testta1",
        "page": 2,
        "claim": "Bỏ is_boilerplate → trang mục lục không bị đánh dấu, lọt vào chỉ mục",
        "look": "So trường is_boilerplate giữa hai bên.",
    },
}


def baseline_spread(doc: str, page_no: int, runs: int) -> None:
    """Run the unmodified prompt several times and report how much it moves.

    An ablation compares one run against one run, which only means something if
    the same prompt twice means the same thing. Dropping rule 5 — a rule about
    not inventing content — took a page from nine figures to one, and rule 5 has
    nothing to do with figure detection. Either that rule has a wildly indirect
    effect, or a single run cannot separate the prompt from the noise. This
    measures which.
    """
    image = Path(config.ROOT) / "data" / "pages" / doc / f"p{page_no:04d}.png"
    if not image.exists():
        raise SystemExit(f"thiếu ảnh trang: {image}")

    print(f"Chạy {runs} lần trên {doc} p{page_no:04d}, prompt KHÔNG đổi")
    print(f"Tốn {runs} request.\n")

    rows = []
    for i in range(1, runs + 1):
        print(f"  … lần {i}/{runs}")
        page, model, _ = vision.extract_page(image, page_no)
        d = (page.model_dump() if hasattr(page, "model_dump") else page) or {}
        rows.append(
            {
                "lần": i,
                "model": model,
                "hình": len(d.get("figures") or []),
                "công thức": len(d.get("formulas") or []),
                "kí tự": len(d.get("markdown") or ""),
                "boilerplate": d.get("is_boilerplate"),
            }
        )

    print(f"\n{'lần':>4} {'hình':>5} {'công thức':>10} {'kí tự':>7}  boilerplate  model")
    for r in rows:
        print(
            f"{r['lần']:>4} {r['hình']:>5} {r['công thức']:>10} {r['kí tự']:>7}  "
            f"{str(r['boilerplate']):>11}  {r['model']}"
        )

    for key in ("hình", "kí tự"):
        vals = [r[key] for r in rows]
        lo, hi = min(vals), max(vals)
        spread = f"{lo}–{hi}" if lo != hi else str(lo)
        verdict = "ỔN ĐỊNH" if lo == hi else f"DAO ĐỘNG {hi - lo}"
        print(f"\n  {key}: {spread}   → {verdict}")

    print(
        "\nNếu dao động ở đây cỡ bằng 'tác dụng' đo được lúc bỏ quy tắc,\n"
        "thì một lần chạy mỗi phía không đủ để kết luận gì về quy tắc đó."
    )


def drop_rule(prompt: str, n: int) -> str:
    """Remove one numbered rule from the Rules section.

    A rule runs from `N.` to the next number at the same level, so the span is
    found by looking ahead rather than by counting lines. Not every rule opens
    with a bold title — the last one does not — so the pattern must not require
    one, or the final rule silently fails to match.
    """
    pattern = rf"\n{n}\. .*?(?=\n{n + 1}\. |\n\{{page_instruction\}})"
    out, count = re.subn(pattern, "\n", prompt, flags=re.S)
    if count != 1:
        raise SystemExit(f"không tách được quy tắc {n} (khớp {count} lần)")
    return out


def summarise(page: object | None, label: str) -> None:
    print(f"\n----- {label} -----")
    if page is None:
        print("  (không parse được kết quả)")
        return

    d = page.model_dump() if hasattr(page, "model_dump") else page
    md = d.get("markdown", "") or ""
    print(f"  lang            {d.get('lang')}")
    print(f"  is_boilerplate  {d.get('is_boilerplate')}")
    print(f"  hình            {len(d.get('figures') or [])}")
    print(f"  công thức       {len(d.get('formulas') or [])}")
    print(f"  markdown        {len(md)} kí tự")
    print(f"  [unreadable]    {md.count('[unreadable]')} lần")
    print("  --- 400 kí tự đầu ---")
    print("  " + md[:400].replace("\n", "\n  "))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("experiment", nargs="?", choices=[*sorted(EXPERIMENTS), "baseline"])
    ap.add_argument("--list", action="store_true", help="Liệt kê thí nghiệm rồi thoát.")
    ap.add_argument(
        "--runs", type=int, default=3, help="Số lần chạy cho 'baseline' (mặc định 3)."
    )
    args = ap.parse_args()

    if args.experiment == "baseline":
        baseline_spread("testta1", 15, args.runs)
        return

    if args.list or not args.experiment:
        print("Các thí nghiệm có sẵn (mỗi cái tốn 1 request vision):\n")
        for name, e in EXPERIMENTS.items():
            print(f"  {name:12} bỏ quy tắc {e['rule']} · {e['doc']} trang {e['page']}")
            print(f"  {'':12} {e['claim']}\n")
        print("  baseline     chạy cùng một trang nhiều lần, prompt không đổi")
        print("  {:12} Đo nhiễu giữa các lần chạy. Không có nó thì mọi".format(""))
        print("  {:12} kết quả ở trên đều không diễn giải được.".format(""))
        print("  {:12} (--runs, mặc định 3)".format(""))
        return

    e = EXPERIMENTS[args.experiment]
    doc, page_no = e["doc"], e["page"]

    image = Path(config.ROOT) / "data" / "pages" / doc / f"p{page_no:04d}.png"
    cached = Path(config.ROOT) / "data" / "cache" / doc / f"p{page_no:04d}.json"

    if not image.exists():
        raise SystemExit(f"thiếu ảnh trang: {image}")
    if not cached.exists():
        raise SystemExit(f"thiếu cache: {cached}")

    print(f"Thí nghiệm: {args.experiment}")
    print(f"Giả thuyết: {e['claim']}")
    print(f"Trang:      {doc} p{page_no:04d}")
    print(f"Cần nhìn:   {e['look']}")

    with cached.open(encoding="utf-8") as fh:
        summarise(json.load(fh), "CÓ quy tắc (từ cache, 0 request)")

    # Swap the module-level prompt for the ablated one, then restore it. The
    # pipeline reads it once at import, so this is the seam.
    original = vision._PROMPT
    vision._PROMPT = drop_rule(original, int(e["rule"]))
    try:
        print(f"\n  … đang gọi model, bỏ quy tắc {e['rule']} (1 request)")
        result, model, _ = vision.extract_page(image, page_no)
    finally:
        vision._PROMPT = original

    summarise(result, f"BỎ quy tắc {e['rule']} (model: {model})")
    print("\nKết luận rút ra là của bạn — dán output này cho tôi để viết vào SKILL §2.")


if __name__ == "__main__":
    main()
