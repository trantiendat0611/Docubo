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
import {
  conversationDocumentIds,
  ownsConversation,
  recentTurns,
  saveMessage,
} from "@/lib/conversation";
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

  // Reuse the model the analysis call just succeeded on. Rotation cannot help
  // once a stream has started, so the model is chosen before streaming begins,
  // by the one request that has already proved it has budget today.
  const model = analysis.model ?? CHAT_MODELS[0];

  // streamText reports a failed generation here rather than rejecting: the text
  // stream just ends, empty and indistinguishable from a model that produced
  // nothing. Without this callback the reason is unrecoverable by the time the
  // response is built.
  let generationError: unknown;

  // Earlier turns, so "what about the second one?" resolves. Read from the
  // database rather than taken from the request body: a client that supplied
  // its own history could put words in the user's mouth, and the prompt below
  // presents these as things the user actually asked.
  const history = inConversation ? await recentTurns(conversationId!) : [];

  const result = streamText({
    model: gemini(model),
    system: buildSystemPrompt(analysis.lang, analysis.wants_overview),
    messages: [
      ...history.map((t) => ({ role: t.role, content: t.content })),
      {
        role: "user" as const,
        content: `<context>\n${buildContext(chunks)}\n</context>\n\n<question>\n${question}\n</question>`,
      },
    ],
    temperature: 0.2,
    ...NO_SDK_RETRIES,
    onError: ({ error }) => {
      generationError = error;
    },
    // Fires once the client has drained the stream, which is the only point the
    // whole answer exists in one piece on this side. Stopping early leaves
    // whatever arrived, which is what the user saw and so what should be saved.
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

  // The first token is pulled before any header is committed, so a generation
  // that fails outright still returns a status the client can act on. Without
  // it the route answered 200 with an empty body and left each client to guess
  // both that it failed and why — the eval harness guessed wrong and scored
  // seventeen failed generations as answers with missing citations.
  let body;

  try {
    body = await openTextStream(result.textStream, () => generationError);
  } catch (error) {
    const daily = isDailyQuota(error);
    return replyWith(
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
