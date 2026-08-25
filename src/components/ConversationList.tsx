"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conversation } from "@/lib/conversations";
import { browserClient } from "@/lib/supabase/client";

/**
 * The conversation sidebar.
 *
 * Conversations are the one thing in this app the browser both reads and
 * writes. Creating, renaming and deleting a chat is pure UI with no server work
 * to do, and the RLS policies in 007_conversations.sql are what make that safe —
 * the same split the rest of the app uses, applied the other way round.
 */

/**
 * Which bucket a conversation's `updated_at` falls into, by calendar day —
 * not by 24-hour distance, so a chat from 11pm yesterday reads as "Hôm qua"
 * rather than sliding into "Hôm nay" depending on what time it is now.
 */
function bucketOf(updatedAt: string): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(new Date(updatedAt))) / 86_400_000);

  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days <= 7) return "7 ngày qua";
  return "Cũ hơn";
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
  const [search, setSearch] = useState("");

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

    // Land on a blank new chat, the same place "+ Chat mới" leads. That is now
    // a real empty chat rather than the whole account: deleting the open chat
    // used to widen the next question's scope to every document the user owns,
    // with only a changed heading to show for it.
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

  // items already arrives sorted newest-first, so grouping in one pass keeps
  // that order — a bucket's Map entry is created the moment its first (most
  // recent) member is seen, which is also the order buckets should render in.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = q
      ? items.filter((c) => (c.title ?? "Chat mới").toLowerCase().includes(q))
      : items;

    const byBucket = new Map<string, Conversation[]>();
    for (const c of visible) {
      const key = bucketOf(c.updated_at);
      const list = byBucket.get(key);
      if (list) list.push(c);
      else byBucket.set(key, [c]);
    }
    return byBucket;
  }, [items, search]);

  return (
    <nav className="convo" aria-label="Danh sách hội thoại">
      {/* Selects the unsaved chat rather than writing a row. The conversation is
          created on the first question or upload, so opening the app or pressing
          this repeatedly does not fill the sidebar with empty chats. */}
      <button
        type="button"
        className="btn convo-new"
        onClick={() => onSelect(null)}
        aria-current={currentId === null ? "true" : undefined}
      >
        + Chat mới
      </button>

      {items.length > 0 && (
        <div className="convo-search-wrap">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="field convo-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm hội thoại"
            aria-label="Tìm hội thoại"
          />
        </div>
      )}

      {error && (
        <p className="note note-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="muted">Chưa có hội thoại nào.</p>
      ) : groups.size === 0 ? (
        <p className="muted">Không tìm thấy hội thoại nào khớp &quot;{search}&quot;.</p>
      ) : (
        <div className="convo-groups">
          {[...groups.entries()].map(([label, group]) => (
            <div className="convo-group" key={label}>
              <p className="convo-group-label">{label}</p>
              <ul className="convo-list">
                {group.map((c) => (
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
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
