"use client";

import "tldraw/tldraw.css";
import "@/lib/tldraw/tldraw-overrides.css";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { createTLStore, loadSnapshot, type Editor, type TLStoreSnapshot } from "tldraw";
import { PageBackgroundShapeUtil } from "@/lib/tldraw/page-background-shape";

const TldrawCanvas = dynamic(async () => (await import("tldraw")).Tldraw, {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
      Loading…
    </div>
  ),
});

const SHAPE_UTILS = [PageBackgroundShapeUtil];

export function SharedWhiteboardViewer({
  snapshot,
  isMindboard = false,
}: {
  snapshot: TLStoreSnapshot;
  isMindboard?: boolean;
}) {
  const store = useRef(
    createTLStore({ shapeUtils: isMindboard ? [] : SHAPE_UTILS }),
  );

  useEffect(() => {
    try {
      loadSnapshot(store.current, snapshot);
    } catch {
      // snapshot may be empty or malformed — tldraw renders blank canvas
    }
  }, [snapshot]);

  function handleMount(editor: Editor) {
    editor.updateInstanceState({ isReadonly: true });
    editor.zoomToFit({ animation: { duration: 0 } });
  }

  return (
    <div className="h-[70vh] min-h-[400px] overflow-hidden rounded-xl border border-[var(--color-border)]">
      <TldrawCanvas
        store={store.current}
        onMount={handleMount}
        hideUi
      />
    </div>
  );
}
