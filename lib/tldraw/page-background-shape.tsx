"use client";

import { Rectangle2d, ShapeUtil, T, type TLBaseShape } from "tldraw";
import { COVER_COLORS, isCoverTemplate, isDarkTemplate, PAGE_H, PAGE_W, type PageTemplate } from "./page-config";

export type PageBackgroundShape = TLBaseShape<
  "page-background",
  { w: number; h: number; template: string }
>;

const SPACING = 36;
const LINE_COLOR = "#cbd5e1";
const DOT_COLOR = "#94a3b8";
const DARK_LINE_COLOR = "rgba(255,255,255,0.1)";
const DARK_DOT_COLOR = "rgba(255,255,255,0.2)";
const DARK_BG = "#1a1a1a";

function borderColor(template: string): string {
  if (isCoverTemplate(template)) return "rgba(0,0,0,0.2)";
  if (isDarkTemplate(template)) return "rgba(255,255,255,0.25)";
  return "rgba(0,0,0,0.18)";
}

export class PageBackgroundShapeUtil extends ShapeUtil<PageBackgroundShape> {
  static override type = "page-background" as const;

  static override props = {
    w: T.number,
    h: T.number,
    template: T.string,
  };

  override getDefaultProps(): PageBackgroundShape["props"] {
    return { w: PAGE_W, h: PAGE_H, template: "blank" };
  }

  override canBind() {
    return false;
  }
  override canEdit() {
    return false;
  }
  override canResize() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }
  override hideSelectionBoundsBg() {
    return true;
  }
  override hideSelectionBoundsFg() {
    return true;
  }
  override isAspectRatioLocked() {
    return true;
  }

  override getGeometry(shape: PageBackgroundShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override component(shape: PageBackgroundShape) {
    return (
      <PageBackground
        template={shape.props.template as PageTemplate}
        w={shape.props.w}
        h={shape.props.h}
      />
    );
  }

  override indicator() {
    return null;
  }

  // Called by tldraw's built-in SVG/PNG export — returns pure SVG so the
  // template renders identically to what's shown on the canvas.
  override toSvg(shape: PageBackgroundShape) {
    return (
      <PageBackgroundSvg
        template={shape.props.template as PageTemplate}
        w={shape.props.w}
        h={shape.props.h}
      />
    );
  }
}

function TemplateContent({
  template,
  w,
  h,
  Root,
  rootProps,
}: {
  template: PageTemplate;
  w: number;
  h: number;
  Root: "svg" | "g";
  rootProps?: Record<string, unknown>;
}) {
  const hLines = Math.ceil(h / SPACING);
  const vLines = Math.ceil(w / SPACING);
  const stroke = borderColor(template);

  if (isCoverTemplate(template)) {
    const bg = COVER_COLORS[template] ?? "#1e40af";
    return (
      <Root {...(rootProps as object)}>
        <rect width={w} height={h} fill={bg} />
        <rect x={w * 0.08} y={h * 0.36} width={w * 0.84} height={2} fill="rgba(255,255,255,0.25)" />
        <rect x={w * 0.08} y={h * 0.64} width={w * 0.84} height={1} fill="rgba(255,255,255,0.15)" />
        <rect width={w} height={h} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </Root>
    );
  }

  const dark = isDarkTemplate(template);
  const lineColor = dark ? DARK_LINE_COLOR : LINE_COLOR;
  const dotColor = dark ? DARK_DOT_COLOR : DOT_COLOR;
  const bgFill = dark ? DARK_BG : "white";
  const baseName = dark ? template.replace("-dark", "") : template;

  return (
    <Root {...(rootProps as object)}>
      <rect width={w} height={h} fill={bgFill} />

      {baseName === "lined" &&
        Array.from({ length: hLines }, (_, i) => (
          <line key={i} x1={0} y1={(i + 1) * SPACING} x2={w} y2={(i + 1) * SPACING} stroke={lineColor} strokeWidth={1} />
        ))}

      {baseName === "dotted" &&
        Array.from({ length: hLines }, (_, row) =>
          Array.from({ length: vLines }, (_, col) => (
            <circle key={`${row}-${col}`} cx={(col + 1) * SPACING} cy={(row + 1) * SPACING} r={1.5} fill={dotColor} />
          )),
        )}

      {baseName === "grid" && (
        <>
          {Array.from({ length: hLines }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={(i + 1) * SPACING} x2={w} y2={(i + 1) * SPACING} stroke={lineColor} strokeWidth={1} />
          ))}
          {Array.from({ length: vLines }, (_, i) => (
            <line key={`v${i}`} x1={(i + 1) * SPACING} y1={0} x2={(i + 1) * SPACING} y2={h} stroke={lineColor} strokeWidth={1} />
          ))}
        </>
      )}

      <rect width={w} height={h} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </Root>
  );
}

// DOM canvas renderer — uses <svg> as root
function PageBackground({ template, w, h }: { template: PageTemplate; w: number; h: number }) {
  const dark = isDarkTemplate(template) || isCoverTemplate(template);
  const glow = dark
    ? "drop-shadow(0 8px 60px rgba(0,0,0,0.85)) drop-shadow(0 2px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 40px rgba(91,156,246,0.18)) drop-shadow(0 0 2px rgba(255,255,255,0.14))"
    : "drop-shadow(0 8px 40px rgba(0,0,0,0.22)) drop-shadow(0 20px 60px rgba(0,0,0,0.10)) drop-shadow(0 0 40px rgba(33,112,228,0.07))";

  return (
    <TemplateContent
      template={template}
      w={w}
      h={h}
      Root="svg"
      rootProps={{ width: w, height: h, style: { position: "absolute", inset: 0, display: "block", filter: glow } }}
    />
  );
}

// SVG export renderer — uses <g> as root (embedded inside tldraw's parent <svg>)
function PageBackgroundSvg({ template, w, h }: { template: PageTemplate; w: number; h: number }) {
  return <TemplateContent template={template} w={w} h={h} Root="g" />;
}
