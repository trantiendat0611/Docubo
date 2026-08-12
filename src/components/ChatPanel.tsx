"use client";

import { useState } from "react";
import { CitationList } from "./CitationList";
import { ScopePicker } from "./ScopePicker";
import { Markdown } from "./Markdown";
import type { Citation } from "@/lib/types";

interface Turn {
  question: string;
  answer: string;
  citations: Citation[];
  kind: "answer" | "refusal" | "blocked" | "needs_document" | "error";
}

export function ChatPanel({ reloadKey }: { reloadKey: number }) {
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    setInput("");
    setBusy(true);
    setTurns((t) => [
      ...t,
      { question, answer: "", citations: [], kind: "answer" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Empty scope means the whole corpus; the server also resolves a
        // document named in the question itself.
        body: JSON.stringify({ question, documentId: scope || undefined }),
      });

      // Refusals and blocks come back as JSON, answers as a token stream.
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        patchLast({ answer: data.message, kind: data.type ?? "refusal" });
        return;
      }

      const header = res.headers.get("X-Citations");
      if (header) {
        patchLast({ citations: JSON.parse(decodeURIComponent(header)) });
      }
      const degraded = res.headers.get("X-Degraded") === "1";

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        patchLast({ answer: acc });
      }

      // A stream that carries no tokens is a failed generation, not an answer.
      // The route now catches that before sending headers and returns 503 with
      // the reason, so this only fires when generation dies partway through —
      // after the status is already committed and no longer changeable. The
      // cause is genuinely unknown here, so the message does not name one.
      if (!acc.trim()) {
        patchLast({
          answer:
            "Không sinh được câu trả lời — luồng phản hồi dừng giữa chừng. " +
            "Nguồn trích dẫn ở dưới vẫn là các đoạn tìm được. Thử hỏi lại.",
          kind: "error",
        });
        return;
      }

      // The analysis step failed and the raw question was searched instead.
      // Cross-lingual recall halves without it, so saying nothing would present
      // a measurably worse answer as a normal one.
      if (degraded) {
        patchLast({
          answer: [
            acc,
            "---",
            "*Bước phân tích câu hỏi không chạy được, nên câu hỏi được tìm " +
              "nguyên văn. Với câu hỏi tiếng Việt trên tài liệu tiếng Anh, " +
              "kết quả có thể kém hơn bình thường.*",
          ].join("\n\n"),
        });
      }
    } catch {
      patchLast({ answer: "Có lỗi khi gọi API.", kind: "refusal" });
    } finally {
      setBusy(false);
    }
  }

  function patchLast(patch: Partial<Turn>) {
    setTurns((t) =>
      t.map((turn, i) => (i === t.length - 1 ? { ...turn, ...patch } : turn)),
    );
  }

  return (
    <div className="chat">
      <div className="transcript">
        {turns.map((t, i) => (
          <div key={i} className={`turn turn-${t.kind}`}>
            <p className="question">{t.question}</p>
            <Markdown>{t.answer}</Markdown>
            <CitationList citations={t.citations} />
          </div>
        ))}
      </div>

      <ScopePicker value={scope} onChange={setScope} reloadKey={reloadKey} />

      <form onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hỏi về tài liệu đã nạp — tiếng Việt hoặc tiếng Anh"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "Đang trả lời…" : "Gửi"}
        </button>
      </form>
    </div>
  );
}
