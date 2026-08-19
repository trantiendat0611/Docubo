"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CitationList } from "./CitationList";
import { ScopePicker } from "./ScopePicker";
import { Markdown } from "./Markdown";
import { browserClient } from "@/lib/supabase/client";
import type { Citation } from "@/lib/types";

type Kind = "answer" | "refusal" | "blocked" | "needs_document" | "error";

interface Turn {
  question: string;
  answer: string;
  citations: Citation[];
  kind: Kind;
}

/** The four question shapes the system is actually built for. */
const SUGGESTIONS = [
  "Tóm tắt tài liệu này",
  "Công thức ở trang 44 nghĩa là gì?",
  "Biểu đồ mô tả điều gì?",
  "What is semi-supervised learning?",
];

/**
 * Say when the quota comes back, in the reader's own clock.
 *
 * The server sends an instant rather than a word because the reset is midnight
 * Pacific — which is 14:00 in Vietnam, so "tomorrow" would send someone away
 * for most of a day they did not need to wait.
 */
function resetHint(resetAt?: string): string {
  if (!resetAt) return "";

  const at = new Date(resetAt);
  if (Number.isNaN(at.getTime())) return "";

  const hours = (at.getTime() - Date.now()) / 3_600_000;
  const clock = at.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = at.toDateString() === new Date().toDateString() ? "hôm nay" : "ngày mai";

  return ` Hạn mức đặt lại lúc ${clock} ${day} — còn khoảng ${Math.max(1, Math.round(hours))} giờ.`;
}

export function ChatPanel({
  conversationId,
  reloadKey,
  ensureConversation,
  onTitled,
}: {
  conversationId: string | null;
  reloadKey: number;
  ensureConversation: () => Promise<string | null>;
  onTitled: () => void;
}) {
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // A conversation this panel brought into being while the user was mid-send.
  // Its id arrives as a prop change, which is indistinguishable from the user
  // opening a different chat — and reloading history for it would fetch an
  // empty transcript and wipe the question already on screen.
  const selfCreated = useRef<string | null>(null);

  /**
   * Rebuild the transcript when the conversation changes.
   *
   * Messages are stored one row per speaker, which is the right shape for the
   * model but not for the screen — the UI pairs a question with the answer that
   * followed it. Pairing here rather than in the schema keeps a user turn with
   * no reply yet (generation failed, or the tab closed mid-stream) visible
   * instead of dropping it.
   */
  const loadHistory = useCallback(async () => {
    if (!conversationId) {
      setTurns([]);
      return;
    }

    if (selfCreated.current === conversationId) {
      selfCreated.current = null;
      return;
    }

    const { data } = await browserClient()
      .from("messages")
      .select("role, content, kind, citations")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: true });

    const rebuilt: Turn[] = [];
    for (const m of data ?? []) {
      if (m.role === "user") {
        rebuilt.push({ question: m.content, answer: "", citations: [], kind: "answer" });
      } else if (rebuilt.length) {
        const last = rebuilt[rebuilt.length - 1];
        last.answer = m.content;
        last.kind = (m.kind as Kind) ?? "answer";
        last.citations = (m.citations as Citation[]) ?? [];
      }
    }
    setTurns(rebuilt);
  }, [conversationId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function patchLast(patch: Partial<Turn>) {
    setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, ...patch } : turn)));
  }

  /** Name an untitled conversation after its opening question. No model call. */
  async function titleFrom(question: string, cid: string) {
    const client = browserClient();
    const { data } = await client
      .from("conversations")
      .select("title")
      .eq("id", cid)
      .maybeSingle();

    if (data && !data.title) {
      const title = question.length > 60 ? `${question.slice(0, 57)}…` : question;
      await client.from("conversations").update({ title }).eq("id", cid);
      onTitled();
    }
  }

  async function ask(question: string, cid: string) {
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        // Empty scope means every document the conversation holds; the server
        // also resolves a document named in the question itself.
        body: JSON.stringify({
          question,
          documentId: scope || undefined,
          conversationId: cid,
        }),
      });

      // Refusals, blocks and generation failures come back as JSON, answers as
      // a token stream.
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        patchLast({
          answer: data.message + resetHint(data.resetAt),
          kind: data.type ?? "refusal",
        });
        return;
      }

      const header = res.headers.get("X-Citations");
      if (header) patchLast({ citations: JSON.parse(decodeURIComponent(header)) });
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
      // The route catches that before sending headers and returns 503 with the
      // reason, so this only fires when generation dies partway through — after
      // the status is already committed and no longer changeable. The cause is
      // genuinely unknown here, so the message does not name one.
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
    } catch (error) {
      // Stopping is a choice, not a failure: keep the partial answer as it was
      // when the user pressed the button.
      if ((error as Error)?.name === "AbortError") {
        setTurns((t) =>
          t.map((turn, i) =>
            i === t.length - 1 && !turn.answer.trim()
              ? { ...turn, answer: "Đã dừng trước khi có câu trả lời.", kind: "error" }
              : turn,
          ),
        );
        return;
      }
      patchLast({ answer: "Có lỗi khi gọi API.", kind: "error" });
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }

  /**
   * The chat to send to, creating it if this one is still unsaved.
   *
   * Marking it as self-created first, because setting the id upstream re-runs
   * loadHistory and a brand-new conversation has nothing stored to reload.
   */
  async function openChat(): Promise<string | null> {
    if (conversationId) return conversationId;
    const id = await ensureConversation();
    if (id) selfCreated.current = id;
    return id;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;

    setInput("");
    setTurns((t) => [...t, { question, answer: "", citations: [], kind: "answer" }]);

    const cid = await openChat();
    if (!cid) {
      patchLast({ answer: "Không mở được khung chat để lưu câu hỏi.", kind: "error" });
      return;
    }

    void titleFrom(question, cid);
    await ask(question, cid);
  }

  /**
   * Ask the last question again.
   *
   * The replaced turn stays in the stored transcript — this appends rather than
   * rewrites history, so what the model was asked and what it produced both
   * remain on record.
   */
  async function regenerate() {
    const last = turns[turns.length - 1];
    if (!last || busy) return;
    setTurns((t) => [
      ...t,
      { question: last.question, answer: "", citations: [], kind: "answer" },
    ]);

    // There is always a conversation by now — regenerating needs an earlier
    // turn, and producing one created it — but resolving it the same way keeps
    // the single path rather than an assumption.
    const cid = await openChat();
    if (!cid) {
      patchLast({ answer: "Không mở được khung chat để lưu câu hỏi.", kind: "error" });
      return;
    }
    await ask(last.question, cid);
  }

  const canRegenerate = !busy && turns.length > 0 && Boolean(turns[turns.length - 1].answer);

  return (
    <div className="chat">
      <div className="transcript">
        {turns.length === 0 && (
          <div className="empty">
            {/* A heading, not styled-up <strong>: below 900px the rail moves
                above the chat, and without this the main column contributes
                nothing to the heading outline at all. */}
            <h2>Hỏi gì cũng được, miễn là tài liệu có câu trả lời</h2>
            <p>
              Tải một PDF lên ở khu vực tải tài liệu, rồi hỏi bằng tiếng Việt
              hoặc tiếng Anh. Nếu tài liệu không chứa câu trả lời, Docubo sẽ
              nói vậy thay vì đoán.
            </p>
            <ul className="suggestions">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" className="suggestion" onClick={() => setInput(s)}>
                    {s}
                  </button>
                </li>
              ))}
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
        <div className="composer-tools">
          <ScopePicker
            value={scope}
            onChange={setScope}
            reloadKey={reloadKey}
            conversationId={conversationId}
          />
          {busy ? (
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => abort.current?.abort()}
            >
              Dừng
            </button>
          ) : (
            canRegenerate && (
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => void regenerate()}
              >
                Sinh lại
              </button>
            )
          )}
        </div>

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
