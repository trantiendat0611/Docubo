"""Calibrate MIN_COSINE against a wider set of questions than the eval has.

    .venv/Scripts/python -m eval.threshold

Spends embedding quota only — a separate, much larger budget than generation —
so it can be re-run freely.

Why this exists. The threshold was set from seven questions and is currently
checked by the eval set's six `should_refuse` items, of which two are prompt
injection (caught by the guardrail, not by cosine) and four are obviously
unrelated: pho, Paris, a share price, a motorcycle tyre. Nothing in that set
asks something **inside the corpus's subject** that the corpus does not answer,
which is the case a refusal threshold actually has to get right. Measured
against only the easy negatives, any threshold looks safe.

In-scope scores are read from the newest retrieval report rather than
re-embedded: they were measured under exactly the conditions the product runs
in, with the query variants the guardrail would have produced.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import statistics
from datetime import UTC, datetime
from pathlib import Path

from ingest import config
from ingest.pipeline import embed, store

#: Questions the corpus should not be able to answer, in two kinds.
#:
#: `unrelated` is the easy negative — a different universe of discourse. These
#: are what the eval set already covers, repeated here so both kinds are scored
#: the same way in one run.
#:
#: `adjacent` is the case that matters: recognisably the same field as the
#: documents, phrased the way a real user would, but about something they do not
#: contain. A threshold that only clears `unrelated` has not been tested.
PROBES: list[tuple[str, str]] = [
    ("unrelated", "Giá vàng SJC hôm nay bao nhiêu một lượng?"),
    ("unrelated", "Cách làm bánh mì thịt nướng tại nhà"),
    ("unrelated", "What time does the last train to Manchester leave?"),
    ("unrelated", "How do I renew a Vietnamese passport?"),
    ("unrelated", "Đội tuyển Việt Nam đá với Thái Lan lúc mấy giờ?"),
    ("unrelated", "What is the boiling point of water at sea level?"),
    ("adjacent", "Cơ chế attention trong kiến trúc Transformer hoạt động thế nào?"),
    ("adjacent", "How does backpropagation compute gradients through a deep network?"),
    ("adjacent", "Sự khác nhau giữa LoRA và full fine-tuning là gì?"),
    ("adjacent", "What is the vanishing gradient problem in recurrent networks?"),
    ("adjacent", "Cách chọn learning rate schedule cho quá trình huấn luyện?"),
    ("adjacent", "What does the softmax temperature parameter control?"),
    ("adjacent", "Giải thích thuật toán k-means và cách chọn số cụm k"),
    ("adjacent", "How is BLEU score computed for machine translation?"),
    ("adjacent", "Batch normalization giúp gì cho quá trình huấn luyện?"),
    ("adjacent", "What is the difference between L1 and L2 regularisation?"),
]


def in_scope_from_report() -> list[tuple[str, str, float]]:
    """(id, category, top_cosine) for every question the corpus does answer."""
    reports = glob.glob("eval/reports/eval-retrieval-*.json")
    if not reports:
        raise SystemExit(
            "Chưa có report chế độ truy hồi nào. Chạy trước:\n"
            "  .venv/Scripts/python -m eval.run_eval --retrieval-only"
        )

    newest = max(reports, key=os.path.getmtime)
    data = json.loads(Path(newest).read_text(encoding="utf-8"))
    print(f"Điểm trong phạm vi đọc từ: {os.path.basename(newest)}\n")

    return [
        (r["id"], r["category"], r["top_cosine"])
        for r in data["results"]
        if r["category"] != "should_refuse"
    ]


def score(question: str) -> tuple[float, str]:
    """Top cosine for a question, and where it came from.

    Mirrors isUngrounded(): the best similarity in the returned set, not the
    first row — hybrid_search orders by RRF, so its top row carries the most
    combined evidence rather than the most similarity.

    The lexical arms get the raw question here, with no generated variants. That
    is fine for scoring: the arms decide which rows come back, and the dense arm
    already returns the most similar ones, so the maximum barely moves.
    """
    rows = store.search(embed.embed_query(question), question, question)
    if not rows:
        return 0.0, "—"
    best = max(rows, key=lambda r: r["cosine_sim"])
    where = f"{best.get('filename') or '?'} tr.{best['page_start']}"
    # Rounded to three places to match what run_eval stores. Keeping full
    # precision here and not there put two conventions in one file, and made a
    # probe at 0.6537 look exactly equal to an eval question recorded as 0.654.
    return round(best["cosine_sim"], 3), where


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--skip-probes",
        action="store_true",
        help="Chỉ đọc lại report, không embed câu dò nào (0 request).",
    )
    args = ap.parse_args()

    inside = in_scope_from_report()

    outside: list[tuple[str, str, float, str]] = []
    if not args.skip_probes:
        print(f"Đang chấm {len(PROBES)} câu dò ({len(PROBES)} request embedding)…\n")
        for kind, question in PROBES:
            cos, where = score(question)
            outside.append((kind, question, cos, where))
            print(f"  {cos:.3f}  {kind:9} {question[:58]:60} ← {where}")

    lo = min(inside, key=lambda r: r[2])
    print(f"\n{'=' * 72}")
    print(
        f"TRONG PHẠM VI   n={len(inside):2}   "
        f"{min(r[2] for r in inside):.3f} – {max(r[2] for r in inside):.3f}"
        f"   thấp nhất: {lo[0]} ({lo[1]})"
    )

    if outside:
        for kind in ("unrelated", "adjacent"):
            group = [r for r in outside if r[0] == kind]
            if not group:
                continue
            top = max(group, key=lambda r: r[2])
            print(
                f"{kind.upper():15} n={len(group):2}   "
                f"{min(r[2] for r in group):.3f} – {max(r[2] for r in group):.3f}"
                f"   cao nhất: {top[1][:44]}"
            )

        ceiling = max(r[2] for r in outside)
        floor = lo[2]
        print(f"\nNGƯỠNG HIỆN TẠI  {config.MIN_COSINE:.3f}")
        print(
            f"  biên dưới  {config.MIN_COSINE - ceiling:+.3f}"
            f"   (tới câu ngoài phạm vi cao nhất {ceiling:.3f})"
        )
        print(
            f"  biên trên  {floor - config.MIN_COSINE:+.3f}"
            f"   (tới câu trong phạm vi thấp nhất {floor:.3f})"
        )

        if floor > ceiling:
            mid = (floor + ceiling) / 2
            print(f"\nKhe: {floor - ceiling:.3f}   điểm giữa: {mid:.3f}")
            print(f"  Điểm giữa cho biên cân bằng ±{(floor - ceiling) / 2:.3f}.")
        else:
            overlap = [r for r in outside if r[2] >= floor]
            print(f"\n**HAI NHÓM CHỒNG LẤN** — {len(overlap)} câu ngoài phạm vi ghi điểm")
            print("  cao hơn câu trong phạm vi thấp nhất. Không ngưỡng nào tách được")
            print("  hai nhóm; vấn đề nằm ở chunking hoặc embed_text, không ở ngưỡng.")
            for _, q, cos, where in sorted(overlap, key=lambda r: -r[2]):
                print(f"    {cos:.3f}  {q[:52]:54} ← {where}")

        print(
            f"\nTrung vị — trong phạm vi {statistics.median([r[2] for r in inside]):.3f}"
            f"   ngoài phạm vi {statistics.median([r[2] for r in outside]):.3f}"
        )

        # Every other measurement in this project leaves a file behind, and the
        # report is what the chapter cites. A finding that only ever existed in
        # a terminal is a finding nobody can check.
        out = Path("eval/reports") / (
            f"threshold-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.json"
        )
        out.write_text(
            json.dumps(
                {
                    "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
                    "min_cosine": config.MIN_COSINE,
                    "in_scope": [
                        {"id": i, "category": c, "top_cosine": s} for i, c, s in inside
                    ],
                    "probes": [
                        {"kind": k, "question": q, "top_cosine": s, "matched": w}
                        for k, q, s, w in outside
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"\nGhi: {out}")


if __name__ == "__main__":
    main()
