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
        {turns.length === 0 && (
          // A blank column tells a first-time user nothing about what the tool
          // answers well. These are the four question shapes the system is
          // actually built for, so showing them is orientation, not decoration.
          <div className="empty">
            <strong>Hỏi gì cũng được, miễn là tài liệu có câu trả lời</strong>
            <p>
              Tải một PDF lên ở bên phải, rồi hỏi bằng tiếng Việt hoặc tiếng
              Anh. Nếu tài liệu không chứa câu trả lời, Docubo sẽ nói vậy thay
              vì đoán.
            </p>
            <ul>
              <li>Tóm tắt tài liệu này</li>
              <li>Công thức ở trang 44 nghĩa là gì?</li>
              <li>Biểu đồ mô tả điều gì?</li>
              <li>What is semi-supervised learning?</li>
            </ul>
          </div>
        )}

        {turns.map((t, i) => (
          <article key={i} className={`turn turn-${t.kind}`}>
            <p className="question">{t.question}</p>
            {t.answer ? (
              <Markdown>{t.answer}</Markdown>
            ) : (
              <p className="thinking" aria-label="Đang soạn câu trả lời">
                <span />
                <span />
                <span />
              </p>
            )}
            <CitationList citations={t.citations} />
          </article>
        ))}
      </div>

      <div className="composer">
        <ScopePicker value={scope} onChange={setScope} reloadKey={reloadKey} />

        <form onSubmit={send}>
          <input
            className="field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Hỏi về tài liệu đã nạp — tiếng Việt hoặc tiếng Anh"
            aria-label="Câu hỏi"
            disabled={busy}
          />
          <button className="btn" type="submit" disabled={busy || !input.trim()}>
            {busy ? "Đang trả lời…" : "Gửi"}
          </button>
        </form>
      </div>
    </div>
  );
}
