import "server-only";
import type { Citation } from "@/lib/types";
import { admin } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";

/**
 * Conversation-scoped reads and writes for the chat route.
 *
 * Reads run under the user's JWT so RLS decides what exists — a conversation id
 * belonging to someone else resolves to an empty document list, which scopes
 * the search to nothing rather than to their corpus. Writes use the service
 * role, because messages are produced by the server and the browser has no
 * insert rights on that table.
 */

/** How many earlier turns ride along as context. */
export const HISTORY_TURNS = 3;

export interface StoredTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The documents a conversation may answer from.
 *
 * An empty array is meaningful and is not the same as undefined: it means the
 * conversation exists but has no documents yet, and the caller must search
 * nothing rather than fall back to the whole corpus.
 */
export async function conversationDocumentIds(
  conversationId: string,
): Promise<string[]> {
  const supabase = await userClient();
  const { data } = await supabase
    .from("conversation_documents")
    .select("document_id")
    .eq("conversation_id", conversationId);

  return (data ?? []).map((row) => row.document_id as string);
}

/**
 * The last few turns, oldest first, for multi-turn context.
 *
 * Read from the database rather than accepted from the request body. A client
 * that could supply its own history could put words in the user's mouth, and
 * the grounding prompt treats these as things the user actually asked.
 */
export async function recentTurns(
  conversationId: string,
  turns: number = HISTORY_TURNS,
): Promise<StoredTurn[]> {
  const supabase = await userClient();
  const { data } = await supabase
    .from("messages")
    .select("role, content, kind")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(turns * 2);

  const rows = (data ?? []) as Array<StoredTurn & { kind: string | null }>;

  return rows
    .reverse()
    // A refusal or an error carries no information about the documents, and
    // replaying one invites the model to refuse again out of momentum.
    .filter((r) => r.role === "user" || r.kind === "answer")
    .map(({ role, content }) => ({ role, content }));
}

export async function saveMessage(row: {
  conversationId: string;
  ownerId: string;
  role: "user" | "assistant";
  content: string;
  kind?: string | null;
  citations?: Citation[];
}): Promise<void> {
  const { error } = await admin().from("messages").insert({
    conversation_id: row.conversationId,
    owner_id: row.ownerId,
    role: row.role,
    content: row.content,
    kind: row.kind ?? null,
    citations: row.citations ?? [],
  });

  // Losing a transcript row must not fail the request that produced it — the
  // answer is already on its way to the user.
  if (error) console.error("could not save message:", error.message);
}

/**
 * Confirm the conversation belongs to the caller.
 *
 * RLS already prevents reading someone else's, so this is really an existence
 * check; it exists so the route can tell "not yours" from "no id supplied"
 * instead of silently searching the whole corpus.
 */
export async function ownsConversation(conversationId: string): Promise<boolean> {
  const supabase = await userClient();
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();

  return Boolean(data);
}
