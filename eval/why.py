"""Measure the two design decisions section 1 asserts.

    .venv/Scripts/python -m eval.why dual
    .venv/Scripts/python -m eval.why bilingual

Both spend embedding quota only, which is far wider than the generation budget,
so they can be re-run freely.

`dual`      Embeds a formula twice — raw LaTeX, and the spoken reading stored in
            embed_text — and scores both against a question a user would ask.
            Section 1.2 claims raw LaTeX embeds into near-meaningless vectors;
            this is the number behind that claim.

`bilingual` Runs a Vietnamese question against an English corpus with and
            without the English query variant, and reports where the expected
            page lands. Section 1.3 claims the lexical arms cannot cross
            languages on their own.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ingest import config
from ingest.pipeline import embed, store


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def dual_representation() -> None:
    """Score a question against the same formula in both representations."""
    cached = Path(config.ROOT) / "data" / "cache" / "testta1" / "p0033.json"
    page = json.loads(cached.read_text(encoding="utf-8"))
    formula = page["formulas"][0]

    question = "How is the score function defined as an inner product?"

    print("Câu hỏi:", question)
    print("\nLaTeX thô :", formula["latex"])
    print("Diễn giải :", formula["plain"][:120])
    print("\n… đang embed (3 request embedding)\n")

    q = embed.embed_query(question)
    v_latex = embed.embed_query(formula["latex"])
    v_plain = embed.embed_query(formula["plain"])

    c_latex = cosine(q, v_latex)
    c_plain = cosine(q, v_plain)

    print(f"  cosine(câu hỏi, LaTeX thô)   {c_latex:.3f}")
    print(f"  cosine(câu hỏi, diễn giải)   {c_plain:.3f}")
    print(f"  chênh lệch                   {c_plain - c_latex:+.3f}")
    print(f"\n  MIN_COSINE = {config.MIN_COSINE}")
    for label, score in (("LaTeX thô", c_latex), ("diễn giải", c_plain)):
        over = score >= config.MIN_COSINE
        verdict = "VƯỢT ngưỡng" if over else "DƯỚI ngưỡng → bị từ chối"
        print(f"    {label:12} {verdict}")


def dual_on_real_chunks() -> None:
    """Score real questions against a whole chunk, both ways round.

    The bare-formula version of this test embedded a lone LaTeX string against a
    question phrased around the formula's structure, and found almost no gap.
    That test was weak in two ways: the system never embeds a formula alone, and
    a user does not ask about notation. This one uses what is actually stored —
    embed_text, with formulas replaced by their spoken reading — against
    display_text, which is exactly what would be embedded had the substitution
    never been made, scored with the real questions from the eval set.
    """
    from supabase import create_client

    client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
    rows = (
        client.table("chunks")
        .select("id, page_start, page_end, embed_text, display_text")
        .or_("has_formula.eq.true,has_figure.eq.true")
        .execute()
        .data
    )

    dataset = Path(config.ROOT) / "eval" / "eval_dataset.json"
    items = json.loads(dataset.read_text("utf-8"))["items"]
    subjects = [i for i in items if i["category"] in ("formula", "figure")]

    print(f"{len(rows)} chunk · {len(subjects)} câu hỏi nhóm formula và figure")

    for item in subjects:
        expected = set(item["expected_pages"])

        # Pick the chunk that covers the most of the expected pages, tying on
        # id. Taking whichever row came back first made the comparison depend
        # on the database's ordering: widening the filter from two candidates
        # to thirty-nine silently swapped the chunk under test and moved every
        # score by more than the effect being measured.
        def overlap(row: dict, wanted: set[int] = expected) -> tuple[int, int]:
            pages = set(range(row["page_start"], row["page_end"] + 1))
            return (len(pages & wanted), -row["id"])

        match = [
            r for r in rows if set(range(r["page_start"], r["page_end"] + 1)) & expected
        ]
        if not match:
            print(f"{item['id']}: không có chunk phủ trang {sorted(expected)}")
            continue

        chunk = max(match, key=overlap)
        q = embed.embed_query(item["question"])
        c_embed = cosine(q, embed.embed_query(chunk["embed_text"]))
        c_display = cosine(q, embed.embed_query(chunk["display_text"]))

        print(
            f"{item['id']}  [{item['category']}]  ({item['q_lang']})  "
            f"{item['question'][:48]}"
        )
        print(f"    embed_text   (diễn giải) {c_embed:.3f}")
        print(f"    display_text (LaTeX)     {c_display:.3f}")
        print(f"    chênh lệch               {c_embed - c_display:+.3f}\n")


def bilingual(item_id: str) -> None:
    """Retrieve a Vietnamese question with and without its English variant."""
    dataset = Path(config.ROOT) / "eval" / "eval_dataset.json"
    data = json.loads(dataset.read_text("utf-8"))
    item = next(i for i in data["items"] if i["id"] == item_id)

    print(f"Câu hỏi ({item['q_lang']}): {item['question']}")
    print(f"Tài liệu: {item.get('doc_lang')}")
    print(f"Trang mong đợi: {item['expected_pages']}")
    print(f"Biến thể EN: {item.get('query_en')}")
    print("\n… đang embed và truy hồi (1 request embedding)\n")

    vector = embed.embed_query(item["question"])
    expected = set(item["expected_pages"])

    def rank_of(rows: list[dict]) -> str:
        for i, r in enumerate(rows, start=1):
            pages = set(range(r["page_start"], r["page_end"] + 1))
            if pages & expected:
                return f"hạng {i}"
        return "KHÔNG có trong top-8"

    # The dense arm is identical in both calls — the same embedding of the same
    # Vietnamese question. Only the two full-text arms receive different strings,
    # so any change in rank belongs to them.
    both = store.search(
        vector,
        item.get("query_en") or item["question"],
        item.get("query_vi") or item["question"],
    )
    vi_only = store.search(vector, item["question"], item["question"])

    print(f"  có biến thể EN   → {rank_of(both)}")
    print(f"  chỉ tiếng Việt   → {rank_of(vi_only)}")
    print("\n  (nhánh dense giống nhau ở cả hai; khác biệt đến từ nhánh full-text)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("what", choices=["dual", "dual-real", "bilingual"])
    ap.add_argument("--item", default="t-005", help="Mã câu hỏi cho 'bilingual'.")
    args = ap.parse_args()

    if args.what == "dual":
        dual_representation()
    elif args.what == "dual-real":
        dual_on_real_chunks()
    else:
        bilingual(args.item)


if __name__ == "__main__":
    main()
