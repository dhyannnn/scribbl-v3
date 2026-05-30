"use client";

import "tldraw/tldraw.css";
import "@/lib/tldraw/tldraw-overrides.css";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  DefaultMainMenu,
  EditSubmenu,
  ExtrasGroup,
  PreferencesGroup,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  ViewSubmenu,
  useActions,
  useEditor,
  useExportAs,
  useReadonly,
  useRelevantStyles,
  useTldrawUiComponents,
  useValue,
  type Editor,
  type TLComponents,
  type TLPageId,
  type TLShapeId,
  type TLUiMainMenuProps,
} from "tldraw";
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  getDefaultColorTheme,
  type TLDefaultColorStyle,
  type TLDefaultSizeStyle,
  type TLDefaultDashStyle,
  type TLDefaultFillStyle,
} from "@tldraw/tlschema";
import { useIsDarkMode } from "@tldraw/editor";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { useOthers, useRoom } from "@liveblocks/react/suspense";
import { VisibilityDropdown } from "@/components/VisibilityDropdown";
import { exportWhiteboardPdf } from "@/lib/tldraw/export-pdf";
import { noteTitleMaxLength } from "@/lib/note-title";
import { useTldrawYjsStore } from "@/components/tldraw-yjs-store";
import {
  COVER_TEMPLATES,
  DARK_TEMPLATES,
  LIGHT_TEMPLATES,
  getPageBackgroundShapeId,
  PAGE_H,
  PAGE_W,
  TEMPLATE_LABELS,
  type PageTemplate,
} from "@/lib/tldraw/page-config";
import {
  PageBackgroundShapeUtil,
  type PageBackgroundShape,
} from "@/lib/tldraw/page-background-shape";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SHAPE_UTILS = [PageBackgroundShapeUtil];

type ExportCtxValue = {
  title: string;
  canExportPdf: boolean;
  canUploadAssets: boolean;
  onRegisterExportPdf: ((fn: (() => Promise<void>) | null) => void) | null;
};
const ExportCtx = createContext<ExportCtxValue>({
  title: "",
  canExportPdf: true,
  canUploadAssets: true,
  onRegisterExportPdf: null,
});

type PenSlot = { color: TLDefaultColorStyle; size: TLDefaultSizeStyle };

const DEFAULT_PEN_SLOTS: [PenSlot, PenSlot, PenSlot] = [
  { color: "black", size: "m" },
  { color: "blue", size: "s" },
  { color: "red", size: "l" },
];

type PenSlotCtxValue = {
  penSlots: [PenSlot, PenSlot, PenSlot];
  setSlot: (idx: number, slot: PenSlot) => void;
};

const PenSlotCtx = createContext<PenSlotCtxValue>({
  penSlots: DEFAULT_PEN_SLOTS,
  setSlot: () => {},
});

// ── Custom main menu ──────────────────────────────────────────────────────────

function CustomMainMenu(props: TLUiMainMenuProps) {
  return (
    <DefaultMainMenu {...props}>
      <EditSubmenu />
      <ViewSubmenu />
      <CustomExportMenu />
      <ExtrasGroup />
      <PreferencesGroup />
    </DefaultMainMenu>
  );
}

function CustomExportMenu() {
  const editor = useEditor();
  const exportAs = useExportAs();
  const { title, canExportPdf, onRegisterExportPdf } = useContext(ExportCtx);
  const [busySvg, setBusySvg] = useState(false);
  const [busyPng, setBusyPng] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);

  async function handleAllPages(format: "svg" | "png", setBusy: (v: boolean) => void) {
    setBusy(true);
    const pages = editor.getPages();
    const originalPage = editor.getCurrentPageId();
    try {
      for (let i = 0; i < pages.length; i++) {
        editor.setCurrentPage(pages[i].id);
        const ids = [...editor.getCurrentPageShapeIds()];
        const name = pages.length > 1 ? `${title || "whiteboard"} - Page ${i + 1}` : (title || "whiteboard");
        exportAs(ids, format, name);
        if (i < pages.length - 1) await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      editor.setCurrentPage(originalPage);
      setBusy(false);
    }
  }

  async function handlePdf() {
    setBusyPdf(true);
    try {
      await exportWhiteboardPdf(editor, title || "whiteboard");
    } finally {
      setBusyPdf(false);
    }
  }

  const handlePdfRef = useRef(handlePdf);
  handlePdfRef.current = handlePdf;
  useEffect(() => {
    onRegisterExportPdf?.(() => handlePdfRef.current());
    return () => onRegisterExportPdf?.(null);
  }, [onRegisterExportPdf]);

  return (
    <TldrawUiMenuSubmenu id="export-all-as" label="context-menu.export-all-as" size="small">
      <TldrawUiMenuGroup id="scribbl-export-all-as-group">
        <TldrawUiMenuItem
          id="scribbl-export-all-as-svg"
          label={busySvg ? "Exporting SVG..." : "SVG"}
          readonlyOk
          disabled={busySvg}
          onSelect={() => handleAllPages("svg", setBusySvg)}
        />
        <TldrawUiMenuItem
          id="scribbl-export-all-as-png"
          label={busyPng ? "Exporting PNG..." : "PNG"}
          readonlyOk
          disabled={busyPng}
          onSelect={() => handleAllPages("png", setBusyPng)}
        />
        {canExportPdf ? (
          <TldrawUiMenuItem
            id="scribbl-export-all-as-pdf"
            label={busyPdf ? "Exporting PDF..." : "PDF"}
            readonlyOk
            disabled={busyPdf}
            onSelect={handlePdf}
          />
        ) : null}
      </TldrawUiMenuGroup>
    </TldrawUiMenuSubmenu>
  );
}

const TLDRAW_COMPONENTS = {
  InFrontOfTheCanvas: TemplatePicker,
  MainMenu: CustomMainMenu,
  MenuPanel: ScribblMenuPanel,
  StylePanel: null,
  Toolbar: ScribblToolbar,
} satisfies TLComponents;

const TldrawCanvas = dynamic(async () => (await import("tldraw")).Tldraw, {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[#777970]">
      Loading whiteboard…
    </div>
  ),
});

function ScribblMenuPanel() {
  const { MainMenu, QuickActions, ActionsMenu, PageMenu } = useTldrawUiComponents();
  const editor = useEditor();
  const isSinglePageMode = useValue("scribbl-is-single-page-mode", () => editor.options.maxPages <= 1, [editor]);

  if (!MainMenu && !PageMenu && !QuickActions && !ActionsMenu) {
    return null;
  }

  return (
    <div className="tlui-menu-zone">
      <div className="tlui-buttons__horizontal">
        {MainMenu ? <MainMenu /> : null}
        {PageMenu && !isSinglePageMode ? <PageMenu /> : null}
        {QuickActions ? <QuickActions /> : null}
        {ActionsMenu ? <ActionsMenu /> : null}
      </div>
    </div>
  );
}

// ── Unified pill toolbar ──────────────────────────────────────────────────────

const COLOR_VALUES: TLDefaultColorStyle[] = [
  "black", "grey", "red", "light-red", "orange", "yellow",
  "green", "light-green", "blue", "light-blue", "violet", "light-violet",
];

const SIZE_DOT_DIAMETERS: Record<TLDefaultSizeStyle, number> = { s: 5, m: 8, l: 12, xl: 17 };
const SIZE_ORDER: TLDefaultSizeStyle[] = ["s", "m", "l", "xl"];
const DASH_ORDER: TLDefaultDashStyle[] = ["draw", "solid", "dashed", "dotted"];

function SizeDot({ size, active }: { size: TLDefaultSizeStyle; active: boolean }) {
  const d = SIZE_DOT_DIAMETERS[size];
  return (
    <span
      style={{
        display: "block",
        width: d,
        height: d,
        borderRadius: "50%",
        background: active ? "var(--color-secondary)" : "currentColor",
        opacity: active ? 1 : 0.55,
        flexShrink: 0,
      }}
    />
  );
}

function DashIcon({ type }: { type: TLDefaultDashStyle }) {
  if (type === "draw") {
    return (
      <svg width={28} height={16} viewBox="0 0 28 16" style={{ display: "block" }}>
        <path d="M4,8 C7,5 9,11 12,8 C15,5 17,11 20,8 C22,6 24,8 24,8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "solid") {
    return (
      <svg width={28} height={16} viewBox="0 0 28 16" style={{ display: "block" }}>
        <line x1={4} y1={8} x2={24} y2={8} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "dashed") {
    return (
      <svg width={28} height={16} viewBox="0 0 28 16" style={{ display: "block" }}>
        <line x1={4} y1={8} x2={24} y2={8} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="6 3" />
      </svg>
    );
  }
  return (
    <svg width={28} height={16} viewBox="0 0 28 16" style={{ display: "block" }}>
      <line x1={4} y1={8} x2={24} y2={8} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="2 4" />
    </svg>
  );
}

// Tool icon SVGs (18×18 viewBox)
function ToolIcon({ tool }: { tool: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style: { display: "block" as const } };
  if (tool === "draw") return (
    <svg {...props}>
      <path d="M2,14 C5,8 8,18 11,12 C14,6 15,14 18,10" />
    </svg>
  );
  if (tool === "select") return (
    <svg {...props} stroke="none">
      <path d="M3,3 L3,15 L7,11 L10,17 L12,16 L9,10 L14,10 Z" fill="currentColor" />
    </svg>
  );
  if (tool === "hand") return (
    <svg {...props}>
      <path d="M9,16 L9,7 M6,16 L6,8 M12,16 L12,7 M15,14 L15,9 C15,7.3 13,7 13,9 M3,14 C3,10 6,10 6,8" />
    </svg>
  );
  if (tool === "eraser") return (
    <svg {...props}>
      <path d="M4,14 L10,4 L16,8 L10,18" />
      <line x1={2} y1={16} x2={16} y2={16} />
    </svg>
  );
  if (tool === "arrow") return (
    <svg {...props}>
      <line x1={4} y1={14} x2={14} y2={6} />
      <path d="M9,6 L14,6 L14,11" />
    </svg>
  );
  if (tool === "text") return (
    <svg {...props}>
      <line x1={4} y1={6} x2={14} y2={6} />
      <line x1={9} y1={6} x2={9} y2={16} />
      <line x1={6} y1={16} x2={12} y2={16} />
    </svg>
  );
  if (tool === "note") return (
    <svg {...props}>
      <path d="M3,3 h12 v10 l-4,4 H3 Z" />
      <path d="M11,15 v-4 h4" />
    </svg>
  );
  if (tool === "geo") return (
    <svg {...props}>
      <path d="M9,3 L15,9 L9,15 L3,9 Z" />
    </svg>
  );
  if (tool === "highlight") return (
    <svg {...props}>
      <path d="M5,16 L5,8 L9,4 L13,8 L13,16 Z" />
      <line x1={5} y1={14} x2={13} y2={14} strokeWidth={2.5} />
    </svg>
  );
  if (tool === "laser") return (
    <svg {...props}>
      <line x1={3} y1={15} x2={11} y2={7} />
      <line x1={13} y1={5} x2={15} y2={3} />
      <path d="M9,3 L15,9" />
    </svg>
  );
  if (tool === "overflow") return (
    <svg {...props} stroke="none">
      <circle cx={4} cy={9} r={1.2} fill="currentColor" />
      <circle cx={9} cy={9} r={1.2} fill="currentColor" />
      <circle cx={14} cy={9} r={1.2} fill="currentColor" />
    </svg>
  );
  return null;
}

function usePillColors() {
  const isDark = useIsDarkMode();
  return useMemo(() => ({
    bg:        isDark ? "#1e1e1e"                  : "#f8f9fa",
    border:    isDark ? "rgba(255,255,255,0.12)"   : "rgba(0,0,0,0.10)",
    hover:     isDark ? "rgba(255,255,255,0.08)"   : "rgba(0,0,0,0.06)",
    active:    isDark ? "rgba(255,255,255,0.16)"   : "rgba(0,0,0,0.10)",
    divider:   isDark ? "rgba(255,255,255,0.10)"   : "rgba(0,0,0,0.10)",
    text:      isDark ? "rgba(255,255,255,0.85)"   : "rgba(0,0,0,0.80)",
    popoverBg: isDark ? "#1e1e1e"                  : "#ffffff",
    shadow:    isDark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.12)",
  }), [isDark]);
}

const PILL_BASE: React.CSSProperties = {
  position: "fixed",
  bottom: 16,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 500,
  borderRadius: 999,
  padding: "6px 10px",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

function TBButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const c = usePillColors();
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        border: "none",
        background: active ? c.active : "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        color: c.text,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = c.hover; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? c.active : "transparent"; }}
    >
      {children}
    </button>
  );
}

const GEO_OPTIONS = [
  "rectangle", "ellipse", "triangle", "diamond",
  "star", "hexagon", "pentagon", "rhombus",
  "oval", "cross", "arrow-right", "arrow-left",
  "arrow-up", "arrow-down", "x-box", "check-box",
] as const;
type GeoOption = typeof GEO_OPTIONS[number];

function GeoPreview({ geo }: { geo: GeoOption }) {
  const s = { display: "block" as const };
  if (geo === "rectangle") return <svg width={18} height={14} viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><rect x={1} y={1} width={16} height={12} rx={1} /></svg>;
  if (geo === "ellipse") return <svg width={18} height={14} viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><ellipse cx={9} cy={7} rx={8} ry={6} /></svg>;
  if (geo === "triangle") return <svg width={18} height={14} viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><path d="M9,1 L17,13 L1,13 Z" /></svg>;
  if (geo === "diamond") return <svg width={18} height={14} viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><path d="M9,1 L17,7 L9,13 L1,7 Z" /></svg>;
  if (geo === "star") return <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><path d="M9,2 L10.8,7 L16,7 L11.6,10.2 L13.4,15.2 L9,12 L4.6,15.2 L6.4,10.2 L2,7 L7.2,7 Z" /></svg>;
  if (geo === "hexagon") return <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><path d="M9,1 L16,5 L16,13 L9,17 L2,13 L2,5 Z" /></svg>;
  if (geo === "pentagon") return <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><path d="M9,1 L17,7 L14,16 L4,16 L1,7 Z" /></svg>;
  if (geo === "rhombus") return <svg width={18} height={14} viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><path d="M4,7 L9,1 L14,7 L9,13 Z" /></svg>;
  if (geo === "oval") return <svg width={20} height={12} viewBox="0 0 20 12" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><rect x={1} y={1} width={18} height={10} rx={5} /></svg>;
  if (geo === "cross") return <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><path d="M9,2 L9,16 M2,9 L16,9" /></svg>;
  // fallback for arrow types and others
  return <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.4} style={s}><rect x={2} y={2} width={14} height={14} rx={2} /></svg>;
}

function ColorPicker({
  value,
  onChange,
}: {
  value: TLDefaultColorStyle | undefined;
  onChange: (c: TLDefaultColorStyle) => void;
}) {
  const isDarkMode = useIsDarkMode();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
      {COLOR_VALUES.map((c) => {
        const hex = (getDefaultColorTheme({ isDarkMode }) as unknown as Record<string, { solid: string }>)[c]?.solid ?? "#000";
        return (
          <button
            key={c}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange(c)}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: hex,
              border: "none",
              outline: value === c ? "2px solid var(--color-secondary)" : "2px solid transparent",
              outlineOffset: 1,
              cursor: "pointer",
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}

const POPOVER_BASE: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 600,
  borderRadius: 8,
  padding: 8,
};

function usePopoverStyle(overrides?: React.CSSProperties): React.CSSProperties {
  const c = usePillColors();
  return useMemo(
    () => ({ ...POPOVER_BASE, background: c.popoverBg, border: `1px solid ${c.border}`, boxShadow: c.shadow, ...overrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.popoverBg, c.border, c.shadow],
  );
}

function Divider() {
  const c = usePillColors();
  return <div style={{ width: 1, height: 20, background: c.divider, margin: "0 4px", flexShrink: 0 }} />;
}

function PopoverSection({ label }: { label: string }) {
  const c = usePillColors();
  return (
    <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: c.text, opacity: 0.5, margin: "6px 0 4px" }}>
      {label}
    </p>
  );
}

// ── Pen slot circle ───────────────────────────────────────────────────────────

function PenSlotCircle({
  slot,
  isActive,
  onActivate,
  onUpdateSlot,
}: {
  slot: PenSlot;
  isActive: boolean;
  onActivate: () => void;
  onUpdateSlot: (slot: PenSlot) => void;
}) {
  const editor = useEditor();
  const isDarkMode = useIsDarkMode();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const c = usePillColors();
  const popoverStyle = usePopoverStyle({ width: 184 });
  const theme = getDefaultColorTheme({ isDarkMode });
  const hexColor = (theme as unknown as Record<string, { solid: string }>)[slot.color]?.solid ?? "#000";

  function activate() {
    editor.setCurrentTool("draw");
    editor.setStyleForNextShapes(DefaultColorStyle, slot.color);
    editor.setStyleForNextShapes(DefaultSizeStyle, slot.size);
    onActivate();
  }

  function handleClick() {
    if (isActive) {
      setPopoverOpen((v) => !v);
    } else {
      activate();
    }
  }

  return (
    <div style={{ position: "relative" }} onPointerDown={(e) => e.stopPropagation()}>
      {popoverOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 590 }} onPointerDown={() => setPopoverOpen(false)} />
          <div style={popoverStyle}>
            <PopoverSection label="Color" />
            <ColorPicker value={slot.color} onChange={(col) => onUpdateSlot({ ...slot, color: col })} />
            <PopoverSection label="Size" />
            <div style={{ display: "flex", gap: 3 }}>
              {SIZE_ORDER.map((s) => (
                <button
                  key={s}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onUpdateSlot({ ...slot, size: s })}
                  style={{
                    flex: 1,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    background: slot.size === s ? c.active : "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <SizeDot size={s} active={slot.size === s} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <button
        title={isActive ? "Edit pen" : "Activate pen"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleClick}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "none",
          outline: isActive ? "2px solid var(--color-secondary)" : "none",
          outlineOffset: 2,
          background: hexColor,
          cursor: "pointer",
          flexShrink: 0,
        }}
      />
    </div>
  );
}

// ── Style controls (right section) ───────────────────────────────────────────

function StyleControls() {
  const editor = useEditor();
  const isDarkMode = useIsDarkMode();
  const styles = useRelevantStyles();
  const [colorOpen, setColorOpen] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  const c = usePillColors();
  const colorPopoverStyle = usePopoverStyle({ width: 168 });
  const tunePopoverStyle = usePopoverStyle({ width: 200, right: 0, left: "auto", transform: "none" });

  const handleStyleChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (style: any, value: any) => {
      editor.run(() => {
        if (editor.isIn("select")) editor.setStyleForSelectedShapes(style, value);
        editor.setStyleForNextShapes(style, value);
        editor.updateInstanceState({ isChangingStyle: true });
      });
    },
    [editor],
  );

  if (!styles) return null;

  const theme = getDefaultColorTheme({ isDarkMode });
  const color = styles.get(DefaultColorStyle);
  const fill = styles.get(DefaultFillStyle);
  const dash = styles.get(DefaultDashStyle);
  const size = styles.get(DefaultSizeStyle);

  const hasAny = color !== undefined || size !== undefined || dash !== undefined || fill !== undefined;
  if (!hasAny) return null;

  const currentColorHex = color !== undefined && color.type === "shared"
    ? (theme as unknown as Record<string, { solid: string }>)[color.value]?.solid ?? "#000"
    : "#888";

  const currentSize = size?.type === "shared" ? size.value : undefined;
  const currentDash = dash?.type === "shared" ? dash.value : undefined;
  const currentFill = fill?.type === "shared" ? fill.value : undefined;
  const currentColor = color?.type === "shared" ? color.value : undefined;

  const opacityOptions = [20, 40, 60, 80, 100] as const;
  const opacity = styles.get({ type: "shared", id: "opacity" } as never);

  return (
    <>
      <Divider />

      {/* Color swatch */}
      {color !== undefined && (
        <div style={{ position: "relative" }} onPointerDown={(e) => e.stopPropagation()}>
          {colorOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 590 }} onPointerDown={() => setColorOpen(false)} />
              <div style={colorPopoverStyle}>
                <ColorPicker value={currentColor} onChange={(cv) => { handleStyleChange(DefaultColorStyle, cv); }} />
              </div>
            </>
          )}
          <button
            title="Color"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setColorOpen((v) => !v)}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: `1px solid ${c.border}`,
              background: currentColorHex,
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
        </div>
      )}

      {/* Size dots */}
      {size !== undefined && SIZE_ORDER.map((s) => (
        <button
          key={s}
          title={s.toUpperCase()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => handleStyleChange(DefaultSizeStyle, s)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            border: "none",
            background: currentSize === s ? c.active : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            flexShrink: 0,
            color: c.text,
          }}
        >
          <SizeDot size={s} active={currentSize === s} />
        </button>
      ))}

      {/* Tune button */}
      {(dash !== undefined || fill !== undefined) && (
        <div style={{ position: "relative" }} onPointerDown={(e) => e.stopPropagation()}>
          {tuneOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 590 }} onPointerDown={() => setTuneOpen(false)} />
              <div style={tunePopoverStyle}>
                <PopoverSection label="Opacity" />
                <div style={{ display: "flex", gap: 3 }}>
                  {opacityOptions.map((pct) => {
                    const val = pct / 100;
                    const isActive = opacity !== undefined && opacity.type === "shared" && Math.round((opacity.value as number) * 100) === pct;
                    return (
                      <button
                        key={pct}
                        title={`${pct}%`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => handleStyleChange({ type: "shared", id: "opacity" }, val)}
                        style={{
                          flex: 1,
                          height: 28,
                          borderRadius: "50%",
                          border: `1px solid ${c.border}`,
                          background: isActive ? "var(--color-secondary)" : "transparent",
                          color: isActive ? "white" : c.text,
                          cursor: "pointer",
                          fontSize: 9,
                          fontWeight: 600,
                          padding: 0,
                        }}
                      >
                        {pct}
                      </button>
                    );
                  })}
                </div>
                {dash !== undefined && (
                  <>
                    <PopoverSection label="Stroke" />
                    <div style={{ display: "flex", gap: 2 }}>
                      {DASH_ORDER.map((d) => (
                        <button
                          key={d}
                          title={d}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => handleStyleChange(DefaultDashStyle, d)}
                          style={{
                            flex: 1, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                            borderRadius: 4, background: currentDash === d ? c.active : "transparent",
                            border: "none", cursor: "pointer", padding: 0, color: c.text,
                          }}
                        >
                          <DashIcon type={d} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {fill !== undefined && (
                  <>
                    <PopoverSection label="Fill" />
                    <div style={{ display: "flex", gap: 2 }}>
                      {(["none", "semi", "solid", "pattern"] as TLDefaultFillStyle[]).map((f) => (
                        <button
                          key={f}
                          title={f}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => handleStyleChange(DefaultFillStyle, f)}
                          style={{
                            flex: 1, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                            borderRadius: 4, background: currentFill === f ? c.active : "transparent",
                            border: "none", cursor: "pointer", padding: 0, color: c.text,
                          }}
                        >
                          <FillIcon type={f} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          <TBButton title="Stroke & fill" active={tuneOpen} onClick={() => setTuneOpen((v) => !v)}>
            <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" style={{ display: "block" }}>
              <line x1={3} y1={5} x2={15} y2={5} />
              <line x1={3} y1={9} x2={15} y2={9} />
              <line x1={3} y1={13} x2={15} y2={13} />
            </svg>
          </TBButton>
        </div>
      )}
    </>
  );
}

function FillIcon({ type }: { type: TLDefaultFillStyle }) {
  if (type === "none") return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.4} style={{ display: "block" }}>
      <rect x={2} y={2} width={14} height={14} rx={2} />
    </svg>
  );
  if (type === "semi") return (
    <svg width={18} height={18} viewBox="0 0 18 18" style={{ display: "block" }}>
      <rect x={2} y={2} width={14} height={14} rx={2} fill="currentColor" opacity={0.3} />
      <rect x={2} y={2} width={14} height={14} rx={2} fill="none" stroke="currentColor" strokeWidth={1.4} />
    </svg>
  );
  if (type === "solid") return (
    <svg width={18} height={18} viewBox="0 0 18 18" style={{ display: "block" }}>
      <rect x={2} y={2} width={14} height={14} rx={2} fill="currentColor" />
    </svg>
  );
  // pattern
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" style={{ display: "block" }}>
      <rect x={2} y={2} width={14} height={14} rx={2} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <line x1={5} y1={5} x2={13} y2={13} stroke="currentColor" strokeWidth={1} />
      <line x1={8} y1={4} x2={14} y2={10} stroke="currentColor" strokeWidth={1} />
      <line x1={4} y1={8} x2={10} y2={14} stroke="currentColor" strokeWidth={1} />
    </svg>
  );
}

// ── Main pill toolbar ─────────────────────────────────────────────────────────

function ScribblToolbar() {
  const isReadonlyMode = useReadonly();
  const { penSlots, setSlot } = useContext(PenSlotCtx);
  const editor = useEditor();
  const { canUploadAssets } = useContext(ExportCtx);
  const actions = useActions();

  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);
  const [geoOpen, setGeoOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("scribbl:toolbar-collapsed") === "true"; } catch { return false; }
  });

  const currentToolId = useValue("scribbl-current-tool", () => editor.getCurrentToolId(), [editor]);

  // Deactivate pen slot when a non-draw tool is active
  useEffect(() => {
    if (currentToolId !== "draw") setActiveSlotIdx(null);
  }, [currentToolId]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("scribbl:toolbar-collapsed", String(next)); } catch {}
      return next;
    });
  }

  function activateTool(toolId: string) {
    editor.setCurrentTool(toolId);
  }

  function activateSlot(idx: number) {
    const slot = penSlots[idx];
    editor.setCurrentTool("draw");
    editor.setStyleForNextShapes(DefaultColorStyle, slot.color);
    editor.setStyleForNextShapes(DefaultSizeStyle, slot.size);
    setActiveSlotIdx(idx);
  }

  const c = usePillColors();
  const geoPopoverStyle = usePopoverStyle({ width: 160, left: "50%", transform: "translateX(-50%)" });
  const overflowPopoverStyle = usePopoverStyle({ display: "flex", gap: 4, padding: 6 });

  const pillStyle: React.CSSProperties = {
    ...PILL_BASE,
    background: c.bg,
    border: `1px solid ${c.border}`,
    boxShadow: c.shadow,
  };

  if (isReadonlyMode) return null;

  const chevronBtn = (
    <TBButton title={collapsed ? "Expand toolbar" : "Collapse toolbar"} onClick={toggleCollapsed}>
      <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
        {collapsed
          ? <path d="M5,11 L9,7 L13,11" />
          : <path d="M5,7 L9,11 L13,7" />}
      </svg>
    </TBButton>
  );

  // Collapsed state: pen slots + chevron only
  if (collapsed) {
    return createPortal(
      <div style={pillStyle} onPointerDown={(e) => e.stopPropagation()}>
        {penSlots.map((slot, idx) => (
          <PenSlotCircle
            key={idx}
            slot={slot}
            isActive={currentToolId === "draw" && activeSlotIdx === idx}
            onActivate={() => activateSlot(idx)}
            onUpdateSlot={(updated) => {
                setSlot(idx, updated);
                if (idx === activeSlotIdx) {
                  editor.setStyleForNextShapes(DefaultColorStyle, updated.color);
                  editor.setStyleForNextShapes(DefaultSizeStyle, updated.size);
                }
              }}
          />
        ))}
        <Divider />
        {chevronBtn}
      </div>,
      document.body,
    );
  }

  const tools = [
    { id: "draw", label: "Draw" },
    { id: "select", label: "Select" },
    { id: "hand", label: "Hand" },
    { id: "eraser", label: "Eraser" },
    { id: "arrow", label: "Arrow" },
    { id: "text", label: "Text" },
    { id: "note", label: "Note" },
    { id: "geo", label: "Shapes" },
  ] as const;

  const isGeoPicker = currentToolId === "geo";

  return createPortal(
    <div style={pillStyle} onPointerDown={(e) => e.stopPropagation()}>
      {/* Pen slots */}
      {penSlots.map((slot, idx) => (
        <PenSlotCircle
          key={idx}
          slot={slot}
          isActive={currentToolId === "draw" && activeSlotIdx === idx}
          onActivate={() => activateSlot(idx)}
          onUpdateSlot={(updated) => setSlot(idx, updated)}
        />
      ))}

      <Divider />

      {/* Tool buttons */}
      {tools.map(({ id, label }) => {
        if (id === "geo") {
          return (
            <div key="geo" style={{ position: "relative" }}>
              {geoOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 590 }} onPointerDown={() => setGeoOpen(false)} />
                  <div style={geoPopoverStyle}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                      {GEO_OPTIONS.map((geo) => (
                        <button
                          key={geo}
                          title={geo}
                          onClick={() => {
                            editor.setCurrentTool("geo");
                            editor.setStyleForNextShapes(GeoShapeGeoStyle, geo);
                            setGeoOpen(false);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          style={{
                            width: 32,
                            height: 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 4,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: 0,
                            color: c.text,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = c.hover; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <GeoPreview geo={geo} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <TBButton
                title="Shapes"
                active={isGeoPicker}
                onClick={() => {
                  if (isGeoPicker) {
                    setGeoOpen((v) => !v);
                  } else {
                    editor.setCurrentTool("geo");
                    setGeoOpen(false);
                  }
                }}
              >
                <ToolIcon tool="geo" />
              </TBButton>
            </div>
          );
        }
        return (
          <TBButton key={id} title={label} active={currentToolId === id} onClick={() => activateTool(id)}>
            <ToolIcon tool={id} />
          </TBButton>
        );
      })}

      {/* Overflow: Highlight + Laser */}
      <div style={{ position: "relative" }}>
        {overflowOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 590 }} onPointerDown={() => setOverflowOpen(false)} />
            <div style={overflowPopoverStyle}>
              <TBButton title="Highlight" active={currentToolId === "highlight"} onClick={() => { activateTool("highlight"); setOverflowOpen(false); }}>
                <ToolIcon tool="highlight" />
              </TBButton>
              <TBButton title="Laser" active={currentToolId === "laser"} onClick={() => { activateTool("laser"); setOverflowOpen(false); }}>
                <ToolIcon tool="laser" />
              </TBButton>
            </div>
          </>
        )}
        <TBButton
          title="More tools"
          active={overflowOpen || currentToolId === "highlight" || currentToolId === "laser"}
          onClick={() => setOverflowOpen((v) => !v)}
        >
          <ToolIcon tool="overflow" />
        </TBButton>
      </div>

      {/* Image upload */}
      {canUploadAssets && (
        <TBButton title="Upload image" onClick={() => actions["insert-media"]?.onSelect("toolbar")}>
          <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
            <rect x={1.5} y={3.5} width={15} height={11} rx={1.5} />
            <circle cx={6} cy={7.5} r={1.3} />
            <path d="M1.5,12.5 L5.5,8.5 L8.5,11.5 L11,9 L16.5,14.5" />
          </svg>
        </TBButton>
      )}

      {/* Style controls */}
      <StyleControls />

      <Divider />

      {/* Collapse chevron */}
      {chevronBtn}
    </div>,
    document.body,
  );
}

// ── Template picker ───────────────────────────────────────────────────────────

type PillColors = ReturnType<typeof usePillColors>;

function TemplateTile({
  template, active, c, onClick,
}: { template: PageTemplate; active: boolean; c: PillColors; onClick: () => void }) {
  return (
    <button
      title={TEMPLATE_LABELS[template]}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "5px 3px 4px",
        borderRadius: 8,
        border: `1.5px solid ${active ? c.text : "transparent"}`,
        background: active ? c.active : "transparent",
        cursor: "pointer",
        outline: "none",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = c.hover; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? c.active : "transparent"; }}
    >
      <TemplateIcon template={template} size={36} />
      <span style={{ fontSize: 9, fontWeight: 500, color: c.text, opacity: active ? 1 : 0.55, letterSpacing: "0.01em", lineHeight: 1 }}>
        {TEMPLATE_LABELS[template]}
      </span>
    </button>
  );
}

function TemplatePicker() {
  const editor = useEditor();
  const c = usePillColors();
  const [open, setOpen] = useState(false);

  const bgShape = useValue(
    "page-bg-shape",
    () =>
      editor
        .getCurrentPageShapes()
        .find((s) => s.type === "page-background") as PageBackgroundShape | undefined,
    [editor],
  );
  const current = (bgShape?.props.template ?? "blank") as PageTemplate;
  const isReadonly = editor.getInstanceState().isReadonly;
  if (isReadonly) return null;

  function apply(t: PageTemplate) {
    if (!bgShape) return;
    editor.store.put([{ ...bgShape, props: { ...bgShape.props, template: t } }]);
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
            <p style={sectionLabel}>Light</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5, marginBottom: 10 }}>
              {LIGHT_TEMPLATES.map((t) => (
                <TemplateTile key={t} template={t} active={current === t} c={c} onClick={() => apply(t)} />
              ))}
            </div>
            <div style={{ height: 1, background: c.divider, margin: "0 0 10px" }} />
            <p style={sectionLabel}>Dark</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5, marginBottom: 10 }}>
              {DARK_TEMPLATES.map((t) => (
                <TemplateTile key={t} template={t} active={current === t} c={c} onClick={() => apply(t)} />
              ))}
            </div>
            <div style={{ height: 1, background: c.divider, margin: "0 0 10px" }} />
            <p style={sectionLabel}>Cover</p>
            <div style={{ display: "flex", gap: 6 }}>
              {COVER_TEMPLATES.map((t) => (
                <button
                  key={t}
                  title={TEMPLATE_LABELS[t]}
                  onClick={() => apply(t)}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 7,
                    border: `2px solid ${current === t ? c.text : "transparent"}`,
                    background: COVER_COLORS_MAP[t],
                    cursor: "pointer",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.06)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                />
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
        <TemplateIcon template={current} size={14} />
        {TEMPLATE_LABELS[current]}
      </button>
    </div>
  );
}

const COVER_COLORS_MAP: Record<string, string> = {
  "cover-blue": "#1e40af",
  "cover-green": "#166534",
  "cover-rose": "#9f1239",
  "cover-dark": "#1c1917",
};

function TemplateIcon({ template, size = 16 }: { template: PageTemplate; size?: number }) {
  const s = size;

  if (COVER_TEMPLATES.includes(template)) {
    return (
      <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
        <rect width={16} height={10} rx={1} fill={COVER_COLORS_MAP[template] ?? "#1e40af"} />
      </svg>
    );
  }

  const dark = DARK_TEMPLATES.includes(template);
  const bg = dark ? "#1a1a1a" : "white";
  const border = dark ? "rgba(255,255,255,0.25)" : "#d1d5db";
  const lineStroke = dark ? "rgba(255,255,255,0.18)" : "#cbd5e1";
  const dotFill = dark ? "rgba(255,255,255,0.3)" : "#94a3b8";
  const baseName = dark ? template.replace("-dark", "") : template;

  if (baseName === "lined") {
    return (
      <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
        <rect width={16} height={10} rx={1} fill={bg} stroke={border} strokeWidth={0.5} />
        {[2.5, 5, 7.5].map((y) => (
          <line key={y} x1={2} y1={y} x2={14} y2={y} stroke={lineStroke} strokeWidth={0.8} />
        ))}
      </svg>
    );
  }
  if (baseName === "dotted") {
    return (
      <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
        <rect width={16} height={10} rx={1} fill={bg} stroke={border} strokeWidth={0.5} />
        {[3, 7, 11].flatMap((x) =>
          [2.5, 5, 7.5].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={0.7} fill={dotFill} />
          )),
        )}
      </svg>
    );
  }
  if (baseName === "grid") {
    return (
      <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
        <rect width={16} height={10} rx={1} fill={bg} stroke={border} strokeWidth={0.5} />
        {[4, 8, 12].map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={10} stroke={lineStroke} strokeWidth={0.5} />
        ))}
        {[2.5, 5, 7.5].map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={16} y2={y} stroke={lineStroke} strokeWidth={0.5} />
        ))}
      </svg>
    );
  }
  return (
    <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
      <rect width={16} height={10} rx={1} fill={bg} stroke={border} strokeWidth={0.5} />
    </svg>
  );
}

// ── Main editor component ─────────────────────────────────────────────────────

export function TldrawWhiteboardEditor({
  workspaceId,
  meetingId,
  noteId,
  title,
  initialSnapshot,
  saveAction,
  canEdit = true,
  canExportPdf = true,
  canUploadAssets = true,
  canvasHeight = 600,
  variant = "card",
  onCollapse,
  noteVisibility,
  canChangeVisibility = false,
}: {
  workspaceId: string;
  meetingId?: string;
  noteId: string;
  title: string;
  initialSnapshot: unknown;
  saveAction: (formData: FormData) => void | Promise<void>;
  canEdit?: boolean;
  canExportPdf?: boolean;
  canUploadAssets?: boolean;
  canvasHeight?: number | string;
  variant?: "card" | "goodnotes";
  onCollapse?: () => void;
  noteVisibility?: string;
  canChangeVisibility?: boolean;
}) {
  const room = useRoom();
  const storeWithStatus = useTldrawYjsStore({
    shapeUtils: SHAPE_UTILS,
    initialSnapshot,
  });
  const [titleValue, setTitleValue] = useState(title);

  const [penSlots, setPenSlots] = useState<[PenSlot, PenSlot, PenSlot]>(() => {
    if (typeof window === "undefined") return DEFAULT_PEN_SLOTS;
    try {
      const stored = localStorage.getItem(`scribbl:pen-slots:${noteId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 3) return parsed as [PenSlot, PenSlot, PenSlot];
      }
    } catch {}
    return DEFAULT_PEN_SLOTS;
  });

  const setSlot = useCallback((idx: number, updated: PenSlot) => {
    setPenSlots((prev) => {
      const next: [PenSlot, PenSlot, PenSlot] = [prev[0], prev[1], prev[2]];
      next[idx] = updated;
      try {
        localStorage.setItem(`scribbl:pen-slots:${noteId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [noteId]);

  const yMeta = useMemo(
    () => getYjsProviderForRoom(room).getYDoc().getMap<string>("note-meta"),
    [room],
  );

  useEffect(() => {
    const provider = getYjsProviderForRoom(room);
    function seed() {
      if (!yMeta.get("title")) yMeta.set("title", title);
    }
    if (provider.synced) seed();
    else provider.on("synced", seed);
    return () => provider.off("synced", seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yMeta, room]);

  useEffect(() => {
    function onMeta() {
      const remote = yMeta.get("title") ?? "";
      setTitleValue((prev) => (prev !== remote ? remote : prev));
    }
    yMeta.observe(onMeta);
    return () => yMeta.unobserve(onMeta);
  }, [yMeta]);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPending, startTransition] = useTransition();
  const [linkCopied, setLinkCopied] = useState(false);
  const [busyHeaderPdf, setBusyHeaderPdf] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const others = useOthers();
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomUpdateRef = useRef(setZoomPct);
  const editorRef = useRef<Editor | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveIdRef = useRef(0);
  const hasPendingSaveRef = useRef(false);
  const titleValueRef = useRef(titleValue);
  const canEditRef = useRef(canEdit);
  const canUploadAssetsRef = useRef(canUploadAssets);
  const queueAutosaveRef = useRef<() => void>(() => {});
  const exportPdfFnRef = useRef<(() => Promise<void>) | null>(null);
  const registerExportPdf = useCallback((fn: (() => Promise<void>) | null) => {
    exportPdfFnRef.current = fn;
  }, []);

  useEffect(() => { titleValueRef.current = titleValue; }, [titleValue]);
  useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);
  useEffect(() => { canUploadAssetsRef.current = canUploadAssets; }, [canUploadAssets]);

  const buildFormData = useCallback(() => {
    if (!editorRef.current) return null;
    const snapshot = editorRef.current.store.getStoreSnapshot();
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    fd.set("noteId", noteId);
    if (meetingId) fd.set("meetingId", meetingId);
    fd.set("title", titleValueRef.current);
    fd.set("snapshotJson", JSON.stringify(snapshot));
    return fd;
  }, [workspaceId, noteId, meetingId]);

  const saveNow = useCallback(() => {
    if (!canEdit) return;
    const fd = buildFormData();
    if (!fd) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const saveId = ++latestSaveIdRef.current;
    setSaveState("saving");
    startTransition(async () => {
      try {
        await saveAction(fd);
        if (latestSaveIdRef.current === saveId) {
          hasPendingSaveRef.current = false;
          setSaveState("saved");
        }
      } catch {
        if (latestSaveIdRef.current === saveId) setSaveState("error");
      }
    });
  }, [canEdit, buildFormData, saveAction]);

  const queueAutosave = useCallback(() => {
    if (!canEdit) return;
    setSaveState("dirty");
    hasPendingSaveRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(saveNow, 900);
  }, [canEdit, saveNow]);

  useEffect(() => { queueAutosaveRef.current = queueAutosave; }, [queueAutosave]);

  const flushPendingSave = useCallback(() => {
    if (!canEdit || !hasPendingSaveRef.current) return;
    const fd = buildFormData();
    if (!fd) return;
    hasPendingSaveRef.current = false;
    void Promise.resolve(saveAction(fd)).catch(() => {
      hasPendingSaveRef.current = true;
    });
  }, [canEdit, buildFormData, saveAction]);

  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === "hidden") flushPendingSave();
    }
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushPendingSave);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flushPendingSave);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      const isScribblDark = document.documentElement.getAttribute("data-theme") === "dark";
      editor.user.updateUserPreferences({ colorScheme: isScribblDark ? "dark" : "light" });

      function onScribblTheme(e: Event) {
        const dark = (e as CustomEvent<{ dark: boolean }>).detail.dark;
        editor.user.updateUserPreferences({ colorScheme: dark ? "dark" : "light" });
      }
      window.addEventListener("scribbl:theme", onScribblTheme);

      editor.setCameraOptions({
        constraints: {
          bounds: { x: 0, y: 0, w: PAGE_W, h: PAGE_H },
          padding: { x: 64, y: 64 },
          origin: { x: 0.5, y: 0.5 },
          initialZoom: "fit-max",
          baseZoom: "fit-max",
          behavior: "contain",
        },
      });

      for (const page of editor.getPages()) {
        ensurePageBackground(editor, page.id);
      }

      const unsubPage = editor.sideEffects.registerAfterCreateHandler(
        "page",
        (page) => { ensurePageBackground(editor, page.id); },
      );

      const unsubDelete = editor.sideEffects.registerBeforeDeleteHandler(
        "shape",
        (shape) => { if (shape.type === "page-background") return false; },
      );

      const unsubChange = editor.sideEffects.registerBeforeChangeHandler(
        "shape",
        (_prev, next) => {
          if (next.type === "page-background" && !next.isLocked) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return { ...next, isLocked: true } as any;
          }
          return next;
        },
      );

      // Sync dark mode toggle to page background template
      let prevDark = editor.user.getIsDarkMode();
      const unsubTheme = editor.store.listen(
        () => {
          const dark = editor.user.getIsDarkMode();
          if (dark === prevDark) return;
          prevDark = dark;
          const bgShape = editor.getCurrentPageShapes().find((s) => s.type === "page-background") as PageBackgroundShape | undefined;
          if (!bgShape) return;
          const t = bgShape.props.template as string;
          const lightToDark: Record<string, string> = { blank: "blank-dark", lined: "lined-dark", dotted: "dotted-dark", grid: "grid-dark" };
          const darkToLight: Record<string, string> = { "blank-dark": "blank", "lined-dark": "lined", "dotted-dark": "dotted", "grid-dark": "grid" };
          const newTemplate = dark ? (lightToDark[t] ?? t) : (darkToLight[t] ?? t);
          if (newTemplate !== t) editor.store.put([{ ...bgShape, props: { ...bgShape.props, template: newTemplate } }]);
        },
        { source: "all" },
      );

      if (!canEditRef.current) {
        editor.updateInstanceState({ isReadonly: true });
      } else {
        editor.setCurrentTool("draw");
      }

      if (!canUploadAssetsRef.current) {
        editor.registerExternalContentHandler("files", () => {});
      }

      const unsubStore = editor.store.listen(
        () => { queueAutosaveRef.current(); },
        { source: "user", scope: "document" },
      );

      const unsubZoom = editor.store.listen(
        () => { zoomUpdateRef.current(Math.round(editor.getZoomLevel() * 100)); },
        { source: "all" },
      );

      return () => {
        unsubPage();
        unsubDelete();
        unsubChange();
        unsubTheme();
        unsubStore();
        unsubZoom();
        window.removeEventListener("scribbl:theme", onScribblTheme);
      };
    },
    [],
  );

  useEffect(() => {
    editorRef.current?.updateInstanceState({ isReadonly: !canEdit });
  }, [canEdit]);

  function handleShare() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const canvas = (
    <ExportCtx.Provider value={{ title: titleValue, canExportPdf, canUploadAssets, onRegisterExportPdf: registerExportPdf }}>
      <PenSlotCtx.Provider value={{ penSlots, setSlot }}>
        <TldrawCanvas
          key={`${noteId}:${variant}`}
          store={storeWithStatus}
          shapeUtils={SHAPE_UTILS}
          onMount={handleMount}
          components={TLDRAW_COMPONENTS}
        />
      </PenSlotCtx.Provider>
    </ExportCtx.Provider>
  );

  if (variant === "goodnotes") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            {canEdit ? (
              <input
                value={titleValue}
                maxLength={noteTitleMaxLength}
                onChange={(e) => { setTitleValue(e.target.value); yMeta.set("title", e.target.value); queueAutosave(); }}
                className="w-full border-0 bg-transparent text-sm font-semibold text-[var(--color-text)] outline-none"
              />
            ) : (
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{titleValue}</p>
            )}
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--color-subtle)]">
              {getStatusText(isPending ? "saving" : saveState)}
            </p>
          </div>
          {canChangeVisibility && noteVisibility && (
            <VisibilityDropdown workspaceId={workspaceId} noteId={noteId} current={noteVisibility} />
          )}
          {others.length > 0 && (
            <div className="flex -space-x-1.5">
              {others.slice(0, 4).map((other) => {
                type OtherInfo = { name?: string; color?: string };
                const info = other.info as OtherInfo | undefined;
                const name = info?.name ?? "?";
                const color = info?.color ?? "#085ac0";
                return (
                  <div
                    key={other.connectionId}
                    title={name}
                    className="flex size-7 items-center justify-center rounded-full border-2 border-[var(--color-surface)] text-[10px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {name[0]?.toUpperCase()}
                  </div>
                );
              })}
              {others.length > 4 && (
                <div className="flex size-7 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-surface-high)] text-[10px] font-bold text-[var(--color-muted)]">
                  +{others.length - 4}
                </div>
              )}
            </div>
          )}
          {canExportPdf && (
            <button
              type="button"
              disabled={busyHeaderPdf}
              onClick={async () => {
                const fn = exportPdfFnRef.current;
                const ed = editorRef.current;
                if (!fn && !ed) return;
                setBusyHeaderPdf(true);
                try {
                  if (fn) await fn();
                  else await exportWhiteboardPdf(ed!, titleValue || "whiteboard");
                } finally {
                  setBusyHeaderPdf(false);
                }
              }}
              className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] disabled:opacity-50"
            >
              {busyHeaderPdf ? "Exporting…" : "Export PDF"}
            </button>
          )}
          <button
            type="button"
            onClick={handleShare}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              linkCopied
                ? "bg-[var(--color-success)] text-white"
                : "bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary-hover)]"
            }`}
          >
            {linkCopied ? "Copied!" : "Share"}
          </button>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse"
              className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M13 5H9V1M1 9h4v4M9 1l-5 5M5 13l5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {canvas}
        </div>

        {!canEdit && (
          <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface-low)] px-5 py-2 text-xs text-[var(--color-muted)]">
            View-only — only the owner or collaborative editors can make changes.
          </div>
        )}

        <div className="flex h-10 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5">
          <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--color-subtle)]">
            <span className={`size-1.5 rounded-full ${
              (isPending ? "saving" : saveState) === "saved" || (isPending ? "saving" : saveState) === "idle"
                ? "bg-[var(--color-success)]"
                : (isPending ? "saving" : saveState) === "error"
                ? "bg-[var(--color-danger)]"
                : "bg-[var(--color-warning)]"
            }`} />
            {getStatusText(isPending ? "saving" : saveState)}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 font-mono text-xs text-[var(--color-subtle)]">
              <button
                type="button"
                onClick={() => editorRef.current?.zoomOut()}
                title="Zoom out"
                className="flex size-5 items-center justify-center rounded hover:bg-[var(--color-surface-mid)]"
              >−</button>
              <span className="w-10 text-center">{zoomPct}%</span>
              <button
                type="button"
                onClick={() => editorRef.current?.zoomIn()}
                title="Zoom in"
                className="flex size-5 items-center justify-center rounded hover:bg-[var(--color-surface-mid)]"
              >+</button>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={saveNow}
                disabled={isPending}
                className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-white transition hover:opacity-80 disabled:opacity-40"
              >
                Save Whiteboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {canEdit ? (
          <label className="grid flex-1 gap-1.5">
            <span className="text-sm font-medium text-[var(--color-muted)]">Title</span>
            <input
              value={titleValue}
              maxLength={noteTitleMaxLength}
              onChange={(e) => { setTitleValue(e.target.value); yMeta.set("title", e.target.value); queueAutosave(); }}
              className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)]"
            />
          </label>
        ) : (
          <h3 className="font-semibold text-[var(--color-text)]">{title}</h3>
        )}
        <p className="font-mono text-xs text-[var(--color-subtle)] sm:self-end sm:pb-1">
          {getStatusText(isPending ? "saving" : saveState)}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-sm" style={{ height: canvasHeight }}>
        {canvas}
      </div>
      {!canEdit && (
        <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-muted)]">
          View-only — only the owner or collaborative editors can make changes.
        </p>
      )}
    </div>
  );
}

function ensurePageBackground(editor: Editor, pageId: TLPageId) {
  if (!editor.getPage(pageId)) return;

  const bgId = getPageBackgroundShapeId(pageId as string) as TLShapeId;
  if (editor.getShape(bgId)) return;

  editor.createShape({
    id: bgId,
    parentId: pageId,
    type: "page-background",
    x: 0,
    y: 0,
    isLocked: true,
    props: { w: PAGE_W, h: PAGE_H, template: "blank" },
  });
  editor.sendToBack([bgId]);
}

function getStatusText(saveState: SaveState) {
  switch (saveState) {
    case "dirty": return "Unsaved changes";
    case "saving": return "Saving...";
    case "saved": return "Saved";
    case "error": return "Could not save. Try again.";
    default: return "Autosaves after each drawing change.";
  }
}
