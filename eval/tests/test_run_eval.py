"""Tests for the faithfulness wiring in run_eval.py.

Pure-logic slice only: _score_faithfulness's job is turning a citations list
into (score, unsupported_claims, unavailable_reason) by reloading chunk text
and asking judge.judge to grade it. store.chunks_by_id and judge.judge are
both monkeypatched, so this never touches Supabase or Gemini — the network
calls themselves belong to the eval run described in KE_HOACH_THUC_TAP.md,
not to CI.
"""

from __future__ import annotations

from eval import run_eval
from eval.judge import FaithfulnessJudgment


def test_no_chunk_ids_means_unscored_without_calling_anything(monkeypatch):
    called = False

    def fail(*a, **kw):
        nonlocal called
        called = True

    monkeypatch.setattr(run_eval.store, "chunks_by_id", fail)

    result = run_eval._score_faithfulness([], "question", "answer")

    assert result == (None, None, "no_citations")
    assert called is False


def test_reloads_context_in_citation_order_and_scores_it(monkeypatch):
    citations = [
        {"n": 1, "chunkId": 42},
        {"n": 2, "chunkId": 7},
    ]
    # Deliberately returned out of citation order, the way a dict keyed by id
    # naturally would be — _score_faithfulness must not trust dict order.
    rows_by_id = {
        7: {"filename": "b.pdf", "page_start": 2, "page_end": 2, "display_text": "B"},
        42: {"filename": "a.pdf", "page_start": 1, "page_end": 1, "display_text": "A"},
    }
    monkeypatch.setattr(run_eval.store, "chunks_by_id", lambda ids: rows_by_id)

    seen_context = {}

    def fake_judge(context, question, answer):
        seen_context["value"] = context
        return (
            FaithfulnessJudgment(n_claims=2, n_supported=1, unsupported=["x"], score=0.5),
            None,
        )

    monkeypatch.setattr(run_eval.judge, "judge", fake_judge)

    score, unsupported, reason = run_eval._score_faithfulness(citations, "q", "a")

    assert score == 0.5
    assert unsupported == ["x"]
    assert reason is None
    # Block [1] must be chunk 42's text, matching citation order, not the
    # order chunks_by_id happened to return them in.
    assert seen_context["value"].index('n="1"') < seen_context["value"].index('n="2"')
    assert "A" in seen_context["value"]
    assert seen_context["value"].index("A") < seen_context["value"].index("B")


def test_unavailable_judge_is_unscored_not_zero_and_keeps_the_reason(monkeypatch):
    citations = [{"n": 1, "chunkId": 1}]
    monkeypatch.setattr(
        run_eval.store,
        "chunks_by_id",
        lambda ids: {
            1: {"filename": "a.pdf", "page_start": 1, "page_end": 1, "display_text": "A"}
        },
    )
    monkeypatch.setattr(run_eval.judge, "judge", lambda *a, **kw: (None, "recitation"))

    result = run_eval._score_faithfulness(citations, "q", "a")

    assert result == (None, None, "recitation")


def test_missing_chunk_row_is_unscored(monkeypatch):
    """The cited chunk was deleted between answering and judging.

    chunks_by_id returning nothing for an id it was asked about is a real,
    expected shape — Supabase's `.in_("id", ids)` simply omits rows that no
    longer exist, it does not error.
    """
    citations = [{"n": 1, "chunkId": 99}]
    monkeypatch.setattr(run_eval.store, "chunks_by_id", lambda ids: {})

    called = False

    def fail(*a, **kw):
        nonlocal called
        called = True

    monkeypatch.setattr(run_eval.judge, "judge", fail)

    result = run_eval._score_faithfulness(citations, "q", "a")

    assert result == (None, None, "chunks_not_found")
    # No context to judge means no point spending a judge call on it.
    assert called is False


def _record(**overrides):
    """Minimal record shape summarise() needs to run without crashing —
    category/cross_lingual/refused/latency_ms/type are read unconditionally.
    """
    base = {
        "category": "text",
        "cross_lingual": False,
        "refused": False,
        "latency_ms": 1000,
        "type": "answer",
    }
    return {**base, **overrides}


def test_summarise_reports_median_ttft_over_measured_answers_only():
    results = [
        _record(ttft_ms=300),
        _record(ttft_ms=500),
        _record(ttft_ms=700),
        # A refusal streams nothing, so it carries the key with no value —
        # must be excluded from the median, not treated as 0ms.
        _record(type="refusal", refused=True, ttft_ms=None),
    ]

    summary = run_eval.summarise(results)

    assert summary["median_ttft_ms"] == 500
    assert summary["n_ttft_measured"] == 3


def test_summarise_omits_ttft_keys_for_a_retrieval_only_run():
    """retrieval-only records never carry ttft_ms at all — the key must not
    appear in the summary just because summarise() ran."""
    summary = run_eval.summarise([_record()])

    assert "median_ttft_ms" not in summary
    assert "n_ttft_measured" not in summary


def test_summarise_tallies_why_faithfulness_went_unscored():
    """The 18/08 production run came back faithfulness=null for all 19
    answered questions with no way to tell quota exhaustion apart from
    RECITATION — this is the fix: summarise() must say which, and how often.
    """
    results = [
        _record(faithfulness_score=1.0, faithfulness_unavailable_reason=None),
        _record(faithfulness_score=None, faithfulness_unavailable_reason="daily_quota"),
        _record(faithfulness_score=None, faithfulness_unavailable_reason="daily_quota"),
        _record(faithfulness_score=None, faithfulness_unavailable_reason="recitation"),
    ]

    summary = run_eval.summarise(results)

    assert summary["n_faithfulness_unscored"] == 3
    assert summary["faithfulness_unavailable_reasons"] == {
        "daily_quota": 2,
        "recitation": 1,
    }


def test_summarise_omits_the_reasons_key_when_everything_got_scored():
    results = [_record(faithfulness_score=1.0, faithfulness_unavailable_reason=None)]

    summary = run_eval.summarise(results)

    assert "faithfulness_unavailable_reasons" not in summary


def test_summarise_reports_a_p90_alongside_the_median():
    """The median is what hid the problem. One run sat at 44s — 74% of the
    function ceiling — while its median looked ordinary, and no number in the
    summary said so until two questions finally crossed the line.
    """
    results = [
        _record(ttft_ms=ms) for ms in (100, 200, 300, 400, 500, 600, 700, 800, 900, 9000)
    ]

    summary = run_eval.summarise(results)

    assert summary["median_ttft_ms"] == 600
    # Nearest-rank over ten values: the ninth, which is the first the tail
    # cannot hide behind.
    assert summary["p90_ttft_ms"] == 900


def test_p90_is_the_maximum_when_the_sample_is_smaller_than_ten():
    """An interpolated p90 over four points invents precision the sample does
    not have. The largest observed value is the honest answer."""
    results = [_record(ttft_ms=ms) for ms in (1000, 2000, 3000, 20000)]

    summary = run_eval.summarise(results)

    assert summary["p90_ttft_ms"] == 20000


def test_summarise_counts_a_gateway_timeout_from_its_status():
    results = [
        _record(citation_validity=1.0),
        _record(type="error", citation_validity=None, latency_ms=62402, http_status=504),
    ]

    summary = run_eval.summarise(results)

    assert summary["n_timeout"] == 1
    assert summary["n_generation_failed"] == 1


def test_summarise_still_counts_a_timeout_in_a_report_written_before_http_status():
    """Reports from before the field existed carry only the latency. Counting
    on status alone would report zero for those runs and make an unmet
    threshold read as met — which is the failure mode this metric exists to
    stop, arriving through the metric itself."""
    results = [
        _record(citation_validity=1.0),
        _record(type="error", citation_validity=None, latency_ms=62580),
    ]

    summary = run_eval.summarise(results)

    assert summary["n_timeout"] == 1


def test_a_failure_the_route_reported_itself_is_not_a_timeout():
    """503 with a reason comes back in milliseconds. Counting it here would
    blame the platform for a quota the route handled correctly."""
    results = [
        _record(citation_validity=1.0),
        _record(
            type="error", citation_validity=None, latency_ms=430, reason="daily_quota"
        ),
    ]

    summary = run_eval.summarise(results)

    assert summary["n_timeout"] == 0
    assert summary["n_generation_failed"] == 1
