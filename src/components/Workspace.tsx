"use client";

import { useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { ConversationList } from "./ConversationList";
import { DocumentList } from "./DocumentList";
import { UploadPanel } from "./UploadPanel";

/**
 * Holds the two pieces of state the panels share: which conversation is open,
 * and a counter bumped whenever the document set changes, so the list and the
 * scope picker reload without either knowing about the upload panel.
 *
 * A null conversation is a real state, not a loading one — it searches every
 * document the user has, which is what an account with a single corpus wants
 * and what the eval harness measures.
 */
export function Workspace() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [convoKey, setConvoKey] = useState(0);

  const bump = () => setReloadKey((n) => n + 1);

  return (
    <div className="workspace">
      <ConversationList
        currentId={conversationId}
        onSelect={setConversationId}
        reloadKey={convoKey}
      />

      {/* Chat sits between the two rails on screen, and its own DOM order puts
          the transcript ahead of the panels that feed it. */}
      <ChatPanel
        conversationId={conversationId}
        reloadKey={reloadKey}
        onTitled={() => setConvoKey((n) => n + 1)}
      />

      <aside className="rail">
        <section>
          <h2>Tải tài liệu</h2>
          <UploadPanel conversationId={conversationId} onDone={bump} />
        </section>
        <section>
          <h2>{conversationId ? "Tài liệu trong khung này" : "Tài liệu của bạn"}</h2>
          <DocumentList conversationId={conversationId} reloadKey={reloadKey} onChange={bump} />
        </section>
      </aside>
    </div>
  );
}
