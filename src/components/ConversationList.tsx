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
    const { data } = await browserClient()
      .from("conversations")
      .insert({})
      .select("id, title, updated_at")
      .single();

    if (data) {
      setItems((prev) => [data as Conversation, ...prev]);
      onSelect((data as Conversation).id);
    }
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

    await browserClient().from("conversations").delete().eq("id", c.id);
    setItems((prev) => prev.filter((x) => x.id !== c.id));
    if (currentId === c.id) onSelect(null);
  }

  async function saveTitle(id: string) {
    const title = draft.trim();
    setRenaming(null);
    if (!title) return;

    await browserClient().from("conversations").update({ title }).eq("id", id);
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  return (
    <nav className="convo" aria-label="Danh sách hội thoại">
      <button type="button" className="btn btn-secondary convo-new" onClick={() => void create()}>
        + Chat mới
      </button>

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
