"""Eval harness.

    python -m eval.run_eval --retrieval-only
    python -m eval.run_eval --retrieval-only --dense-only
    python -m eval.run_eval --api http://localhost:3000/api/chat

`--retrieval-only` is the mode to live in while tuning. It calls the RPCs
directly, so it needs no server, spends no generation quota, and isolates the
half of the pipeline being changed. Run it before and after every retrieval
change; the delta is the whole point.

`--dense-only` swaps hybrid_search for dense_search. The gap between the two
runs is the measured contribution of the lexical arms — without it, "we added
hybrid search" is a claim rather than a result.

Full mode calls /api/chat and additionally measures citation validity and
faithfulness, which only exist once an answer is generated. It needs a bearer
token; see --help.

Every run writes a timestamped report to eval/reports/. Keep them all: the
progression across runs is what chapter 4 of the report is made of.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from ingest import config
from ingest.pipeline import embed, store

from . import metrics

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "eval" / "eval_dataset.json"
REPORTS = ROOT / "eval" / "reports"

#: Categories whose answer lives in retrieved passages. Overview questions do
#: not — they are served by document_overview, which selects rather than
#: searches — and refusals are scored on whether nothing was retrieved.
RETRIEVABLE = {"text", "formula", "figure", "cross_page"}


def load_items() -> list[dict]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    return data["items"]


def covered_pages(rows: list[dict]) -> list[int]:
    """Every page number the retrieved chunks span, in rank order.

    Chunks carry a page range, so a chunk covering pages 42-44 answers a
    question whose answer is on 43.
    """
    pages: list[int] = []
    for row in rows:
        for page in range(row["page_start"], row["page_end"] + 1):
            if page not in pages:
                pages.append(page)
    return pages


def from_expected_source(rows: list[dict], source: str | None) -> list[dict]:
    """Drop chunks belonging to a different document.

    A chunk from the wrong file that happens to sit on page 42 is not a hit.
    Without this filter a corpus of similar documents inflates every number.
    """
    if source is None:
        return rows
    return [r for r in rows if r.get("filename") == source]


def acceptable_locations(item: dict) -> list[tuple[str | None, list[int]]]:
    """Every place in the corpus that genuinely answers the question.

    Real corpora repeat themselves. "Học tăng cường quan tâm đến điều gì" is
    answered by an English definition in one document and a shorter Vietnamese
    description in another, and the system picked the Vietnamese one for a
    Vietnamese question — a better choice than the single source the item
    originally named. Scoring against one location marks that correct answer as
    a miss and hides a real result behind a fake failure.
    """
    places = [(item.get("source"), item["expected_pages"])]
    for alt in item.get("also_accept", []):
        places.append((alt.get("source"), alt.get("pages", [])))
    return places


def score_against(rows: list[dict], item: dict) -> tuple[bool, float]:
    """Best hit and MRR across every acceptable location."""
    best_hit = False
    best_mrr = 0.0
    for source, expected in acceptable_locations(item):
        pages = covered_pages(from_expected_source(rows, source))
        if metrics.hit_at_k(pages, expected):
            best_hit = True
        best_mrr = max(best_mrr, metrics.mrr(pages, expected))
    return best_hit, best_mrr


def run_retrieval(items: list[dict], dense_only: bool) -> list[dict]:
    results: list[dict] = []

    for item in items:
        started = time.time()
        vector = embed.embed_query(item["question"])

        if dense_only:
            rows = store.dense_search(vector)
            # dense_search returns a narrower row shape; fill in what the
            # scoring below needs.
            for row in rows:
                row.setdefault("filename", None)
        else:
            # The lexical arms need the question in both languages, which is
            # what the guardrail produces at request time. Those variants are
            # cached in the dataset so a re-run costs nothing; falling back to
            # the raw question would measure a system nobody runs, and it
            # under-states cross-lingual retrieval badly — one question moved
            # from rank absent to rank one when the English variant was
            # supplied.
            rows = store.search(
                vector,
                item.get("query_en") or item["question"],
                item.get("query_vi") or item["question"],
            )

        # The best similarity in the set, not the first row. hybrid_search
        # orders by RRF, so its top row is the one with the most combined
        # evidence rather than the most similar — mirrors isUngrounded().
        top = max((r["cosine_sim"] for r in rows), default=0.0)
        refused = top < config.MIN_COSINE

        record = {
            "id": item["id"],
            "category": item["category"],
            "q_lang": item["q_lang"],
            "doc_lang": item.get("doc_lang"),
            "cross_lingual": item["q_lang"] != (item.get("doc_lang") or item["q_lang"]),
            "top_cosine": round(top, 3),
            "refused": refused,
            "latency_ms": int((time.time() - started) * 1000),
        }

        if item["category"] in RETRIEVABLE:
            if dense_only:
                # dense_search does not return a filename, so location filtering
                # is not possible; score on pages alone.
                pages = covered_pages(rows)
                hit = metrics.hit_at_k(pages, item["expected_pages"])
                mrr_score = metrics.mrr(pages, item["expected_pages"])
            else:
                hit, mrr_score = score_against(rows, item)
                pages = covered_pages(rows)
            record["hit"] = hit
            record["mrr"] = round(mrr_score, 3)
            record["retrieved_pages"] = pages[:12]
        else:
            record["hit"] = None
            record["mrr"] = None

        results.append(record)
        flag = "" if record["hit"] in (True, None) else "  MISS"
        print(
            f"  {item['id']:8} {item['category']:14} cos={top:.3f} "
            f"{'refuse' if refused else 'answer':7}{flag}"
        )

    return results


def call_api(api: str, token: str, question: str) -> dict:
    request = urllib.request.Request(
        api,
        data=json.dumps({"question": question}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = response.read().decode()
            kind = response.headers.get("content-type", "")
            citations = response.headers.get("X-Citations")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()[:300]
        # 503 from the chat route carries type/message/reason, and `reason`
        # separates a spent daily quota from a per-minute limit. Keeping it is
        # the difference between "re-run tomorrow" and "re-run in a minute".
        try:
            parsed = json.loads(raw)
        except ValueError:
            return {"error": f"HTTP {exc.code}", "body": raw}
        return {**parsed, "status": exc.code}

    if "application/json" in kind:
        return json.loads(body)

    parsed = {
        "answer": body,
        "citations": json.loads(urllib.parse.unquote(citations)) if citations else [],
        "model": response.headers.get("X-Model"),
        "degraded": response.headers.get("X-Degraded") == "1",
    }

    # A stream that carried no tokens is a failed generation, not an answer.
    # The route reports that as a 503 now, but this check stays: it still
    # catches a generation that dies partway, where the status is already sent,
    # and it catches a deployment that predates the fix. Trusting the status
    # code alone is what produced citation_validity 0.15 on a full production
    # run with nothing whatsoever wrong with the citations.
    parsed["type"] = "answer" if body.strip() else "empty"
    return parsed


def run_full(
    items: list[dict], api: str, token: str, delay: float, retry_wait: float
) -> list[dict]:
    results: list[dict] = []

    for n, item in enumerate(items):
        # Space the requests out. Each question costs two model calls and the
        # generation call carries eight context blocks, so firing 26 of them
        # back to back leans on the per-minute allowance far harder than the
        # per-day one. The run that found this failed from item 4 onward.
        if n and delay:
            time.sleep(delay)

        started = time.time()
        response = call_api(api, token, item["question"])

        # One retry when the server says the limit was per-minute. That clears
        # on its own, and dropping the item instead costs a data point out of
        # 26 on top of the two requests already spent on it. A spent daily
        # quota is not retried: nothing will change until it resets.
        retried = False
        if response.get("reason") == "rate_limited" and retry_wait:
            print(f"  {item['id']:8} rate limited, chờ {retry_wait:.0f}s rồi thử lại")
            time.sleep(retry_wait)
            response = call_api(api, token, item["question"])
            retried = True

        latency = int((time.time() - started) * 1000)

        kind = response.get("type", "error")
        answer = response.get("answer", response.get("message", ""))
        citations = response.get("citations", [])

        record = {
            "id": item["id"],
            "category": item["category"],
            "q_lang": item["q_lang"],
            "cross_lingual": item["q_lang"] != (item.get("doc_lang") or item["q_lang"]),
            "type": kind,
            "refused": kind in ("refusal", "blocked"),
            "needs_document": kind == "needs_document",
            # Only a generated answer can be scored. Leaving this None for the
            # other kinds keeps a failed generation out of the mean instead of
            # entering it as a zero.
            "citation_validity": round(
                metrics.citation_validity(answer, len(citations)), 3
            )
            if kind == "answer"
            else None,
            "cited_sources": sorted({c.get("filename") for c in citations if c}),
            # Which model served the question, and whether query analysis fell
            # back to the raw question. Without these a degraded run and a clean
            # one produce identical-looking reports.
            "model": response.get("model"),
            "degraded": response.get("degraded", False),
            # Set on a 503: "daily_quota" or "rate_limited". Which one decides
            # whether the rest of the run is worth attempting today.
            "reason": response.get("reason"),
            "retried": retried,
            "latency_ms": latency,
            "answer": answer[:800],
        }

        if item["category"] in RETRIEVABLE and kind == "answer":
            rows = [
                {
                    "filename": c.get("filename"),
                    "page_start": c["pageStart"],
                    "page_end": c["pageEnd"],
                }
                for c in citations
            ]
            hit, mrr_score = score_against(rows, item)
            record["hit"] = hit
            record["mrr"] = round(mrr_score, 3)

        results.append(record)
        flag = ""
        if kind in ("empty", "error"):
            flag = f"  GENERATION FAILED {record['reason'] or 'no reason given'}"
        print(
            f"  {item['id']:8} {item['category']:14} {kind:15} {latency:5}ms "
            f"{record['model'] or '-':22}{flag}"
        )

    return results


def summarise(results: list[dict]) -> dict:
    def mean(values: list[float]) -> float | None:
        clean = [v for v in values if v is not None]
        return round(sum(clean) / len(clean), 3) if clean else None

    retrievable = [r for r in results if r["category"] in RETRIEVABLE]
    refuse = [r for r in results if r["category"] == "should_refuse"]
    overview = [r for r in results if r["category"] == "overview"]
    cross = [r for r in retrievable if r["cross_lingual"]]
    same = [r for r in retrievable if not r["cross_lingual"]]

    summary = {
        "n_items": len(results),
        "retrieval_hit_at_8": mean(
            [float(r["hit"]) for r in retrievable if r.get("hit") is not None]
        ),
        "retrieval_mrr": mean(
            [r["mrr"] for r in retrievable if r.get("mrr") is not None]
        ),
        # Split out because the cross-lingual case is the product's central
        # claim. An aggregate that hides it would be the wrong number to report.
        "hit_same_language": mean(
            [float(r["hit"]) for r in same if r.get("hit") is not None]
        ),
        "hit_cross_lingual": mean(
            [float(r["hit"]) for r in cross if r.get("hit") is not None]
        ),
        "refusal_rate": mean([float(r["refused"]) for r in refuse]),
        # A refusal on a question the corpus does answer is the expensive
        # failure — worse than a wrong answer, because the user assumes the
        # document lacks the content.
        "false_refusal_rate": mean([float(r["refused"]) for r in retrievable]),
        "median_latency_ms": sorted(r["latency_ms"] for r in results)[len(results) // 2]
        if results
        else 0,
    }

    if any("citation_validity" in r for r in results):
        summary["citation_validity"] = mean([r.get("citation_validity") for r in results])
        summary["overview_asked_for_document"] = mean(
            [float(r.get("needs_document", False)) for r in overview if not r.get("hit")]
        )
        # How much of the run actually produced an answer. A run with failed
        # generations has not measured answer quality no matter what the other
        # numbers say, so the count sits beside them rather than in a log line
        # nobody re-reads. citation_validity above is a mean over the answers
        # that exist, so it stays honest — but over a smaller n than n_items.
        # "error" is the route reporting the failure properly; "empty" is the
        # older shape, a 200 with nothing in it. Both are a question that did
        # not get answered.
        summary["n_generation_failed"] = sum(
            1 for r in results if r.get("type") in ("empty", "error")
        )
        summary["n_degraded"] = sum(1 for r in results if r.get("degraded"))

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="run_eval",
        description="Measure retrieval and answer quality against eval_dataset.json.",
    )
    parser.add_argument("--api", default="http://localhost:3000/api/chat")
    parser.add_argument(
        "--retrieval-only",
        action="store_true",
        help="Call the RPCs directly. No server, no generation quota.",
    )
    parser.add_argument(
        "--dense-only",
        action="store_true",
        help="Use dense_search instead of hybrid_search, to measure what the "
        "lexical arms contribute. Implies --retrieval-only.",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("EVAL_ACCESS_TOKEN", ""),
        help="Supabase access token for full mode. Also read from "
        "EVAL_ACCESS_TOKEN. Sign in and copy it from the session.",
    )
    parser.add_argument("--limit", type=int, help="Run only the first N items.")
    parser.add_argument(
        "--delay",
        type=float,
        default=5.0,
        help="Seconds between questions in full mode, to stay under the "
        "per-minute allowance. 0 restores back-to-back requests.",
    )
    parser.add_argument(
        "--retry-wait",
        type=float,
        default=30.0,
        help="Seconds to wait before retrying a question the server rejected "
        "as rate limited. 0 disables the retry.",
    )
    args = parser.parse_args()

    config.assert_ready()

    items = load_items()
    if args.limit:
        items = items[: args.limit]

    retrieval_only = args.retrieval_only or args.dense_only
    mode = "dense-only" if args.dense_only else "retrieval" if retrieval_only else "full"
    print(f"mode={mode}  items={len(items)}  MIN_COSINE={config.MIN_COSINE}\n")

    started = time.time()

    if retrieval_only:
        results = run_retrieval(items, dense_only=args.dense_only)
    else:
        if not args.token:
            raise SystemExit(
                "Full mode needs --token or EVAL_ACCESS_TOKEN.\n"
                "Retrieval-only needs neither:\n"
                "  python -m eval.run_eval --retrieval-only"
            )
        results = run_full(items, args.api, args.token, args.delay, args.retry_wait)

    summary = summarise(results)
    report = {
        "mode": mode,
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
        # Which deployment produced these numbers. A full-mode report that does
        # not say whether it hit localhost or production cannot be cited.
        "api": None if retrieval_only else args.api,
        "min_cosine": config.MIN_COSINE,
        "summary": summary,
        "results": results,
    }

    REPORTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    out = REPORTS / f"eval-{mode}-{stamp}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n" + json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\n{out}  ({time.time() - started:.1f}s)")


if __name__ == "__main__":
    main()
