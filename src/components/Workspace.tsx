"use client";

import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { ConversationList } from "./ConversationList";
import { DocumentList } from "./DocumentList";
import { UploadPanel } from "./UploadPanel";
import { createConversation } from "@/lib/conversations";
import { useLang } from "@/lib/i18n";
import { fileKind } from "@/lib/ingest/kinds";
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
  const { t } = useLang();

  // Two panels can ask for a conversation at once — uploading a document while
  // a question is in flight. Sharing the in-flight promise means they get the
  // same conversation rather than one each.
  const pending = useRef<Promise<string | null> | null>(null);

  const bump = () => setReloadKey((n) => n + 1);

  const [pastedFile, setPastedFile] = useState<File | null>(null);

  /**
   * An image pasted anywhere becomes a one-page document in this chat.
   *
   * Listening on the window rather than on the chat box: paste events fire at
   * the focused element and bubble, so one listener here catches a paste into
   * the question field, the transcript, or nowhere in particular. Binding it to
   * the textarea alone would work only while that textarea had focus, which is
   * not where people's attention is when they hit paste.
   *
   * Text pastes are left completely alone — clipboardData carries an image only
   * when there is one, and typing over a copied paragraph must keep working.
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.files ?? []);
      const image = items.find((f) => fileKind(f.name, f.type) === "image");
      if (!image) return;

      event.preventDefault();
      setPastedFile(image);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

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
      {/* Documents sit on the left and conversations on the right — the two
          rails read as a matched pair either side of the chat, in the middle. */}
      <aside className="rail">
        {error && (
          <p className="note note-error" role="alert">
            {error}
          </p>
        )}
        <section>
          <h2>{t.upload.heading}</h2>
          <UploadPanel
            conversationId={conversationId}
            ensureConversation={ensureConversation}
            pastedFile={pastedFile}
            onPastedHandled={() => setPastedFile(null)}
            onDone={bump}
          />
        </section>
        <section>
          <h2>{t.docs.heading}</h2>
          <DocumentList conversationId={conversationId} reloadKey={reloadKey} onChange={bump} />
        </section>
      </aside>

      <ChatPanel
        conversationId={conversationId}
        reloadKey={reloadKey}
        ensureConversation={ensureConversation}
        onTitled={() => setConvoKey((n) => n + 1)}
      />

      <ConversationList
        currentId={conversationId}
        onSelect={openChat}
        reloadKey={convoKey}
      />
    </div>
  );
}
