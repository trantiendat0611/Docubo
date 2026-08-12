"use client";

import { useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { DocumentList } from "./DocumentList";
import { UploadPanel } from "./UploadPanel";

/**
 * Holds the one piece of state the upload and the document list share: a
 * counter bumped when an ingest completes, so the list reloads without either
 * component knowing about the other.
 */
export function Workspace() {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="workspace">
      {/* Chat first in the DOM as well as on screen: it is what the page is
          for, and it is what a screen reader should reach first. */}
      <ChatPanel reloadKey={reloadKey} />

      <aside className="rail">
        <section>
          <h2>Tải tài liệu</h2>
          <UploadPanel onDone={() => setReloadKey((n) => n + 1)} />
        </section>
        <section>
          <h2>Tài liệu của bạn</h2>
          <DocumentList reloadKey={reloadKey} />
        </section>
      </aside>
    </div>
  );
}
