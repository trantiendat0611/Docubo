"use client";

import { useCallback, useEffect, useState } from "react";
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

export function DocumentList({ reloadKey }: { reloadKey: number }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await browserClient()
      .from("documents")
      .select("id, filename, title, lang, n_pages, created_at")
      .order("created_at", { ascending: false });

    setDocs((data as Doc[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function remove(doc: Doc) {
    const label = doc.title ?? doc.filename;
    if (!confirm(`Xoá "${label}"? Các đoạn đã lập chỉ mục cũng bị xoá theo.`)) return;

    // Chunks go with it: the foreign key cascades.
    await browserClient().from("documents").delete().eq("id", doc.id);
    void load();
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
            aria-label={`Xoá ${doc.title ?? doc.filename}`}
            onClick={() => void remove(doc)}
          >
            Xoá
          </button>
        </li>
      ))}
    </ul>
  );
}
