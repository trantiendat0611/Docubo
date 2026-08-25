"""Tests for the faithfulness judge.

Offline only, like ingest/tests/test_chunk.py: `_call` is monkeypatched so
these exercise the model-rotation and parsing logic without an API key or
network access. `judge()`'s daily-quota rotation mirrors
ingest/pipeline/vision.py's, which has no direct test of its own — this is
the first test of that pattern in either language, so it is worth covering
two branches a vision-only test never reached: a *non*-daily-quota
ClientError must propagate rather than being swallowed as "try the next
model", and a RECITATION refusal (the same failure vision.py exists to
retry past) is a real risk here too, since CONTEXT and ANSWER both reproduce
document text close to verbatim.
"""

from __future__ import annotations

import pytest
from google.genai import errors

from eval import judge as judge_module
from ingest import config


@pytest.fixture(autouse=True)
def _clean_exhausted_set():
    """_EXHAUSTED is module-level and would otherwise leak between tests."""
    judge_module._EXHAUSTED.clear()
    yield
    judge_module._EXHAUSTED.clear()


def _daily_quota_error() -> errors.ClientError:
    return errors.ClientError(
        429,
        {"error": {"details": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}]}},
    )


def test_build_context_numbers_blocks_and_formats_page_ranges():
    chunks = [
        {"filename": "a.pdf", "page_start": 3, "page_end": 3, "display_text": "one"},
        {"filename": "b.pdf", "page_start": 5, "page_end": 7, "display_text": "two"},
    ]

    context = judge_module.build_context(chunks)

    assert '<block n="1" source="a.pdf" pages="p.3">' in context
    assert "one" in context
    assert '<block n="2" source="b.pdf" pages="p.5-7">' in context
    assert "two" in context
    # Order in the output must match input order, since that order is what the
    # [n] markers in the answer being judged actually point at.
    assert context.index('n="1"') < context.index('n="2"')


def test_build_context_resolves_figure_placeholders_instead_of_leaking_them():
    """Regression test for the sibling of bẫy #28.

    display_text keeps [[FIGURE:id]] intact by design — see chunk.ts and
    chunk.py — and prompt.ts's buildContext() resolves it before the model
    ever sees it. This module reads display_text straight from the database
    to rebuild what the generator saw, which means it silently inherited the
    same unresolved-placeholder bug the TypeScript side already fixed: found
    when g-001 and g-002, the only two `figure` questions in the eval set,
    both scored faithfulness 0.0 despite answering with the exact expected
    numbers, because the judge was grading against the placeholder, not the
    data the model actually had.
    """
    chunks = [
        {
            "filename": "a.pdf",
            "page_start": 1,
            "page_end": 1,
            "display_text": "See the table.\n\n[[FIGURE:fig-1-1]]",
            "figure_refs": [
                {
                    "id": "fig-1-1",
                    "caption": "Cell features",
                    "description": "A table of cell types.",
                    "data": "color, #nuclei, #tails",
                }
            ],
        }
    ]

    context = judge_module.build_context(chunks)

    assert "[[FIGURE:fig-1-1]]" not in context
    assert "color, #nuclei, #tails" in context
    assert "A table of cell types." in context


def test_build_context_drops_a_placeholder_cleanly_when_its_figure_is_missing():
    chunks = [
        {
            "filename": "a.pdf",
            "page_start": 1,
            "page_end": 1,
            "display_text": "before [[FIGURE:missing]] after",
            "figure_refs": [],
        }
    ]

    context = judge_module.build_context(chunks)

    assert "[[FIGURE:" not in context
    assert "before" in context and "after" in context


def test_judge_rotates_past_a_model_that_has_spent_its_day(monkeypatch):
    monkeypatch.setattr(config, "VISION_MODELS", ["model-a", "model-b"])

    calls: list[str] = []

    def fake_call(model, context, question, answer):
        calls.append(model)
        if model == "model-a":
            raise _daily_quota_error()
        return '{"n_claims": 2, "n_supported": 2, "unsupported": [], "score": 1.0}', ""

    monkeypatch.setattr(judge_module, "_call", fake_call)

    verdict, reason = judge_module.judge("context", "question", "answer")

    assert calls == ["model-a", "model-b"]
    assert verdict is not None
    assert verdict.score == 1.0
    assert reason is None
    assert "model-a" in judge_module._EXHAUSTED


def test_judge_reports_daily_quota_when_every_model_is_exhausted(monkeypatch):
    monkeypatch.setattr(config, "VISION_MODELS", ["model-a", "model-b"])
    monkeypatch.setattr(
        judge_module,
        "_call",
        lambda *a, **kw: (_ for _ in ()).throw(_daily_quota_error()),
    )

    verdict, reason = judge_module.judge("context", "question", "answer")

    assert verdict is None
    assert reason == "daily_quota"
    assert {"model-a", "model-b"} == judge_module._EXHAUSTED


def test_judge_reports_recitation_without_marking_the_model_exhausted(monkeypatch):
    """RECITATION is a real refusal, not a quota failure — the model must not
    be retired from the chain over it the way a daily-quota model is,
    because unlike quota it is known to be intermittent, not persistent
    (see SKILL_MY_PROJECT.md trap #3b).
    """
    monkeypatch.setattr(config, "VISION_MODELS", ["model-a"])
    monkeypatch.setattr(judge_module, "_call", lambda *a, **kw: ("", "RECITATION"))

    verdict, reason = judge_module.judge("context", "question", "answer")

    assert verdict is None
    assert reason == "recitation"
    assert set() == judge_module._EXHAUSTED


def test_judge_reports_empty_when_a_model_returns_nothing_for_another_reason(
    monkeypatch,
):
    monkeypatch.setattr(config, "VISION_MODELS", ["model-a"])
    monkeypatch.setattr(judge_module, "_call", lambda *a, **kw: ("   ", "STOP"))

    verdict, reason = judge_module.judge("context", "question", "answer")

    assert verdict is None
    assert reason == "empty"


def test_judge_moves_on_from_a_model_that_returns_unparseable_json(monkeypatch):
    monkeypatch.setattr(config, "VISION_MODELS", ["model-a", "model-b"])

    def fake_call(model, context, question, answer):
        if model == "model-a":
            return "not json at all", ""
        return '{"n_claims": 1, "n_supported": 0, "unsupported": ["x"], "score": 0.0}', ""

    monkeypatch.setattr(judge_module, "_call", fake_call)

    verdict, reason = judge_module.judge("context", "question", "answer")

    assert verdict is not None
    assert verdict.unsupported == ["x"]
    assert reason is None
    # A schema failure is not a daily-quota failure — model-a must not be
    # marked exhausted over it.
    assert "model-a" not in judge_module._EXHAUSTED


def test_judge_reports_unparseable_when_no_model_ever_produces_valid_json(monkeypatch):
    monkeypatch.setattr(config, "VISION_MODELS", ["model-a"])
    monkeypatch.setattr(judge_module, "_call", lambda *a, **kw: ("not json at all", ""))

    verdict, reason = judge_module.judge("context", "question", "answer")

    assert verdict is None
    assert reason == "unparseable"


def test_judge_repairs_unescaped_latex_backslashes_in_the_response(monkeypatch):
    """The same bad-JSON-escape trap ingest/pipeline/vision.py exists for, from
    the other direction: an unsupported claim quoted verbatim from an answer
    that reproduced a formula, per the grounding prompt's rule to reproduce
    math exactly.
    """
    monkeypatch.setattr(config, "VISION_MODELS", ["model-a"])
    raw = (
        r'{"n_claims": 1, "n_supported": 0, '
        r'"unsupported": ["the answer says \alpha = 1"], "score": 0.0}'
    )
    monkeypatch.setattr(judge_module, "_call", lambda *a, **kw: (raw, ""))

    verdict, reason = judge_module.judge("context", "question", "answer")

    assert verdict is not None
    assert reason is None
    assert "alpha" in verdict.unsupported[0]


def test_judge_does_not_swallow_a_real_client_error(monkeypatch):
    """A non-daily-quota ClientError is a real fault, not a reason to rotate.

    is_transient() already governs whether _call retries a genuine rate limit
    internally; anything that reaches judge() past that has already given up
    retrying and must be surfaced, not treated as if the model ran out of
    budget for the day.
    """
    monkeypatch.setattr(config, "VISION_MODELS", ["model-a", "model-b"])

    def fake_call(model, context, question, answer):
        raise errors.ClientError(403, {"error": {"message": "permission denied"}})

    monkeypatch.setattr(judge_module, "_call", fake_call)

    with pytest.raises(errors.ClientError):
        judge_module.judge("context", "question", "answer")
