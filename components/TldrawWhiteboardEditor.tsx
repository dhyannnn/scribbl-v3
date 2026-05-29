"use client";

import "tldraw/tldraw.css";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowheadStylePickerSet,
  ArrowToolbarItem,
  DefaultMainMenu,
  DefaultStylePanel,
  DefaultToolbarContent,
  DrawToolbarItem,
  EditSubmenu,
  EraserToolbarItem,
  ExtrasGroup,
  GeoStylePickerSet,
  HandToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  MobileStylePanel,
  NoteToolbarItem,
  OpacitySlider,
  OverflowingToolbar,
  PORTRAIT_BREAKPOINT,
  PreferencesGroup,
  SelectToolbarItem,
  SplineStylePickerSet,
  TextStylePickerSet,
  TextToolbarItem,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  TldrawUiButtonPicker,
  ViewSubmenu,
  useBreakpoint,
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
  type TLUiStylePanelProps,
} from "tldraw";
import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  LineShapeSplineStyle,
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
// Context that passes per-session flags into the tldraw component tree.
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

// ── Custom main menu / export submenu — all formats export ALL pages, JSON is removed

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
        // Brief pause between downloads so the browser doesn't block them
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

  // Keep the outer header button wired to this handler (which has the live useEditor() instance).
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
  StylePanel: ScribblStylePanel,
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
  const breakpoint = useBreakpoint();
  const { MainMenu, QuickActions, ActionsMenu, PageMenu } = useTldrawUiComponents();
  const editor = useEditor();
  const isSinglePageMode = useValue("scribbl-is-single-page-mode", () => editor.options.maxPages <= 1, [editor]);

  if (!MainMenu && !PageMenu && !QuickActions && !ActionsMenu && breakpoint < 6) {
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

function ScribblToolbar() {
  const breakpoint = useBreakpoint();
  const isReadonlyMode = useReadonly();
  const { canUploadAssets } = useContext(ExportCtx);
  const { penSlots, setSlot } = useContext(PenSlotCtx);
  const editor = useEditor();
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);
  const currentToolId = useValue("scribbl-current-tool", () => editor.getCurrentToolId(), [editor]);

  return (
    <div className="tlui-toolbar">
      <div className="tlui-toolbar__inner">
        <div className="tlui-toolbar__left">
          {!isReadonlyMode && (
            <div style={{ display: "flex", gap: 2, padding: "0 4px", alignItems: "center" }}>
              {penSlots.map((slot, idx) => (
                <PenSlotButton
                  key={idx}
                  slot={slot}
                  isActive={currentToolId === "draw" && activeSlotIdx === idx}
                  onActivate={() => setActiveSlotIdx(idx)}
                  onUpdateSlot={(updated: PenSlot) => setSlot(idx, updated)}
                />
              ))}
            </div>
          )}
          <OverflowingToolbar>
            {canUploadAssets ? (
              <DefaultToolbarContent />
            ) : (
              <>
                <DrawToolbarItem />
                <SelectToolbarItem />
                <HandToolbarItem />
                <EraserToolbarItem />
                <ArrowToolbarItem />
                <TextToolbarItem />
                <NoteToolbarItem />
                <HighlightToolbarItem />
                <LaserToolbarItem />
                {/* AssetToolbarItem intentionally omitted — image uploads gated to Pro */}
              </>
            )}
          </OverflowingToolbar>
        </div>
        {breakpoint < PORTRAIT_BREAKPOINT.TABLET_SM && !isReadonlyMode ? (
          <div className="tlui-toolbar__tools">
            <MobileStylePanel />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Pen slot buttons ──────────────────────────────────────────────────────────

function PenSlotButton({
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
  const theme = getDefaultColorTheme({ isDarkMode });
  const hexColor = (theme as unknown as Record<string, { solid: string }>)[slot.color]?.solid ?? "#000";

  function activate() {
    editor.setCurrentTool("draw");
    editor.setStyleForNextShapes(DefaultColorStyle, slot.color);
    editor.setStyleForNextShapes(DefaultSizeStyle, slot.size);
    onActivate();
  }

  return (
    <div style={{ position: "relative" }} onPointerDown={(e) => e.stopPropagation()}>
      {popoverOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 590 }}
            onPointerDown={() => setPopoverOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 600,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              width: 184,
            }}
          >
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-subtle)", margin: "0 0 6px" }}>Color</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3, marginBottom: 10 }}>
              {(["black", "grey", "red", "light-red", "orange", "yellow", "green", "light-green", "blue", "light-blue", "violet", "light-violet"] as TLDefaultColorStyle[]).map((c) => {
                const hex = (getDefaultColorTheme({ isDarkMode }) as unknown as Record<string, { solid: string }>)[c]?.solid ?? "#000";
                return (
                  <button
                    key={c}
                    onClick={() => onUpdateSlot({ ...slot, color: c })}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: hex,
                      border: "none",
                      outline: slot.color === c ? "2px solid var(--color-secondary)" : "2px solid transparent",
                      outlineOffset: 1,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-subtle)", margin: "0 0 6px" }}>Size</p>
            <div style={{ display: "flex", gap: 3 }}>
              {SIZE_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateSlot({ ...slot, size: s })}
                  style={{
                    flex: 1,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    background: slot.size === s ? "var(--color-surface-highest)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <svg width={28} height={16} viewBox="0 0 28 16" style={{ display: "block" }}>
                    <line x1={4} y1={8} x2={24} y2={8} stroke={hexColor} strokeWidth={SIZE_STROKE_WEIGHTS[s]} strokeLinecap="round" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <button
        title="Double-tap to edit"
        onClick={activate}
        onDoubleClick={(e) => { e.preventDefault(); setPopoverOpen((v) => !v); }}
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          border: "none",
          outline: isActive ? "2px solid var(--color-secondary)" : "none",
          outlineOffset: 1,
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        <svg width={20} height={20} viewBox="0 0 20 20" fill="none" style={{ display: "block" }}>
          <line x1={4} y1={15} x2={16} y2={5} stroke={hexColor} strokeWidth={SIZE_STROKE_WEIGHTS[slot.size] + 0.5} strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ── Template picker (rendered inside the tldraw canvas via InFrontOfTheCanvas)

function TemplatePicker() {
  const editor = useEditor();
  const [open, setOpen] = useState(false);

  // useValue subscribes to the tldraw store so this re-runs whenever shapes change,
  // including when handleMount creates the background shape after mount.
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
    // Use store.put directly — editor.updateShape can silently skip locked shapes.
    editor.store.put([{ ...bgShape, props: { ...bgShape.props, template: t } }]);
    setOpen(false);
  }

  return (
    <div
      style={{ position: "absolute", bottom: 56, left: 8, zIndex: 500 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {open && (
        <div className="mb-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {/* Light section */}
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-subtle)]">
              Light
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {LIGHT_TEMPLATES.map((t) => (
                <button
                  key={t}
                  onClick={() => apply(t)}
                  className={`flex flex-col items-center gap-1 rounded-md p-2 text-xs transition hover:bg-[var(--color-surface-mid)] ${current === t ? "bg-[var(--color-secondary-dim)] font-semibold text-[var(--color-secondary)]" : "text-[var(--color-muted)]"}`}
                >
                  <TemplateIcon template={t} />
                  {TEMPLATE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {/* Dark section */}
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-subtle)]">
              Dark
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {DARK_TEMPLATES.map((t) => (
                <button
                  key={t}
                  onClick={() => apply(t)}
                  className={`flex flex-col items-center gap-1 rounded-md p-2 text-xs transition hover:bg-[var(--color-surface-mid)] ${current === t ? "bg-[var(--color-secondary-dim)] font-semibold text-[var(--color-secondary)]" : "text-[var(--color-muted)]"}`}
                >
                  <TemplateIcon template={t} />
                  {TEMPLATE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {/* Cover section */}
          <div className="px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-subtle)]">
              Cover
            </p>
            <div className="mt-2 flex gap-1">
              {COVER_TEMPLATES.map((t) => (
                <button
                  key={t}
                  onClick={() => apply(t)}
                  title={TEMPLATE_LABELS[t]}
                  className={`h-8 w-8 rounded-md transition hover:scale-110 ${current === t ? "ring-2 ring-[var(--color-secondary)] ring-offset-1" : ""}`}
                  style={{ background: COVER_COLORS_MAP[t] }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-muted)] shadow-sm transition hover:bg-[var(--color-surface-mid)]"
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
  // blank (light or dark)
  return (
    <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
      <rect width={16} height={10} rx={1} fill={bg} stroke={border} strokeWidth={0.5} />
    </svg>
  );
}

// ── Custom style panel (P4 + P6) ─────────────────────────────────────────────

const COLOR_ITEMS: ReadonlyArray<{ readonly value: TLDefaultColorStyle; readonly icon: string }> = [
  { value: "black", icon: "color" },
  { value: "grey", icon: "color" },
  { value: "light-violet", icon: "color" },
  { value: "violet", icon: "color" },
  { value: "blue", icon: "color" },
  { value: "light-blue", icon: "color" },
  { value: "yellow", icon: "color" },
  { value: "orange", icon: "color" },
  { value: "green", icon: "color" },
  { value: "light-green", icon: "color" },
  { value: "light-red", icon: "color" },
  { value: "red", icon: "color" },
];

const FILL_ITEMS: ReadonlyArray<{ readonly value: TLDefaultFillStyle; readonly icon: string }> = [
  { value: "none", icon: "fill-none" },
  { value: "semi", icon: "fill-semi" },
  { value: "solid", icon: "fill-solid" },
  { value: "pattern", icon: "fill-pattern" },
];

const SIZE_STROKE_WEIGHTS: Record<TLDefaultSizeStyle, number> = { s: 1.5, m: 3, l: 5.5, xl: 9 };
const SIZE_ORDER: TLDefaultSizeStyle[] = ["s", "m", "l", "xl"];
const DASH_ORDER: TLDefaultDashStyle[] = ["draw", "solid", "dashed", "dotted"];

function ScribblStylePanel(props: TLUiStylePanelProps) {
  return (
    <DefaultStylePanel {...props}>
      <ScribblStylePanelContent />
    </DefaultStylePanel>
  );
}

function ScribblStylePanelContent() {
  const editor = useEditor();
  const isDarkMode = useIsDarkMode();
  const styles = useRelevantStyles();

  const handleStyleChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (style: any, value: any) => {
      editor.run(() => {
        if (editor.isIn("select")) {
          editor.setStyleForSelectedShapes(style, value);
        }
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
  const geo = styles.get(GeoShapeGeoStyle);
  const arrowheadEnd = styles.get(ArrowShapeArrowheadEndStyle);
  const arrowheadStart = styles.get(ArrowShapeArrowheadStartStyle);
  const spline = styles.get(LineShapeSplineStyle);
  const font = styles.get(DefaultFontStyle);

  const showPickers = fill !== undefined || dash !== undefined || size !== undefined;
  const showGeoSection = geo !== undefined || arrowheadEnd !== undefined || arrowheadStart !== undefined || spline !== undefined;

  return (
    <>
      <div tabIndex={-1} className="tlui-style-panel__section__common" aria-label="style panel styles" data-testid="style.panel">
        {color !== undefined && (
          <TldrawUiButtonPicker
            title="Color"
            uiType="color"
            style={DefaultColorStyle}
            items={COLOR_ITEMS}
            value={color}
            onValueChange={handleStyleChange}
            theme={theme}
          />
        )}
        <OpacitySlider />
      </div>
      {showPickers && (
        <div className="tlui-style-panel__section" aria-label="style panel styles">
          {fill !== undefined && (
            <TldrawUiButtonPicker
              title="Fill"
              uiType="fill"
              style={DefaultFillStyle}
              items={FILL_ITEMS}
              value={fill}
              onValueChange={handleStyleChange}
              theme={theme}
            />
          )}
          {dash !== undefined && (
            <ScribblDashRow
              value={dash.type === "shared" ? dash.value : undefined}
              onChange={(v) => handleStyleChange(DefaultDashStyle, v)}
            />
          )}
          {size !== undefined && (
            <ScribblSizeRow
              value={size.type === "shared" ? size.value : undefined}
              onChange={(v) => handleStyleChange(DefaultSizeStyle, v)}
            />
          )}
        </div>
      )}
      {font !== undefined && (
        <TextStylePickerSet theme={theme} styles={styles} />
      )}
      {showGeoSection && (
        <div className="tlui-style-panel__section" aria-label="style panel styles">
          <GeoStylePickerSet styles={styles} />
          <ArrowheadStylePickerSet styles={styles} />
          <SplineStylePickerSet styles={styles} />
        </div>
      )}
    </>
  );
}

function ScribblSizeRow({
  value,
  onChange,
}: {
  value: TLDefaultSizeStyle | undefined;
  onChange: (v: TLDefaultSizeStyle) => void;
}) {
  return (
    <div className="tlui-style-panel__row" style={{ gap: 2, padding: "2px 0" }}>
      {SIZE_ORDER.map((s) => {
        const active = value === s;
        return (
          <button
            key={s}
            title={s.toUpperCase()}
            onClick={() => onChange(s)}
            style={{
              flex: 1,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              background: active ? "var(--color-surface-highest)" : "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width={28} height={16} viewBox="0 0 28 16" style={{ display: "block" }}>
              <line
                x1={4} y1={8} x2={24} y2={8}
                stroke="currentColor"
                strokeWidth={SIZE_STROKE_WEIGHTS[s]}
                strokeLinecap="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function ScribblDashRow({
  value,
  onChange,
}: {
  value: TLDefaultDashStyle | undefined;
  onChange: (v: TLDefaultDashStyle) => void;
}) {
  return (
    <div className="tlui-style-panel__row" style={{ gap: 2, padding: "2px 0" }}>
      {DASH_ORDER.map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            title={d}
            onClick={() => onChange(d)}
            style={{
              flex: 1,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              background: active ? "var(--color-surface-highest)" : "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <DashIcon type={d} />
          </button>
        );
      })}
    </div>
  );
}

function DashIcon({ type }: { type: TLDefaultDashStyle }) {
  if (type === "draw") {
    return (
      <svg width={28} height={16} viewBox="0 0 28 16" style={{ display: "block" }}>
        <path
          d="M4,8 C7,5 9,11 12,8 C15,5 17,11 20,8 C22,6 24,8 24,8"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
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

// ── Main editor component

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

  // Seed title into Yjs on first open if no peer has set it yet (wait for sync)
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

  // Sync remote title changes into local state
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
  // Refs so that the one-time onMount closure always calls the latest versions.
  const canEditRef = useRef(canEdit);
  const canUploadAssetsRef = useRef(canUploadAssets);
  const queueAutosaveRef = useRef<() => void>(() => {});
  const exportPdfFnRef = useRef<(() => Promise<void>) | null>(null);
  const registerExportPdf = useCallback((fn: (() => Promise<void>) | null) => {
    exportPdfFnRef.current = fn;
  }, []);

  useEffect(() => {
    titleValueRef.current = titleValue;
  }, [titleValue]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    canUploadAssetsRef.current = canUploadAssets;
  }, [canUploadAssets]);

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

  useEffect(() => {
    queueAutosaveRef.current = queueAutosave;
  }, [queueAutosave]);

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

      // Fixed landscape page — constrain camera to page bounds
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

      // Ensure every page has a locked background shape
      for (const page of editor.getPages()) {
        ensurePageBackground(editor, page.id);
      }

      // Auto-init background when a new page is added
      const unsubPage = editor.sideEffects.registerAfterCreateHandler(
        "page",
        (page) => {
          ensurePageBackground(editor, page.id);
        },
      );

      // Prevent page-background shapes from being deleted
      const unsubDelete = editor.sideEffects.registerBeforeDeleteHandler(
        "shape",
        (shape) => {
          if (shape.type === "page-background") return false;
        },
      );

      // Keep page-background shapes locked
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

      if (!canEditRef.current) {
        editor.updateInstanceState({ isReadonly: true });
      } else {
        editor.setCurrentTool("draw");
      }

      // Block image/file uploads for plans that don't support asset uploads.
      // Overriding the external content handlers stops both drag-and-drop
      // and clipboard paste of images/blobs.
      if (!canUploadAssetsRef.current) {
        editor.registerExternalContentHandler("files", () => {});
      }

      const unsubStore = editor.store.listen(
        () => {
          queueAutosaveRef.current();
        },
        { source: "user", scope: "document" },
      );

      const unsubZoom = editor.store.listen(
        () => {
          zoomUpdateRef.current(Math.round(editor.getZoomLevel() * 100));
        },
        { source: "all" },
      );

      return () => {
        unsubPage();
        unsubDelete();
        unsubChange();
        unsubStore();
        unsubZoom();
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

  // ── Goodnotes / fullscreen variant ────────────────────────────────────────
  if (variant === "goodnotes") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5">
          {/* Pencil icon */}
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
          {/* Title + autosave status */}
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
          {/* Visibility control */}
          {canChangeVisibility && noteVisibility && (
            <VisibilityDropdown workspaceId={workspaceId} noteId={noteId} current={noteVisibility} />
          )}
          {/* Presence avatars */}
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
          {/* Export PDF */}
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
          {/* Share */}
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
          {/* Collapse — icon only, matches text editor */}
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

        {/* Canvas */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {canvas}
        </div>

        {/* View-only banner */}
        {!canEdit && (
          <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface-low)] px-5 py-2 text-xs text-[var(--color-muted)]">
            View-only — only the owner or collaborative editors can make changes.
          </div>
        )}

        {/* Footer */}
        <div className="flex h-10 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5">
          {/* Left: save status */}
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
          {/* Right: zoom + save */}
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

  // ── Card variant (unchanged) ──────────────────────────────────────────────
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

  // createShapeId produces `shape:${string}` — use the pre-built id
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
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Could not save. Try again.";
    default:
      return "Autosaves after each drawing change.";
  }
}
