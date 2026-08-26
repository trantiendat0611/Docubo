"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteDocument } from "@/lib/documents";
import { useLang } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase/client";

/**
 * The user's documents.
 *
 * Queried straight from Supabase with the browser client rather than through an
 * API route. There is no owner filter in this file because there does not need
 * to be: the row-level policies scope the query to the signed-in user, and a
 * missing filter here would return nothing rather than someone else's corpus.
 * Deletion works the same way — the delete policy is the check.
 */

interface Doc {
  id: string;
  filename: string;
  title: string | null;
  lang: string;
  n_pages: number | null;
  created_at: string;
}

export function DocumentList({
  conversationId,
  reloadKey,
  onChange,
}: {
  conversationId: string | null;
  reloadKey: number;
  onChange: () => void;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLang();

  const load = useCallback(async () => {
    const client = browserClient();

    // The list is what the open chat can answer from, which is the join table
    // rather than everything the user owns. An unsaved chat holds nothing yet —
    // listing the whole account here is what made a deleted chat look like a
    // fresh one while quietly searching every document in it.
    if (!conversationId) {
      setDocs([]);
      setLoading(false);
      return;
    }

    const { data: attached } = await client
      .from("conversation_documents")
      .select("document_id")
      .eq("conversation_id", conversationId);
    const ids = (attached ?? []).map((r) => r.document_id as string);

    if (ids.length === 0) {
      setDocs([]);
      setLoading(false);
      return;
    }

    const { data } = await client
      .from("documents")
      .select("id, filename, title, lang, n_pages, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });
    setDocs((data as Doc[]) ?? []);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  /**
   * Take the document out of this chat, keeping the document.
   *
   * A document can belong to several conversations, so destroying the file
   * because it was removed from one of them would take it out of the others
   * too — and re-ingesting costs vision quota that the join table exists to
   * avoid spending twice.
   */
  async function detach(doc: Doc) {
    const label = doc.title ?? doc.filename;
    if (!conversationId) return;
    if (!confirm(t.docs.confirmDetach(label))) return;

    await browserClient()
      .from("conversation_documents")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("document_id", doc.id);

    onChange();
  }

  /**
   * Destroy the document everywhere.
   *
   * This used to live in the no-conversation view, which no longer lists
   * anything — so without it here there would be no way to delete a document at
   * all, and the storage cleanup in deleteDocument could never run. Kept
   * separate from the button next to it because the two are easy to confuse and
   * only one of them is reversible by re-attaching.
   */
  async function destroy(doc: Doc) {
    const label = doc.title ?? doc.filename;
    if (!confirm(t.docs.confirmDestroy(label))) {
      return;
    }

    // Chunks, the job and its page cache all cascade. The uploaded PDF does
    // not — Storage has no foreign key — so deleteDocument removes it too.
    await deleteDocument(browserClient(), doc.id);
    onChange();
  }

  if (loading) return <p className="muted">{t.docs.loading}</p>;

  if (docs.length === 0) {
    return <p className="muted">{t.docs.empty}</p>;
  }

  return (
    <ul className="doclist">
      {docs.map((doc) => (
        <li key={doc.id}>
          <div className="doc-main">
            <span className="doc-title">{doc.title ?? doc.filename}</span>
            <span className="doc-meta">
              {doc.n_pages ? t.docs.pages(doc.n_pages) : ""}
              {doc.lang}
            </span>
          </div>
          <span className="doc-actions">
            <button
              type="button"
              className="link remove"
              aria-label={t.docs.detachLabel(doc.title ?? doc.filename)}
              onClick={() => void detach(doc)}
            >
              {t.docs.detach}
            </button>
            <button
              type="button"
              className="link link-danger remove"
              aria-label={t.docs.destroyLabel(doc.title ?? doc.filename)}
              onClick={() => void destroy(doc)}
            >
              {t.docs.destroy}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
