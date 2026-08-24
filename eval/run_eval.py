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
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from ingest import config
from ingest.pipeline import embed, store

from . import judge, metrics

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "eval" / "eval_dataset.json"
REPORTS = ROOT / "eval" / "reports"

#: Categories whose answer lives in retrieved passages. Overview questions do
#: not — they are served by document_overview, which selects rather than
#: searches — and refusals are scored on whether nothing was retrieved.
RETRIEVABLE = {"text", "formula", "figure", "cross_page"}

#: The image-paste path, added 24/08. Kept out of RETRIEVABLE on purpose: this
#: is a brand-new set of items, and folding it into hit@8/MRR would change
#: those numbers on the very next run for reasons that have nothing to do with
#: retrieval quality — the same mistake hard_negative's addition made to
#: p90_ttft_ms before it was excluded (bẫy #24). Not every "image" item is
#: retrievable either: one deliberately asks something the pasted image does
#: not contain, so within this set item.get("source") is what decides —
#: exactly the split document_overview items already use.
IMAGE = {"image"}

#: A failed request that took at least this long was almost certainly killed by
#: the platform rather than refused by the route: /api/chat declares
#: maxDuration = 60, and every error the route raises itself comes back in
#: milliseconds. Set under the ceiling because the client's clock includes the
#: network on both sides — the two observed hits measured 62.4s and 62.6s.
TIMEOUT_FLOOR_MS = 55_000


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

        if item["category"] in RETRIEVABLE or (
            item["category"] in IMAGE and item.get("source")
        ):
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
    sent = time.time()
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            kind = response.headers.get("content-type", "")
            citations = response.headers.get("X-Citations")
            ttft_ms: int | None = None
            if "application/json" in kind:
                # An error/refusal/blocked/needs_document body is a single JSON
                # object, not a stream — there is no "first token" to time.
                body = response.read().decode()
            else:
                # Read the stream incrementally rather than response.read() in
                # one call, so the wall-clock time of the first non-empty chunk
                # is a real time-to-first-token measurement instead of the time
                # to read the whole body. REQUIREMENTS.md §6 has carried a
                # "< 3s to first token" target since week 1 with nothing
                # measuring it — median_latency_ms below answers a different
                # question, how long the full answer takes to arrive, and says
                # so explicitly in its own report.
                parts: list[bytes] = []
                while True:
                    chunk = response.read(4096)
                    if not chunk:
                        break
                    if ttft_ms is None:
                        ttft_ms = int((time.time() - sent) * 1000)
                    parts.append(chunk)
                body = b"".join(parts).decode()
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()[:300]
        # 503 from the chat route carries type/message/reason, and `reason`
        # separates a spent daily quota from a per-minute limit. Keeping it is
        # the difference between "re-run tomorrow" and "re-run in a minute".
        try:
            parsed = json.loads(raw)
        except ValueError:
            # A body that is not ours — a platform error page. Vercel returns
            # one of these when it kills a function at maxDuration, and dropping
            # the code here is what made two 62-second failures indistinguishable
            # from a stream that carried nothing: both landed in the report as
            # type "error" with no reason at all.
            return {"error": f"HTTP {exc.code}", "body": raw, "status": exc.code}
        return {**parsed, "status": exc.code}

    if "application/json" in kind:
        return json.loads(body)

    parsed = {
        "answer": body,
        "citations": json.loads(urllib.parse.unquote(citations)) if citations else [],
        "model": response.headers.get("X-Model"),
        "degraded": response.headers.get("X-Degraded") == "1",
        "ttft_ms": ttft_ms,
    }

    # A stream that carried no tokens is a failed generation, not an answer.
    # The route reports that as a 503 now, but this check stays: it still
    # catches a generation that dies partway, where the status is already sent,
    # and it catches a deployment that predates the fix. Trusting the status
    # code alone is what produced citation_validity 0.15 on a full production
    # run with nothing whatsoever wrong with the citations.
    parsed["type"] = "answer" if body.strip() else "empty"
    return parsed


def _score_faithfulness(
    citations: list[dict], question: str, answer: str
) -> tuple[float | None, list[str] | None, str | None]:
    """Reload the exact context the generator saw and grade the answer against it.

    Uses chunkId off each citation (src/lib/types.ts) rather than re-running
    retrieval: retrieval ranking depends on the query embedding, which is not
    guaranteed to reproduce byte for byte, so a second search could hand the
    judge a context the generator never actually saw.

    Returns (score, unsupported_claims, unavailable_reason). The first two are
    both None when nothing could be scored — no citations carried a chunkId,
    none of the cited chunks still exist (a document deleted between
    answering and judging), or judge.judge() gave up on every model. None is
    not 0: it means the question was never graded, and summarise() must keep
    it out of the mean rather than average it in as a faithfulness failure.
    `unavailable_reason` is judge.judge()'s reason ("daily_quota",
    "recitation", "empty", "unparseable") when that's why, else a reason of
    our own ("no_citations", "chunks_not_found") for the two ways this
    function gives up before ever calling the judge.
    """
    ids = [c["chunkId"] for c in citations if c.get("chunkId") is not None]
    if not ids:
        return None, None, "no_citations"

    rows = store.chunks_by_id(ids)
    # Preserve citation order (n=1 first) — the [n] markers in the answer
    # point at that order, and the judge must see the same block numbers.
    ordered = [rows[i] for i in ids if i in rows]
    if not ordered:
        return None, None, "chunks_not_found"

    verdict, reason = judge.judge(judge.build_context(ordered), question, answer)
    if verdict is None:
        return None, None, reason
    return round(verdict.score, 3), verdict.unsupported, None


def run_full(
    items: list[dict],
    api: str,
    token: str,
    delay: float,
    retry_wait: float,
    judge_enabled: bool = False,
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

        # Stop dead on an expired token. Supabase tokens are short-lived and a
        # 26-item run outlives one, at which point every remaining request 401s
        # in milliseconds and lands in the report as a failed question. That is
        # how a run produced refusal_rate 0.0 — sixteen questions that never
        # reached the refusal path at all, averaged as refusals that did not
        # happen. Better to stop with an instruction than to finish and file a
        # report whose worst-looking numbers are artefacts.
        if response.get("status") == 401:
            raise SystemExit(
                f"\n{item['id']}: 401 unauthenticated — access token đã hết hạn.\n"
                f"Đã chạy {len(results)}/{len(items)} câu. Lấy token mới rồi chạy lại:\n"
                "  .venv/Scripts/python -m eval.get_token\n"
            )

        # One retry when the server says the limit was per-minute. That clears
        # on its own, and dropping the item instead costs a data point out of
        # 26 on top of the two requests already spent on it. A spent daily
        # quota is not retried: nothing will change until it resets.
        retried = False
        if response.get("reason") == "rate_limited" and retry_wait:
            print(f"  {item['id']:8} rate limited, chờ {retry_wait:.0f}s rồi thử lại")
            time.sleep(retry_wait)
            # Restart the clock. Leaving it would bill the deliberate wait to the
            # system's response time: the first clean run reported 39s and 44s
            # for questions that answered in nine, and those are the numbers that
            # would have been quoted as latency.
            started = time.time()
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
            # What the dataset says should happen: only some overview questions
            # name a document, and only those that do not should be deflected.
            "expect_needs_document": bool(item.get("expect_needs_document")),
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
            # Time to the first streamed chunk, measured by call_api reading
            # the response incrementally. None for a non-streamed kind
            # (refusal/blocked/needs_document/error) and for a stream that
            # carried nothing — there is no first token to time either way.
            # Distinct from latency_ms above, which is the time to read the
            # whole answer and answers a different question.
            "ttft_ms": response.get("ttft_ms"),
            # Only set when the response was not ours to parse. 504 is the one
            # that matters: it is the platform reporting that the function ran
            # out of time, which is a different failure from anything the route
            # can report about itself.
            "http_status": response.get("status"),
            "answer": answer[:800],
        }

        if (
            item["category"] in RETRIEVABLE
            or (item["category"] in IMAGE and item.get("source"))
        ) and kind == "answer":
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

        if judge_enabled and kind == "answer":
            score, unsupported, reason = _score_faithfulness(
                citations, item["question"], answer
            )
            record["faithfulness_score"] = score
            record["faithfulness_unsupported"] = unsupported
            record["faithfulness_unavailable_reason"] = reason

        results.append(record)
        flag = ""
        if (
            judge_enabled
            and kind == "answer"
            and record.get("faithfulness_score") is None
        ):
            why = record.get("faithfulness_unavailable_reason") or "unknown"
            flag = f"  FAITHFULNESS JUDGE UNAVAILABLE ({why})"
        if kind in ("empty", "error"):
            flag = f"  GENERATION FAILED {record['reason'] or 'no reason given'}"
        print(
            f"  {item['id']:8} {item['category']:14} {kind:15} {latency:5}ms "
            f"{record['model'] or '-':22}{flag}"
        )

    return results


def select_items(items: list[dict], only: str) -> list[dict]:
    """Keep the questions named by id or by category.

    Exists as its own function so the empty case can be tested. A typo would
    otherwise run zero questions, write a report full of nulls, and look for all
    the world like a completed run — the shape of failure this harness has
    produced four times already. It refuses instead, and lists the valid
    categories rather than sending the caller to read the JSON.
    """
    wanted = {w.strip() for w in only.split(",") if w.strip()}
    chosen = [i for i in items if i["id"] in wanted or i["category"] in wanted]

    if not chosen:
        every = sorted({i["category"] for i in items})
        raise SystemExit(
            f"--only {only!r} không khớp id hay nhóm nào.\n"
            f"Các nhóm có sẵn: {', '.join(every)}"
        )

    return chosen


def summarise(results: list[dict]) -> dict:
    def mean(values: list[float]) -> float | None:
        clean = [v for v in values if v is not None]
        return round(sum(clean) / len(clean), 3) if clean else None

    def served(record: dict) -> bool:
        """The request came back with a real response.

        A request that failed measures the transport, not the system, and
        averaging it in produces a number that reads as a verdict. One run
        reported refusal_rate 0.0 — perfect grounding inverted into "never
        refuses" — because sixteen questions 401'd on an expired token and were
        counted as questions the system declined to refuse. Retrieval-only
        records carry no "type" at all and are always served.
        """
        return record.get("type") not in ("error", "empty")

    scored = [r for r in results if served(r)]
    retrievable = [r for r in scored if r["category"] in RETRIEVABLE]
    refuse = [r for r in scored if r["category"] == "should_refuse"]
    overview = [r for r in scored if r["category"] == "overview"]
    # Out of scope, but inside the corpus's own subject — and every one of them
    # clears MIN_COSINE, so the threshold cannot stop them and the grounding
    # prompt is what has to. Deliberately not part of `refuse`: refusal_rate
    # measures the structural path, which these never take. They come back as
    # ordinary answers whose text happens to be a refusal, so counting them
    # there would drop a passing metric to 0.545 while the system was behaving
    # correctly — the same pessimistic-metric failure as citation_validity 0.15.
    hard = [r for r in scored if r["category"] == "hard_negative"]
    # Split the same way overview already splits must_ask/can_answer: by
    # whether hit was actually computed for this record, not by a second
    # category value. image_hit/image_mrr are the answerable ones;
    # image_refuse is the one item that should come back as a refusal.
    image = [r for r in scored if r["category"] in IMAGE]
    image_answerable = [r for r in image if r.get("hit") is not None]
    image_refuse = [r for r in image if r.get("hit") is None]
    cross = [r for r in retrievable if r["cross_lingual"]]
    same = [r for r in retrievable if not r["cross_lingual"]]

    summary = {
        "n_items": len(results),
        # Every rate below is over this, not over n_items. A run where the two
        # differ has not measured the whole eval set, whatever the rates say.
        "n_scored": len(scored),
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
        "median_latency_ms": sorted(r["latency_ms"] for r in scored)[len(scored) // 2]
        if scored
        else 0,
    }

    if any("ttft_ms" in r for r in results):
        # Only "answer" records ever carry a value — a refusal or an error
        # never streamed anything to time, and mean()/sorted() below only see
        # the ones that did, the same None-is-not-a-failure handling as
        # faithfulness above.
        #
        # Hard negatives are excluded, for a reason that only showed up after
        # they were added. Their answers are refusals: short, and decided
        # quickly — 2749 to 3190ms against a median of 8592 for the rest. Five
        # of them joining the sample dropped the reported p90 from 15879 to
        # 13358 and turned an unmet threshold into a met one, while nothing
        # about the system's speed had changed. Timing them alongside real
        # answers also breaks comparison with runs 1-12, which had no such
        # group.
        ttft_values = sorted(
            r["ttft_ms"]
            for r in scored
            if r.get("ttft_ms") is not None
            and r["category"] != "hard_negative"
            and r["category"] not in IMAGE
        )
        summary["median_ttft_ms"] = (
            ttft_values[len(ttft_values) // 2] if ttft_values else None
        )
        # The median alone hid the problem it was supposed to surface. One run
        # sat at 44s — 74% of the function ceiling — while its median looked
        # ordinary, and nothing in the summary said so until two questions
        # finally crossed the line. A tail number is now reported alongside.
        # Nearest-rank p90: the smallest value at least 90% of the sample is
        # under. For n < 10 it is simply the maximum, which is the honest
        # answer at that sample size rather than an interpolated one.
        summary["p90_ttft_ms"] = (
            ttft_values[math.ceil(0.9 * len(ttft_values)) - 1] if ttft_values else None
        )
        summary["n_ttft_measured"] = len(ttft_values)

    if any("citation_validity" in r for r in results):
        # Hard negatives are excluded. The right answer to one of them is a
        # refusal, and citation_validity() returns 0.0 when it finds no [n]
        # marker — so a correct refusal would be scored as a citation failure.
        # That is trap 17, which cost 0.947 on a question that behaved exactly
        # as designed; averaging five more of them in would make it routine.
        citable = [
            r
            for r in scored
            if r["category"] != "hard_negative" and r["category"] not in IMAGE
        ]
        summary["citation_validity"] = mean([r.get("citation_validity") for r in citable])
        # Split by what each item is supposed to do. Dividing by every overview
        # item scored a clean run at 0.333 — two of the three questions name a
        # document and are meant to be answered, so counting them as failures to
        # ask made a perfect result read as a failing one.
        must_ask = [r for r in overview if r.get("expect_needs_document")]
        can_answer = [r for r in overview if not r.get("expect_needs_document")]

        summary["overview_asked_for_document"] = mean(
            [float(r.get("needs_document", False)) for r in must_ask]
        )
        # The other half: a question that does name a document must not be
        # deflected back with "which one?".
        summary["overview_answered_when_named"] = mean(
            [float(r.get("type") == "answer") for r in can_answer]
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
        # Questions the platform killed for running past maxDuration. Counted
        # separately from n_generation_failed because the acceptance threshold
        # on this one is zero: a question that hits the ceiling has no answer at
        # all, which is a different kind of bad from a slow one.
        #
        # Two signals, deliberately. http_status is the reliable one going
        # forward. The latency floor also catches it, and has to stay: reports
        # written before http_status existed would otherwise count zero here and
        # make an unmet threshold read as met.
        summary["n_timeout"] = sum(
            1
            for r in results
            if r.get("http_status") in (502, 504)
            or (
                r.get("type") in ("empty", "error")
                and (r.get("latency_ms") or 0) >= TIMEOUT_FLOOR_MS
            )
        )
        summary["n_degraded"] = sum(1 for r in results if r.get("degraded"))

    if hard:
        # Counted, not scored. Whether one of these was refused lives in the
        # wording of its answer, and a keyword list that decides is a metric
        # waiting to be believed — this project has already produced five
        # numbers that looked like results without being any. faithfulness is
        # the instrument that can actually read them: an answer built from the
        # model's own knowledge has claims the context does not support, and a
        # refusal is scored fully faithful by the judge's own prompt. Which
        # means these are measured on --judge runs and merely recorded on the
        # rest, with the answers in the report for a person to read.
        summary["n_hard_negative"] = len(hard)
        scores = [r.get("faithfulness_score") for r in hard]
        if any(s is not None for s in scores):
            summary["hard_negative_faithfulness"] = mean(scores)

    if image:
        # image_answerable has hit/mrr computed the same way RETRIEVABLE items
        # do; image_refuse never entered that branch (item.get("source") was
        # falsy) so its hit/mrr are None and it is scored on refusal instead,
        # same treatment should_refuse gets.
        summary["n_image"] = len(image)
        if image_answerable:
            summary["image_hit_at_8"] = mean(
                [float(r["hit"]) for r in image_answerable if r.get("hit") is not None]
            )
            summary["image_mrr"] = mean(
                [r["mrr"] for r in image_answerable if r.get("mrr") is not None]
            )
            valid = [
                r.get("citation_validity")
                for r in image_answerable
                if r.get("citation_validity") is not None
            ]
            if valid:
                summary["image_citation_validity"] = mean(valid)
        if image_refuse:
            summary["image_refusal_rate"] = mean(
                [float(r["refused"]) for r in image_refuse]
            )

    if any("faithfulness_score" in r for r in results):
        answered = [r for r in scored if r.get("type") == "answer"]
        # mean() already drops None, so an unscored question is excluded from
        # the average rather than counted as unfaithful — see
        # _score_faithfulness's docstring for why those are different failures.
        summary["faithfulness"] = mean([r.get("faithfulness_score") for r in answered])
        summary["n_faithfulness_unscored"] = sum(
            1 for r in answered if r.get("faithfulness_score") is None
        )
        # A run that comes back with faithfulness=None must say why, not just
        # that it did — "daily_quota" needs a different reaction (wait for
        # reset) than "recitation" (nothing to be done, model-specific and
        # non-deterministic). See judge.judge()'s docstring for what each
        # value means.
        reasons = Counter(
            r["faithfulness_unavailable_reason"]
            for r in answered
            if r.get("faithfulness_score") is None
            and r.get("faithfulness_unavailable_reason")
        )
        if reasons:
            summary["faithfulness_unavailable_reasons"] = dict(reasons)

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
        "--only",
        help="Chỉ chạy các id hoặc nhóm này, cách nhau bằng dấu phẩy. "
        "Ví dụ: --only hard_negative, hoặc --only g-001,g-002. "
        "Khác với --limit ở chỗ --limit lấy N câu ĐẦU, nên nó không bao giờ "
        "với tới các nhóm nằm cuối dataset.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=5.0,
        help="Seconds between questions in full mode, to stay under the "
        "per-minute allowance. 0 restores back-to-back requests.",
    )
    parser.add_argument(
        "--note",
        help="Ghi vào report vì sao lần chạy này tồn tại. Bắt buộc dùng khi "
        "chạy với cấu hình đã bị sửa cố ý, để report không bị đọc nhầm thành "
        "một lần đo sản phẩm.",
    )
    parser.add_argument(
        "--retry-wait",
        type=float,
        default=30.0,
        help="Seconds to wait before retrying a question the server rejected "
        "as rate limited. 0 disables the retry.",
    )
    parser.add_argument(
        "--judge",
        action="store_true",
        help="Grade every generated answer for faithfulness with an LLM judge. "
        "Full mode only — spends one extra generation call per answered "
        "question, from the same daily-per-model budget as generation itself.",
    )
    args = parser.parse_args()

    if args.judge and (args.retrieval_only or args.dense_only):
        raise SystemExit(
            "--judge needs full mode: it grades real answers from /api/chat, "
            "and retrieval-only never generates one."
        )

    config.assert_ready()

    items = load_items()

    if args.only:
        items = select_items(items, args.only)

    if args.limit:
        items = items[: args.limit]

    retrieval_only = args.retrieval_only or args.dense_only
    mode = "dense-only" if args.dense_only else "retrieval" if retrieval_only else "full"
    judge_note = " judge=on" if args.judge else ""
    print(
        f"mode={mode}  items={len(items)}  MIN_COSINE={config.MIN_COSINE}{judge_note}\n"
    )

    if not retrieval_only:
        # Printed before anything is spent. The daily allowance is small enough
        # that starting a run which cannot finish is a real way to waste it, and
        # the number is not obvious: each question costs a guardrail call as
        # well as an answer.
        judged = f" + tối đa {len(items)} lượt chấm" if args.judge else ""
        print(f"≈ {len(items) * 2} request sinh{judged}\n")

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
        results = run_full(
            items, args.api, args.token, args.delay, args.retry_wait, args.judge
        )

    summary = summarise(results)
    report = {
        "mode": mode,
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
        # Which deployment produced these numbers. A full-mode report that does
        # not say whether it hit localhost or production cannot be cited.
        "api": None if retrieval_only else args.api,
        # Why this run exists. A run made with a deliberately altered prompt
        # produces a report shaped exactly like a real measurement, and the
        # chapter that quotes these files cannot tell them apart without this.
        "note": args.note,
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
