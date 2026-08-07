"""Evaluation metrics.

Four numbers, each answering a different question. Report all four in chapter 4
of the report — a single "accuracy" figure hides which half of the pipeline is
broken.

    retrieval_hit_at_k   Did the right page come back at all?
                         Isolates the retriever from the generator. If this is
                         low, prompt tuning is wasted effort.

    citation_accuracy    Do the [n] markers point at pages that actually
                         support the claim? Catches the failure where the answer
                         is right but the citation is decorative.

    faithfulness         Is every claim supported by the retrieved context?
                         Judged by Gemini against the context, not against the
                         world. This is the anti-hallucination number.

    refusal_rate         On the should_refuse group, how often did the system
                         correctly decline? A system that never refuses is not
                         grounded, it is lucky.

Also worth reporting, and cheap to produce:

    latex_exact_match    For formula items with expected_latex, the normalised
                         match rate between extracted and ground-truth LaTeX.
                         Turns "the extraction seems good" into a number.
"""

from __future__ import annotations

import re


def hit_at_k(retrieved_pages: list[int], expected_pages: list[int]) -> bool:
    """True when any expected page appears in the retrieved set."""
    if not expected_pages:
        return True
    return bool(set(retrieved_pages) & set(expected_pages))


def mrr(retrieved_pages: list[int], expected_pages: list[int]) -> float:
    """Mean reciprocal rank — rewards putting the right page first, not fifth."""
    for i, p in enumerate(retrieved_pages, start=1):
        if p in expected_pages:
            return 1.0 / i
    return 0.0


_CITATION = re.compile(r"\[(\d+)\]")


def cited_indices(answer: str) -> list[int]:
    return sorted({int(m) for m in _CITATION.findall(answer)})


def citation_validity(answer: str, n_blocks: int) -> float:
    """Fraction of citation markers that refer to a block that was supplied.

    A marker like [9] when only 8 blocks were given is a fabricated citation —
    the clearest possible grounding failure, and free to detect.
    """
    cited = cited_indices(answer)
    if not cited:
        return 0.0
    valid = [c for c in cited if 1 <= c <= n_blocks]
    return len(valid) / len(cited)


def normalise_latex(s: str) -> str:
    """Collapse cosmetic differences before comparing two LaTeX strings.

    Extraction will never reproduce the author's source byte for byte —
    \\dfrac vs \\frac, spacing, \\left( vs (. Normalising these keeps the metric
    honest about content while ignoring formatting.
    """
    s = s.strip().strip("$")
    s = re.sub(r"\\(d|t)frac", r"\\frac", s)
    s = re.sub(r"\\(left|right|,|;|!|quad|qquad)\b", "", s)
    s = re.sub(r"\\mathrm|\\mathbf|\\bm|\\text", "", s)
    s = re.sub(r"[{}\s]", "", s)
    return s


def latex_match(extracted: str, expected: str) -> bool:
    if not expected:
        return False
    return normalise_latex(extracted) == normalise_latex(expected)


FAITHFULNESS_PROMPT = """You are grading a document question-answering system.

You will be given CONTEXT blocks, a QUESTION, and an ANSWER.

Judge only whether the answer is supported by the context. Do not judge whether
the answer is true in general — an answer that is factually correct but not
present in the context must score 0 for that claim.

Return JSON:
{
  "n_claims": <int, factual claims in the answer>,
  "n_supported": <int, claims fully supported by the context>,
  "unsupported": [<the unsupported claims, verbatim>],
  "score": <n_supported / n_claims, 0.0 to 1.0>
}

Refusals count as fully faithful (score 1.0) when the context genuinely does not
contain the answer, and 0.0 when it does.
"""
