"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";

/**
 * The conversation sidebar.
 *
 * Conversations are the one thing in this app the browser both reads and
 * writes. Creating, renaming and deleting a chat is pure UI with no server work
 * to do, and the RLS policies in 007_conversations.sql are what make that safe —
 * the same split the rest of the app uses, applied the other way round.
 */

export interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
}

export function ConversationList({
  currentId,
  onSelect,
  reloadKey,
}: {
  currentId: string | null;
  onSelect: (id: string | null) => void;
  reloadKey: number;
}) {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await browserClient()
      .from("conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false });

    setItems((data ?? []) as Conversation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function create() {
    setError(null);
    const client = browserClient();

    // owner_id is NOT NULL with no default, and the insert policy checks it
    // against auth.uid(). Sending an empty row failed both, and because only
    // `data` was read the failure went nowhere: the button did nothing and said
    // nothing.
    const { data: me } = await client.auth.getUser();
    if (!me.user) {
      setError("Phiên đăng nhập đã hết hạn. Tải lại trang rồi đăng nhập lại.");
      return;
    }

    const { data, error } = await client
      .from("conversations")
      .insert({ owner_id: me.user.id })
      .select("id, title, updated_at")
      .single();

    if (error || !data) {
      setError(`Không tạo được hội thoại: ${error?.message ?? "không rõ lí do"}`);
      return;
    }

    setItems((prev) => [data as Conversation, ...prev]);
    onSelect((data as Conversation).id);
  }

  async function remove(c: Conversation) {
    const label = c.title ?? "Chat mới";
    if (
      !confirm(
        `Xoá "${label}"? Lịch sử hội thoại mất theo. Tài liệu vẫn còn và dùng được ở khung khác.`,
      )
    ) {
      return;
    }

    const { error } = await browserClient()
      .from("conversations")
      .delete()
      .eq("id", c.id);

    if (error) {
      setError(`Không xoá được: ${error.message}`);
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== c.id));
    if (currentId === c.id) onSelect(null);
  }

  async function saveTitle(id: string) {
    const title = draft.trim();
    setRenaming(null);
    if (!title) return;

    const { error } = await browserClient()
      .from("conversations")
      .update({ title })
      .eq("id", id);

    if (error) {
      setError(`Không đổi tên được: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  return (
    <nav className="convo" aria-label="Danh sách hội thoại">
      <button type="button" className="btn btn-secondary convo-new" onClick={() => void create()}>
        + Chat mới
      </button>

      {error && (
        <p className="note note-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="muted">Chưa có hội thoại nào.</p>
      ) : (
        <ul className="convo-list">
          {items.map((c) => (
            <li key={c.id} className={c.id === currentId ? "is-current" : undefined}>
              {renaming === c.id ? (
                <input
                  className="field convo-rename"
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void saveTitle(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveTitle(c.id);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  aria-label="Tên hội thoại"
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="convo-open"
                    onClick={() => onSelect(c.id)}
                    aria-current={c.id === currentId ? "true" : undefined}
                  >
                    {c.title ?? "Chat mới"}
                  </button>
                  <span className="convo-actions">
                    <button
                      type="button"
                      className="link"
                      aria-label={`Đổi tên ${c.title ?? "Chat mới"}`}
                      onClick={() => {
                        setDraft(c.title ?? "");
                        setRenaming(c.id);
                      }}
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      className="link link-danger"
                      aria-label={`Xoá ${c.title ?? "Chat mới"}`}
                      onClick={() => void remove(c)}
                    >
                      Xoá
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
