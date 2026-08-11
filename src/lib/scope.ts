import type { DocumentSummary } from "./types";

/**
 * Match a document the user named in their question.
 *
 * People refer to a document by whatever is on screen — a filename, an arXiv
 * id, part of a title. Without this, "tóm tắt tài liệu 2402.00253v2" searches
 * the whole corpus for a string that embeds to nothing, and returns whichever
 * document happens to share a topic. That is the observed failure: a summary
 * request for one paper answered from eight chunks of an unrelated slide deck.
 *
 * Kept out of retrieve.ts so it can be tested without pulling in next/headers.
 */
export function resolveMentionedDocument(
  question: string,
  documents: DocumentSummary[],
): DocumentSummary | null {
  const haystack = question.toLowerCase();

  const candidates = documents
    .map((doc) => {
      const names = [
        doc.filename,
        doc.filename.replace(/\.pdf$/i, ""),
        doc.title ?? "",
      ]
        // Short names match by accident. "ML" would fire on any question
        // containing those two letters.
        .filter((name) => name.length >= 4)
        .map((name) => name.toLowerCase());

      const hit = names.find((name) => haystack.includes(name));
      return hit ? { doc, length: hit.length } : null;
    })
    .filter((x): x is { doc: DocumentSummary; length: number } => x !== null);

  if (candidates.length === 0) return null;

  // Longest match wins, so "Machine learning va Deep learning" beats a document
  // merely titled "Machine learning" when the question names the longer one.
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0].doc;
}
