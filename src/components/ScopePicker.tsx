"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
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
  const { t } = useLang();

  useEffect(() => {
    void (async () => {
      const client = browserClient();

      // Narrowing within a conversation can only offer what that conversation
      // holds; a document from another chat is not in scope to begin with, and
      // an unsaved chat holds nothing at all.
      if (!conversationId) {
        setOptions([]);
        return;
      }

      const { data: attached } = await client
        .from("conversation_documents")
        .select("document_id")
        .eq("conversation_id", conversationId);
      const ids = (attached ?? []).map((r) => r.document_id as string);
      if (ids.length === 0) {
        setOptions([]);
        return;
      }

      const { data } = await client
        .from("documents")
        .select("id, filename, title")
        .in("id", ids)
        .order("created_at", { ascending: false });
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
      <span>{t.scope.askIn}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.scope.allDocs}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
