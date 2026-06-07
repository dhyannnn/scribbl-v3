"use client";

import "tldraw/tldraw.css";
import "@/lib/tldraw/tldraw-overrides.css";
import dynamic from "next/dynamic";
import { createContext, useContext, useMemo } from "react";
import { createTLStore, defaultShapeUtils, loadSnapshot, useEditor, useValue, type Editor, type TLStoreSnapshot, type TLComponents } from "tldraw";
import { useIsDarkMode } from "@tldraw/editor";
import { PageBackgroundShapeUtil } from "@/lib/tldraw/page-background-shape";
import { buildBgStyle, type MindboardTemplate } from "@/lib/tldraw/mindboard-bg";

const TldrawCanvas = dynamic(async () => (await import("tldraw")).Tldraw, {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
      Loading…
    </div>
  ),
});

const SHAPE_UTILS = [PageBackgroundShapeUtil];

// Passes the saved page→template map into tldraw's Background slot without Yjs
const StaticMindboardBgCtx = createContext<Record<string, string>>({});

function StaticMindboardBackground() {
  const bgMap = useContext(StaticMindboardBgCtx);
  const editor = useEditor();
  const isDark = useIsDarkMode();
  const { camera, pageId } = useValue("mb-cam-page", () => ({
    camera: editor.getCamera(),
    pageId: editor.getCurrentPageId() as string,
  }), [editor]);
  const template = (bgMap[pageId] as MindboardTemplate | undefined) ?? "blank";
  const style = buildBgStyle(template, camera.x, camera.y, camera.z, isDark);
  return <div style={{ position: "absolute", inset: 0, ...style }} />;
}

const WHITEBOARD_COMPONENTS: TLComponents = {
  MainMenu: null,
  StylePanel: null,
  Toolbar: null,
};

const MINDBOARD_COMPONENTS: TLComponents = {
  ...WHITEBOARD_COMPONENTS,
  Background: StaticMindboardBackground,
};

export function SharedWhiteboardViewer({
  snapshot,
  isMindboard = false,
  mindboardBg = {},
}: {
  snapshot: TLStoreSnapshot;
  isMindboard?: boolean;
  mindboardBg?: Record<string, string>;
}) {
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
    editor.updateInstanceState({ isReadonly: true });
    editor.setCurrentTool("hand");
    editor.zoomToFit({ animation: { duration: 0 } });
  }

  return (
    <StaticMindboardBgCtx.Provider value={mindboardBg}>
      <div className="h-[70vh] min-h-[400px] overflow-hidden rounded-xl border border-[var(--color-border)]">
        <TldrawCanvas
          store={store}
          onMount={handleMount}
          shapeUtils={isMindboard ? [] : SHAPE_UTILS}
          components={isMindboard ? MINDBOARD_COMPONENTS : WHITEBOARD_COMPONENTS}
        />
      </div>
    </StaticMindboardBgCtx.Provider>
  );
}
