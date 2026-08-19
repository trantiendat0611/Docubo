import type { SupabaseClient } from "@supabase/supabase-js";

export interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
}

/**
 * Create a conversation for the signed-in user.
 *
 * Called when the user first does something in an unsaved chat — sends a
 * question, or uploads a document — rather than when they open one. Opening the
 * app or pressing "new chat" would otherwise write a row every time, and the
 * sidebar fills with empty conversations nobody asked for.
 *
 * owner_id is NOT NULL with no default and the insert policy checks it against
 * auth.uid(), so an empty row fails both. It used to fail silently too: only
 * `data` was read, so the button did nothing and said nothing.
 */
export async function createConversation(
  client: SupabaseClient,
): Promise<{ conversation: Conversation | null; error: string | null }> {
  const { data: me } = await client.auth.getUser();
  if (!me.user) {
    return {
      conversation: null,
      error: "Phiên đăng nhập đã hết hạn. Tải lại trang rồi đăng nhập lại.",
    };
  }

  const { data, error } = await client
    .from("conversations")
    .insert({ owner_id: me.user.id })
    .select("id, title, updated_at")
    .single();

  if (error || !data) {
    return {
      conversation: null,
      error: `Không tạo được hội thoại: ${error?.message ?? "không rõ lí do"}`,
    };
  }

  return { conversation: data as Conversation, error: null };
}
