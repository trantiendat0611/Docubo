"use client";

import { useRef, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { ConversationList } from "./ConversationList";
import { DocumentList } from "./DocumentList";
import { UploadPanel } from "./UploadPanel";
import { createConversation } from "@/lib/conversations";
import { browserClient } from "@/lib/supabase/client";

/**
 * Holds the two pieces of state the panels share: which conversation is open,
 * and a counter bumped whenever the document set changes, so the list and the
 * scope picker reload without either knowing about the upload panel.
 *
 * A null conversation is an unsaved new chat: no documents, no history, and no
 * row in the database until the user does something with it. It used to mean
 * the opposite — every document the account owns, searched together — and the
 * two states were impossible to tell apart on screen. Deleting the open chat
 * dropped into it, so a chat that had been scoped to one document silently
 * became a search across everything, with only a changed heading to show for it.
 */
export function Workspace() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [convoKey, setConvoKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Two panels can ask for a conversation at once — uploading a document while
  // a question is in flight. Sharing the in-flight promise means they get the
  // same conversation rather than one each.
  const pending = useRef<Promise<string | null> | null>(null);

  const bump = () => setReloadKey((n) => n + 1);

  /** The open conversation, creating it first if this chat is still unsaved. */
  const ensureConversation = async (): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (pending.current) return pending.current;

    pending.current = (async () => {
      const { conversation, error: failed } = await createConversation(browserClient());
      if (!conversation) {
        setError(failed);
        return null;
      }
      setError(null);
      setConversationId(conversation.id);
      setConvoKey((n) => n + 1);
      return conversation.id;
    })();

    try {
      return await pending.current;
    } finally {
      pending.current = null;
    }
  };

  const openChat = (id: string | null) => {
    setError(null);
    setConversationId(id);
  };

  return (
    <div className="workspace">
      <ConversationList
        currentId={conversationId}
        onSelect={openChat}
        reloadKey={convoKey}
      />

      {/* Chat sits between the two rails on screen, and its own DOM order puts
          the transcript ahead of the panels that feed it. */}
      <ChatPanel
        conversationId={conversationId}
        reloadKey={reloadKey}
        ensureConversation={ensureConversation}
        onTitled={() => setConvoKey((n) => n + 1)}
      />

      <aside className="rail">
        {error && (
          <p className="note note-error" role="alert">
            {error}
          </p>
        )}
        <section>
          <h2>Tải tài liệu</h2>
          <UploadPanel
            conversationId={conversationId}
            ensureConversation={ensureConversation}
            onDone={bump}
          />
        </section>
        <section>
          <h2>Tài liệu trong khung này</h2>
          <DocumentList conversationId={conversationId} reloadKey={reloadKey} onChange={bump} />
        </section>
      </aside>
    </div>
  );
}
