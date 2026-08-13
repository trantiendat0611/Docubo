"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";

/**
 * Which document a question is about.
 *
 * Without this every question searches the whole corpus, and once a user has
 * several documents on one topic the right passages compete with near-identical
 * ones from the wrong document. Scoping is also what makes "summarise this"
 * answerable at all.
 */

export interface ScopeOption {
  id: string;
  label: string;
}

export function ScopePicker({
  value,
  onChange,
  reloadKey,
  conversationId,
}: {
  value: string;
  onChange: (id: string) => void;
  reloadKey: number;
  conversationId: string | null;
}) {
  const [options, setOptions] = useState<ScopeOption[]>([]);

  useEffect(() => {
    void (async () => {
      const client = browserClient();

      // Narrowing within a conversation can only offer what that conversation
      // holds; a document from another chat is not in scope to begin with.
      let ids: string[] | null = null;
      if (conversationId) {
        const { data } = await client
          .from("conversation_documents")
          .select("document_id")
          .eq("conversation_id", conversationId);
        ids = (data ?? []).map((r) => r.document_id as string);
        if (ids.length === 0) {
          setOptions([]);
          return;
        }
      }

      let query = client
        .from("documents")
        .select("id, filename, title")
        .order("created_at", { ascending: false });

      if (ids) query = query.in("id", ids);

      const { data } = await query;
      setOptions(
        (data ?? []).map((d) => ({
          id: d.id as string,
          label: (d.title as string | null) ?? (d.filename as string),
        })),
      );
    })();
  }, [reloadKey, conversationId]);

  // One document is its own scope; a picker would be noise.
  if (options.length < 2) return null;

  return (
    <label className="scope">
      <span>Hỏi trong</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tất cả tài liệu</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
