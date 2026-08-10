import { streamText } from "ai";
import { CHAT_MODEL, gemini } from "@/lib/gemini";
import { analyseQuery } from "@/lib/guardrail";
import {
  buildCitations,
  buildContext,
  buildSystemPrompt,
  blockedMessage,
  refusalMessage,
} from "@/lib/prompt";
import { isUngrounded, retrieve } from "@/lib/retrieve";
import { logQuery } from "@/lib/log";

// Node runtime, not edge: @supabase/supabase-js is happier here, and the
// Hobby plan's duration limit is the constraint that matters, not cold start.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const started = Date.now();
  const { question } = (await req.json()) as { question?: string };

  if (!question?.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const analysis = await analyseQuery(question);

  if (!analysis.safe) {
    void logQuery({
      question,
      question_lang: analysis.lang,
      blocked_by: analysis.reason,
      latency_ms: Date.now() - started,
    });
    return Response.json({
      type: "blocked",
      message: blockedMessage(analysis.lang),
      reason: analysis.reason,
    });
  }

  const chunks = await retrieve(analysis, question);

  // The refusal path. Every question that reaches the model must have context
  // worth grounding on — an LLM handed weak context will produce a confident
  // answer from its own weights, which is exactly the failure this project
  // exists to prevent.
  if (isUngrounded(chunks)) {
    void logQuery({
      question,
      question_lang: analysis.lang,
      blocked_by: "no_context",
      top_score: chunks[0]?.cosine_sim ?? 0,
      n_results: chunks.length,
      latency_ms: Date.now() - started,
    });
    return Response.json({
      type: "refusal",
      message: refusalMessage(analysis.lang),
      citations: [],
    });
  }

  const citations = buildCitations(chunks);

  void logQuery({
    question,
    question_lang: analysis.lang,
    blocked_by: null,
    top_score: chunks[0].cosine_sim,
    n_results: chunks.length,
    latency_ms: Date.now() - started,
  });

  const result = streamText({
    model: gemini(CHAT_MODEL),
    system: buildSystemPrompt(analysis.lang),
    prompt: `<context>\n${buildContext(chunks)}\n</context>\n\n<question>\n${question}\n</question>`,
    temperature: 0.2,
  });

  // Citations ride along in a header so the client can render the source panel
  // as soon as the stream opens, instead of waiting for the last token.
  return result.toTextStreamResponse({
    headers: {
      "X-Citations": encodeURIComponent(JSON.stringify(citations)),
    },
  });
}
