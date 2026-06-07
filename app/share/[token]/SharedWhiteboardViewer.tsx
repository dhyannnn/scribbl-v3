"use client";

import "tldraw/tldraw.css";
import "@/lib/tldraw/tldraw-overrides.css";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { createTLStore, defaultShapeUtils, loadSnapshot, type Editor, type TLStoreSnapshot, type TLComponents } from "tldraw";
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

// Hide editing UI but keep zoom controls and canvas interaction
const COMPONENTS: TLComponents = {
  MainMenu: null,
  StylePanel: null,
  Toolbar: null,
  PageMenu: null,
};

export function SharedWhiteboardViewer({
  snapshot,
  isMindboard = false,
}: {
  snapshot: TLStoreSnapshot;
  isMindboard?: boolean;
}) {
  // Load snapshot synchronously so tldraw initializes with content already in the store
  const store = useMemo(() => {
    const s = createTLStore({ shapeUtils: isMindboard ? [...defaultShapeUtils] : [...defaultShapeUtils, ...SHAPE_UTILS] });
    try {
      loadSnapshot(s, snapshot);
    } catch {
      // empty or malformed snapshot — renders blank canvas
    }
    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMount(editor: Editor) {
    // Readonly mode: pan/zoom work, all editing tools are disabled
    editor.updateInstanceState({ isReadonly: true });
    editor.zoomToFit({ animation: { duration: 0 } });
  }

  return (
    <div className="h-[70vh] min-h-[400px] overflow-hidden rounded-xl border border-[var(--color-border)]">
      <TldrawCanvas
        store={store}
        onMount={handleMount}
        components={COMPONENTS}
      />
    </div>
  );
}
