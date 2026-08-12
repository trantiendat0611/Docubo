import { streamText } from "ai";
import { CHAT_MODELS, NO_SDK_RETRIES, gemini, isDailyQuota } from "@/lib/gemini";
import { analyseQuery } from "@/lib/guardrail";
import {
  buildCitations,
  buildContext,
  buildSystemPrompt,
  blockedMessage,
  generationFailedMessage,
  needsDocumentMessage,
  refusalMessage,
} from "@/lib/prompt";
import {
  isUngrounded,
  listDocuments,
  resolveMentionedDocument,
  retrieve,
  retrieveOverview,
} from "@/lib/retrieve";
import { logQuery } from "@/lib/log";
import { openTextStream } from "@/lib/stream";
import { currentUser } from "@/lib/supabase/server";

// Node runtime, not edge: @supabase/supabase-js is happier here, and the
// Hobby plan's duration limit is the constraint that matters, not cold start.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const started = Date.now();

  // Retrieval is already RLS-filtered, so an anonymous request would simply
  // find nothing. Rejecting it here saves a wasted Gemini call against a
  // fifteen-request-per-minute budget, and gives the client something to act on.
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { question, documentId } = (await req.json()) as {
    question?: string;
    documentId?: string;
  };

  if (!question?.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const analysis = await analyseQuery(question);

  if (!analysis.safe) {
    void logQuery({
      question,
      user_id: user.id,
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

  // Resolve which document the question is about, in order of confidence:
  // an explicit selection, then a document named in the question itself.
  const documents = await listDocuments();
  const mentioned = resolveMentionedDocument(question, documents);
  const scopedId =
    documentId && documents.some((d) => d.id === documentId)
      ? documentId
      : (mentioned?.id ?? null);

  let chunks;

  if (analysis.wants_overview) {
    // "Summarise this" cannot be served by similarity search — no passage means
    // "all of it", so the query matches whatever is loosely on-topic anywhere
    // in the corpus. A whole-document request needs a document.
    const target =
      scopedId ?? (documents.length === 1 ? documents[0].id : null);

    if (!target) {
      void logQuery({
        question,
        user_id: user.id,
        question_lang: analysis.lang,
        blocked_by: "needs_document",
        latency_ms: Date.now() - started,
      });
      return Response.json({
        type: "needs_document",
        message: needsDocumentMessage(analysis.lang),
        documents: documents.map((d) => ({ id: d.id, title: d.title ?? d.filename })),
      });
    }

    chunks = await retrieveOverview(target);
  } else {
    chunks = await retrieve(analysis, question, scopedId ? [scopedId] : undefined);
  }

  // The refusal path. Every question that reaches the model must have context
  // worth grounding on — an LLM handed weak context will produce a confident
  // answer from its own weights, which is exactly the failure this project
  // exists to prevent.
  if (isUngrounded(chunks)) {
    void logQuery({
      question,
      user_id: user.id,
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
    user_id: user.id,
    question_lang: analysis.lang,
    blocked_by: null,
    top_score: chunks[0].cosine_sim,
    n_results: chunks.length,
    latency_ms: Date.now() - started,
  });

  // Reuse the model the analysis call just succeeded on. Rotation cannot help
  // once a stream has started, so the model is chosen before streaming begins,
  // by the one request that has already proved it has budget today.
  const model = analysis.model ?? CHAT_MODELS[0];

  const result = streamText({
    model: gemini(model),
    system: buildSystemPrompt(analysis.lang, analysis.wants_overview),
    prompt: `<context>\n${buildContext(chunks)}\n</context>\n\n<question>\n${question}\n</question>`,
    temperature: 0.2,
    ...NO_SDK_RETRIES,
  });

  // The first token is pulled before any header is committed, so a generation
  // that fails outright still returns a status the client can act on. Without
  // it the route answered 200 with an empty body and left each client to guess
  // both that it failed and why — the eval harness guessed wrong and scored
  // seventeen failed generations as answers with missing citations.
  let body;

  try {
    body = await openTextStream(result.textStream);
  } catch (error) {
    const daily = isDailyQuota(error);
    return Response.json(
      {
        type: "error",
        message: generationFailedMessage(analysis.lang, daily),
        // A spent daily budget and a per-minute limit need different advice,
        // and only the server can tell them apart.
        reason: daily ? "daily_quota" : "rate_limited",
      },
      { status: 503 },
    );
  }

  // Citations ride along in a header so the client can render the source panel
  // as soon as the stream opens, instead of waiting for the last token.
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Citations": encodeURIComponent(JSON.stringify(citations)),
      // Lets the client say the answer may be weaker than usual rather than
      // presenting a degraded result as a normal one.
      "X-Degraded": analysis.degraded ? "1" : "0",
      "X-Model": model,
    },
  });
}
