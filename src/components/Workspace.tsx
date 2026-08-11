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
    <>
      <UploadPanel onDone={() => setReloadKey((n) => n + 1)} />
      <details className="docs">
        <summary>Tài liệu của bạn</summary>
        <DocumentList reloadKey={reloadKey} />
      </details>
      <ChatPanel />
    </>
  );
}
