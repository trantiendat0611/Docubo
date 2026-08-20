"""Send the questions that pass MIN_COSINE but the corpus cannot answer.

    .venv/Scripts/python -m eval.probe_refusal --api https://docubo.vercel.app/api/chat

Costs two generation requests per question — one guardrail call, one answer.

`eval.threshold` found that questions inside the documents' own subject but
absent from them score above the refusal threshold: the corpus is about machine
learning, so a question about k-means sits close to it whether or not k-means
appears anywhere. Those questions reach the model.

Which means the cosine threshold is not what protects the product here — the
grounding prompt is, and whether it actually refuses these has never been
measured. `refusal_rate = 1.000` across ten runs was earned entirely against
easy negatives: pho, Paris, a share price, a motorcycle tyre.

The verdict printed for each answer is a keyword heuristic and is **not** the
measurement. The full answer is printed underneath precisely so it gets read —
this project has produced five metrics that looked like results and were not,
and a refusal detector built from a word list would be an obvious sixth.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path

from eval.run_eval import call_api
from ingest import config

#: Phrases a refusal tends to contain, in both languages. A hint for reading the
#: output faster, nothing more — see the module docstring.
REFUSAL_HINTS = (
    "không chứa",
    "không có thông tin",
    "không đề cập",
    "không nói",
    "không cung cấp",
    "không tìm thấy",
    "does not contain",
    "no information",
    "does not mention",
    "not provide",
    "cannot find",
)


def overlapping_probes() -> list[tuple[str, float]]:
    """Probes from the newest threshold report that clear MIN_COSINE.

    Read from the report rather than restated here, so the two stay in step: a
    re-calibration that moves the threshold or re-scores the probes changes
    which questions this sends, without anyone having to remember to edit a
    list.
    """
    reports = glob.glob("eval/reports/threshold-*.json")
    if not reports:
        raise SystemExit(
            "Chưa có report threshold nào. Chạy trước:\n"
            "  .venv/Scripts/python -m eval.threshold"
        )

    newest = max(reports, key=os.path.getmtime)
    data = json.loads(Path(newest).read_text(encoding="utf-8"))
    print(f"Câu dò lấy từ: {os.path.basename(newest)}")

    return [
        (p["question"], p["top_cosine"])
        for p in data["probes"]
        if p["top_cosine"] >= config.MIN_COSINE
    ]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--api", default="http://localhost:3000/api/chat")
    ap.add_argument("--token", default=os.environ.get("EVAL_ACCESS_TOKEN", ""))
    ap.add_argument("--delay", type=float, default=5.0)
    args = ap.parse_args()

    if not args.token:
        raise SystemExit(
            "Thiếu token. Lấy bằng:\n  .venv/Scripts/python -m eval.get_token"
        )

    probes = overlapping_probes()
    print(f"{len(probes)} câu vượt ngưỡng {config.MIN_COSINE}")
    print(f"api = {args.api}")
    print(f"≈ {len(probes) * 2} request sinh\n")

    results = []
    for n, (question, cosine) in enumerate(probes):
        if n and args.delay:
            time.sleep(args.delay)

        response = call_api(args.api, args.token, question)
        answer = response.get("answer") or response.get("message") or ""
        kind = response.get("type", "answer" if answer else "error")
        looks_refused = any(h in answer.lower() for h in REFUSAL_HINTS)

        results.append(
            {
                "question": question,
                "top_cosine": cosine,
                "type": kind,
                "model": response.get("model"),
                "looks_like_refusal": looks_refused,
                "answer": answer,
            }
        )

        print("=" * 78)
        print(f"HỎI (cos {cosine:.3f}): {question}")
        print(f"  type={kind}  model={response.get('model') or '—'}")
        print(f"  gợi ý: {'CÓ VẺ TỪ CHỐI' if looks_refused else 'CÓ VẺ ĐÃ TRẢ LỜI'}")
        print(f"\n{answer or '(rỗng)'}\n")

    hinted = sum(1 for r in results if r["looks_like_refusal"])
    print("=" * 78)
    print(f"Gợi ý từ chối: {hinted}/{len(results)}")
    print("ĐỌC TỪNG CÂU TRẢ LỜI Ở TRÊN. Con số này là gợi ý, không phải phép đo.")

    out = Path("eval/reports") / (
        f"probe-refusal-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.json"
    )
    out.write_text(
        json.dumps(
            {
                "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
                "api": args.api,
                "min_cosine": config.MIN_COSINE,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nGhi: {out}")


if __name__ == "__main__":
    main()
