"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteDocument } from "@/lib/documents";
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

  const load = useCallback(async () => {
    const client = browserClient();

    // Inside a conversation the list is what that conversation can answer from,
    // which is the join table rather than everything the user owns.
    let ids: string[] | null = null;
    if (conversationId) {
      const { data } = await client
        .from("conversation_documents")
        .select("document_id")
        .eq("conversation_id", conversationId);
      ids = (data ?? []).map((r) => r.document_id as string);
    }

    if (ids?.length === 0) {
      setDocs([]);
      setLoading(false);
      return;
    }

    let query = client
      .from("documents")
      .select("id, filename, title, lang, n_pages, created_at")
      .order("created_at", { ascending: false });

    if (ids) query = query.in("id", ids);

    const { data } = await query;
    setDocs((data as Doc[]) ?? []);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  /**
   * Inside a conversation, removing detaches; outside it, it deletes.
   *
   * A document can belong to several conversations, so destroying the file
   * because it was removed from one of them would take it out of the others
   * too — and re-ingesting costs vision quota that the join table exists to
   * avoid spending twice.
   */
  async function remove(doc: Doc) {
    const label = doc.title ?? doc.filename;
    const client = browserClient();

    if (conversationId) {
      if (!confirm(`Bỏ "${label}" khỏi khung chat này? Tài liệu vẫn được giữ lại.`)) return;
      await client
        .from("conversation_documents")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("document_id", doc.id);
    } else {
      if (!confirm(`Xoá hẳn "${label}"? Các đoạn đã lập chỉ mục và file gốc cũng bị xoá theo.`))
        return;
      // Chunks, the job and its page cache all cascade. The uploaded PDF does
      // not — Storage has no foreign key — so deleteDocument removes it too.
      await deleteDocument(client, doc.id);
    }

    onChange();
  }

  if (loading) return <p className="muted">Đang tải danh sách…</p>;

  if (docs.length === 0) {
    return <p className="muted">Chưa có tài liệu nào.</p>;
  }

  return (
    <ul className="doclist">
      {docs.map((doc) => (
        <li key={doc.id}>
          <div className="doc-main">
            <span className="doc-title">{doc.title ?? doc.filename}</span>
            <span className="doc-meta">
              {doc.n_pages ? `${doc.n_pages} trang · ` : ""}
              {doc.lang}
            </span>
          </div>
          <button
            type="button"
            className="link link-danger remove"
            aria-label={`${conversationId ? "Bỏ khỏi khung chat" : "Xoá"} ${doc.title ?? doc.filename}`}
            onClick={() => void remove(doc)}
          >
            {conversationId ? "Bỏ ra" : "Xoá"}
          </button>
        </li>
      ))}
    </ul>
  );
}
