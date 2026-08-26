"use client";

import { useLang } from "@/lib/i18n";
import type { Citation } from "@/lib/types";

/**
 * The source panel. Every [n] marker in an answer resolves to a row here.
 *
 * P1: make each row open the rendered page image from data/pages — those PNGs
 * already exist from the ingest run. Showing the actual page beside the answer
 * is the strongest possible demonstration that the model is not making things up.
 */
export function CitationList({ citations }: { citations: Citation[] }) {
  const { t } = useLang();
  if (citations.length === 0) return null;

  return (
    <aside className="citations">
      <h3>{t.citations.heading}</h3>
      <ol>
        {citations.map((c) => (
          <li key={c.n}>
            <span className="marker">[{c.n}]</span>{" "}
            <span className="file">{c.title ?? c.filename}</span>{" "}
            <span className="pages">
              {c.pageStart === c.pageEnd
                ? t.citations.page(c.pageStart)
                : t.citations.pageRange(c.pageStart, c.pageEnd)}
            </span>{" "}
            <span className="score">{c.score.toFixed(2)}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
