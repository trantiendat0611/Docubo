"""Eval harness.

    python -m eval.run_eval                      # full run against the live API
    python -m eval.run_eval --retrieval-only     # retriever only, no generation
    python -m eval.run_eval --api http://localhost:3000/api/chat

`--retrieval-only` is the one to run while tuning chunking or the RRF weights:
it spends no generation quota and isolates the half of the pipeline you are
actually changing.

Writes a timestamped JSON report to eval/reports/ — keep every run. The
progression across runs is what chapter 4 of the report is made of.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "eval" / "eval_dataset.json"
REPORTS = ROOT / "eval" / "reports"


def load_items() -> list[dict]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    return [i for i in data["items"] if not i["id"].startswith("ex-")] or data["items"]


def run(api_url: str, retrieval_only: bool) -> dict:
    # TODO(week 5): call the API, or import the retriever directly for
    # --retrieval-only. Left unimplemented on purpose — writing this against a
    # real response shape in week 5 beats guessing it in week 1.
    raise NotImplementedError("Implement in week 5, once /api/chat is live.")


def summarise(results: list[dict]) -> dict:
    refuse = [r for r in results if r["category"] == "should_refuse"]
    answer = [r for r in results if r["category"] != "should_refuse"]
    formula = [r for r in results if r.get("expected_latex")]

    def mean(xs: list[float]) -> float:
        return round(sum(xs) / len(xs), 3) if xs else 0.0

    return {
        "n_items": len(results),
        "retrieval_hit_at_8": mean([float(r["hit"]) for r in answer]),
        "retrieval_mrr": mean([r["mrr"] for r in answer]),
        "citation_validity": mean([r["citation_validity"] for r in answer]),
        "faithfulness": mean([r["faithfulness"] for r in answer]),
        "refusal_rate": mean([float(r["refused"]) for r in refuse]),
        "latex_exact_match": mean([float(r["latex_ok"]) for r in formula]),
        "median_latency_ms": (
            sorted(r["latency_ms"] for r in results)[len(results) // 2] if results else 0
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="run_eval")
    parser.add_argument("--api", default="http://localhost:3000/api/chat")
    parser.add_argument("--retrieval-only", action="store_true")
    args = parser.parse_args()

    started = time.time()
    report = run(args.api, args.retrieval_only)

    REPORTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    out = REPORTS / f"eval-{stamp}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(report.get("summary", {}), ensure_ascii=False, indent=2))
    print(f"\n{out}  ({time.time() - started:.1f}s)")


if __name__ == "__main__":
    main()
