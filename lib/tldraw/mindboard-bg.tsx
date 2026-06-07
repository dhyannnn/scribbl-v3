"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useEditor, useValue } from "tldraw";
import { useIsDarkMode } from "@tldraw/editor";
import type * as Y from "yjs";

// ── Yjs context ───────────────────────────────────────────────────────────────
// Keyed by pageId → template family ("blank" | "lined" | "dotted" | "grid")
export const MindboardBgCtx = createContext<Y.Map<string> | null>(null);

// ── Types ─────────────────────────────────────────────────────────────────────

export type MindboardTemplate = "blank" | "lined" | "dotted" | "grid";
export const MINDBOARD_TEMPLATES: MindboardTemplate[] = ["blank", "lined", "dotted", "grid"];
export const MINDBOARD_TEMPLATE_LABELS: Record<MindboardTemplate, string> = {
  blank: "Blank",
  lined: "Lined",
  dotted: "Dotted",
  grid: "Grid",
};

// ── Pattern rendering ─────────────────────────────────────────────────────────

const SPACING = 36;

const COLORS = {
  light: { bg: "#f8f9fa", line: "#cbd5e1", dot: "#94a3b8" },
  dark:  { bg: "#1a1a1a", line: "#ffffff", lineOpacity: 0.1, dot: "#ffffff", dotOpacity: 0.2 },
} as const;

function svgUri(content: string, size: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${content}</svg>`;
  // Encode for CSS url() — only encode what's strictly required
  return `url("data:image/svg+xml,${svg
    .replace(/%/g, "%25")
    .replace(/"/g, "%22")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\n/g, "")}")`;
}

export function buildBgStyle(
  template: MindboardTemplate,
  cx: number,
  cy: number,
  z: number,
  isDark: boolean,
): React.CSSProperties {
  const c = isDark ? COLORS.dark : COLORS.light;
  const tileSize = SPACING * z;
  const px = ((cx % tileSize) + tileSize) % tileSize;
  const py = ((cy % tileSize) + tileSize) % tileSize;

  if (template === "blank") {
    return { backgroundColor: c.bg };
  }

  if (template === "lined") {
    const line = isDark
      ? `<line x1='0' y1='${SPACING}' x2='${SPACING}' y2='${SPACING}' stroke='${c.line}' stroke-opacity='${COLORS.dark.lineOpacity}' stroke-width='1'/>`
      : `<line x1='0' y1='${SPACING}' x2='${SPACING}' y2='${SPACING}' stroke='${c.line}' stroke-width='1'/>`;
    return {
      backgroundColor: c.bg,
      backgroundImage: svgUri(line, SPACING),
      backgroundSize: `${tileSize}px ${tileSize}px`,
      backgroundPosition: `${px}px ${py}px`,
    };
  }

  if (template === "dotted") {
    const dot = isDark
      ? `<circle cx='0' cy='0' r='1.5' fill='${c.dot}' fill-opacity='${COLORS.dark.dotOpacity}'/>`
      : `<circle cx='0' cy='0' r='1.5' fill='${c.dot}'/>`;
    return {
      backgroundColor: c.bg,
      backgroundImage: svgUri(dot, SPACING),
      backgroundSize: `${tileSize}px ${tileSize}px`,
      backgroundPosition: `${px}px ${py}px`,
    };
  }

  // grid
  const h = isDark
    ? `<line x1='0' y1='${SPACING}' x2='${SPACING}' y2='${SPACING}' stroke='${c.line}' stroke-opacity='${COLORS.dark.lineOpacity}' stroke-width='1'/>`
    : `<line x1='0' y1='${SPACING}' x2='${SPACING}' y2='${SPACING}' stroke='${c.line}' stroke-width='1'/>`;
  const v = isDark
    ? `<line x1='${SPACING}' y1='0' x2='${SPACING}' y2='${SPACING}' stroke='${c.line}' stroke-opacity='${COLORS.dark.lineOpacity}' stroke-width='1'/>`
    : `<line x1='${SPACING}' y1='0' x2='${SPACING}' y2='${SPACING}' stroke='${c.line}' stroke-width='1'/>`;
  return {
    backgroundColor: c.bg,
    backgroundImage: svgUri(h + v, SPACING),
    backgroundSize: `${tileSize}px ${tileSize}px`,
    backgroundPosition: `${px}px ${py}px`,
  };
}

// ── MindboardBackground — tldraw TLComponents.Background slot ─────────────────

export function MindboardBackground() {
  const editor = useEditor();
  const isDark = useIsDarkMode();
  const yBg = useContext(MindboardBgCtx);

  const { camera, pageId } = useValue("mb-cam-page", () => ({
    camera: editor.getCamera(),
    pageId: editor.getCurrentPageId() as string,
  }), [editor]);

  const [template, setTemplate] = useState<MindboardTemplate>("blank");

  useEffect(() => {
    if (!yBg) return;
    function sync() {
      const t = (yBg!.get(pageId) as MindboardTemplate | undefined) ?? "blank";
      setTemplate(t);
    }
    sync();
    yBg.observe(sync);
    return () => yBg.unobserve(sync);
  }, [yBg, pageId]);

  const style = useMemo(
    () => buildBgStyle(template, camera.x, camera.y, camera.z, isDark),
    [template, camera.x, camera.y, camera.z, isDark],
  );

  return <div style={{ position: "absolute", inset: 0, ...style }} />;
}

// ── MindboardTemplatePicker — tldraw TLComponents.InFrontOfTheCanvas slot ─────

import { usePillColors } from "./mindboard-pill-colors";
import { TemplateTile, TemplateIcon } from "@/components/TldrawWhiteboardEditor";
import { TEMPLATE_LABELS, type PageTemplate } from "./page-config";

export function MindboardTemplatePicker() {
  const editor = useEditor();
  const yBg = useContext(MindboardBgCtx);
  const c = usePillColors();
  const [open, setOpen] = useState(false);

  const pageId = useValue("mb-page-id", () => editor.getCurrentPageId() as string, [editor]);
  const [current, setCurrent] = useState<MindboardTemplate>("blank");

  useEffect(() => {
    if (!yBg) return;
    function sync() {
      const t = (yBg!.get(pageId) as MindboardTemplate | undefined) ?? "blank";
      setCurrent(t);
    }
    sync();
    yBg.observe(sync);
    return () => yBg.unobserve(sync);
  }, [yBg, pageId]);

  const isReadonly = editor.getInstanceState().isReadonly;
  if (isReadonly || !yBg) return null;

  function apply(t: MindboardTemplate) {
    yBg!.set(pageId, t);
    setOpen(false);
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: c.text,
    opacity: 0.38,
    marginBottom: 7,
  };

  return (
    <div
      style={{ position: "absolute", bottom: 56, left: 8, zIndex: 500 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 590 }} onPointerDown={() => setOpen(false)} />
          <div style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            zIndex: 600,
            background: c.popoverBg,
            border: `1px solid ${c.border}`,
            boxShadow: c.shadow,
            borderRadius: 14,
            padding: 12,
            width: 216,
          }}>
            <p style={sectionLabel}>Background</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
              {MINDBOARD_TEMPLATES.map((t) => (
                <TemplateTile key={t} template={t as PageTemplate} active={current === t} c={c} onClick={() => apply(t)} />
              ))}
            </div>
          </div>
        </>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px 5px 9px",
          borderRadius: 999,
          border: `1px solid ${c.border}`,
          background: c.bg,
          boxShadow: c.shadow,
          color: c.text,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
          outline: "none",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = c.hover; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = c.bg; }}
      >
        <TemplateIcon template={current as PageTemplate} size={14} />
        {TEMPLATE_LABELS[current as PageTemplate]}
      </button>
    </div>
  );
}
