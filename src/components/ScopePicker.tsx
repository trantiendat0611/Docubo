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
}: {
  value: string;
  onChange: (id: string) => void;
  reloadKey: number;
}) {
  const [options, setOptions] = useState<ScopeOption[]>([]);

  useEffect(() => {
    void (async () => {
      const { data } = await browserClient()
        .from("documents")
        .select("id, filename, title")
        .order("created_at", { ascending: false });

      setOptions(
        (data ?? []).map((d) => ({
          id: d.id as string,
          label: (d.title as string | null) ?? (d.filename as string),
        })),
      );
    })();
  }, [reloadKey]);

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
