import { streamText } from "ai";
import {
  AllChatModelsExhausted,
  NO_SDK_RETRIES,
  gemini,
  isAborted,
  isDailyQuota,
  nextQuotaReset,
  withChatModel,
} from "@/lib/gemini";
import { analyseQuery } from "@/lib/guardrail";
import {
  type GenerationFailure,
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
import {
  conversationDocumentIds,
  ownsConversation,
  recentTurns,
  saveMessage,
} from "@/lib/conversation";
import { logQuery } from "@/lib/log";
import {
  GenerationTimeout,
  REQUEST_BUDGET_MS,
  openTextStream,
} from "@/lib/stream";
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

  const { question, documentId, conversationId } = (await req.json()) as {
    question?: string;
    documentId?: string;
    conversationId?: string;
  };

  if (!question?.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  // A conversation owns its documents. Omitting the id keeps the original
  // behaviour — search everything the user has — which is what the eval harness
  // relies on and what a single-document account still wants.
  const inConversation = conversationId
    ? await ownsConversation(conversationId)
    : false;

  if (conversationId && !inConversation) {
    return Response.json({ error: "conversation not found" }, { status: 404 });
  }

  const conversationDocs = inConversation
    ? await conversationDocumentIds(conversationId!)
    : null;

  if (inConversation) {
    void saveMessage({
      conversationId: conversationId!,
      ownerId: user.id,
      role: "user",
      content: question,
    });
  }

  /** Persist the assistant turn and hand the response straight back. */
  const replyWith = (
    body: { type: string; message: string } & Record<string, unknown>,
    init?: ResponseInit,
  ) => {
    if (inConversation) {
      void saveMessage({
        conversationId: conversationId!,
        ownerId: user.id,
        role: "assistant",
        content: body.message,
        kind: body.type,
      });
    }
    return Response.json(body, init);
  };

  // An empty conversation can only refuse. Saying so here costs no model call
  // and gives a clearer answer than a similarity search over nothing.
  if (conversationDocs?.length === 0) {
    return replyWith({
      type: "needs_document",
      message: needsDocumentMessage("vi"),
      documents: [],
    });
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
    return replyWith({
      type: "blocked",
      message: blockedMessage(analysis.lang),
      reason: analysis.reason,
    });
  }

  // Resolve which document the question is about, in order of confidence:
  // an explicit selection, then a document named in the question itself. Inside
  // a conversation the candidates are its own documents — naming a document
  // that lives in a different chat must not pull it in.
  const all = await listDocuments();
  const documents = conversationDocs
    ? all.filter((d) => conversationDocs.includes(d.id))
    : all;
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
      return replyWith({
        type: "needs_document",
        message: needsDocumentMessage(analysis.lang),
        documents: documents.map((d) => ({ id: d.id, title: d.title ?? d.filename })),
      });
    }

    chunks = await retrieveOverview(target);
  } else {
    // Narrowest scope wins: an explicit document, else the conversation's set,
    // else everything.
    const scope = scopedId ? [scopedId] : (conversationDocs ?? undefined);
    chunks = await retrieve(analysis, question, scope);
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
    return replyWith({
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

  // Earlier turns, so "what about the second one?" resolves. Read from the
  // database rather than taken from the request body: a client that supplied
  // its own history could put words in the user's mouth, and the prompt below
  // presents these as things the user actually asked.
  const history = inConversation ? await recentTurns(conversationId!) : [];

  const prompt = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    {
      role: "user" as const,
      content: `<context>\n${buildContext(chunks)}\n</context>\n\n<question>\n${question}\n</question>`,
    },
  ];

  /**
   * Generate, moving to the next model when one has spent its day.
   *
   * This used to pick a single model — whichever the analysis call had just
   * proved had budget — on the grounds that rotation cannot help once a stream
   * has started. That was true while the route committed its headers before
   * calling the model. It stopped being true when openTextStream started
   * pulling the first token first: the failure now surfaces while the response
   * is still ours to shape, so there is a second chance to take. Without this,
   * analysis succeeding on the last request a model had left would strand the
   * question even with three untouched models behind it.
   */
  const attempt = async (model: string) => {
    // streamText reports a failed generation through this callback rather than
    // by rejecting: the text stream just ends, empty and indistinguishable from
    // a model that produced nothing.
    let generationError: unknown;

    // Whatever is left of the request's budget after the guardrail call, the
    // embedding, the search and the history read. Without this the only limit
    // is the platform's, and hitting that produces a 504 the client cannot
    // read — the failure has to happen while the response is still ours.
    const msLeft = REQUEST_BUDGET_MS - (Date.now() - started);
    if (msLeft <= 0) throw new GenerationTimeout();

    const result = streamText({
      model: gemini(model),
      system: buildSystemPrompt(analysis.lang, analysis.wants_overview),
      messages: prompt,
      temperature: 0.2,
      // Cancels the call rather than abandoning it. A race would leave the
      // model generating against a request nobody is reading, and still bill
      // the quota for it.
      abortSignal: AbortSignal.timeout(msLeft),
      ...NO_SDK_RETRIES,
      onError: ({ error }) => {
        generationError = error;
      },
      // Fires once the client has drained the stream, which is the only point
      // the whole answer exists in one piece on this side. Stopping early
      // leaves whatever arrived, which is what the user saw and so what should
      // be saved.
      onFinish: ({ text }) => {
        if (inConversation && text.trim()) {
          void saveMessage({
            conversationId: conversationId!,
            ownerId: user.id,
            role: "assistant",
            content: text,
            kind: "answer",
            citations,
          });
        }
      },
    });

    return openTextStream(result.textStream, () => generationError, msLeft);
  };

  let body: ReadableStream<Uint8Array>;
  let model: string;

  try {
    ({ result: body, model } = await withChatModel(attempt));
  } catch (error) {
    // Three outcomes, three different pieces of advice. Folding the timeout in
    // with the rate limit would tell the user to wait a minute when nothing is
    // throttled — and would leave the failure that killed two questions in the
    // 19/08 run looking like one the system already handles.
    const failure: GenerationFailure =
      error instanceof AllChatModelsExhausted || isDailyQuota(error)
        ? "daily_quota"
        : error instanceof GenerationTimeout || isAborted(error)
          ? "timeout"
          : "rate_limited";

    return replyWith(
      {
        type: "error",
        message: generationFailedMessage(analysis.lang, failure),
        reason: failure,
        // When the budget resets, as an instant rather than a word. "Tomorrow"
        // is wrong for most of the world: the reset is midnight Pacific, which
        // is the middle of the afternoon in Vietnam.
        resetAt:
          failure === "daily_quota" ? nextQuotaReset().toISOString() : undefined,
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
