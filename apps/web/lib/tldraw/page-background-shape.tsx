"use client";

import { Rectangle2d, ShapeUtil, T, type TLBaseShape } from "tldraw";
import { COVER_COLORS, isCoverTemplate, PAGE_H, PAGE_W, type PageTemplate } from "./page-config";

export type PageBackgroundShape = TLBaseShape<
  "page-background",
  { w: number; h: number; template: string }
>;

const SPACING = 36;
const LINE_COLOR = "#cbd5e1";
const DOT_COLOR = "#94a3b8";

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

  if (isCoverTemplate(template)) {
    const bg = COVER_COLORS[template] ?? "#1e40af";
    return (
      <Root {...(rootProps as object)}>
        <rect width={w} height={h} fill={bg} />
        <rect x={w * 0.08} y={h * 0.36} width={w * 0.84} height={2} fill="rgba(255,255,255,0.25)" />
        <rect x={w * 0.08} y={h * 0.64} width={w * 0.84} height={1} fill="rgba(255,255,255,0.15)" />
      </Root>
    );
  }

  return (
    <Root {...(rootProps as object)}>
      <rect width={w} height={h} fill="white" />

      {template === "lined" &&
        Array.from({ length: hLines }, (_, i) => (
          <line key={i} x1={0} y1={(i + 1) * SPACING} x2={w} y2={(i + 1) * SPACING} stroke={LINE_COLOR} strokeWidth={1} />
        ))}

      {template === "dotted" &&
        Array.from({ length: hLines }, (_, row) =>
          Array.from({ length: vLines }, (_, col) => (
            <circle key={`${row}-${col}`} cx={(col + 1) * SPACING} cy={(row + 1) * SPACING} r={1.5} fill={DOT_COLOR} />
          )),
        )}

      {template === "grid" && (
        <>
          {Array.from({ length: hLines }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={(i + 1) * SPACING} x2={w} y2={(i + 1) * SPACING} stroke={LINE_COLOR} strokeWidth={1} />
          ))}
          {Array.from({ length: vLines }, (_, i) => (
            <line key={`v${i}`} x1={(i + 1) * SPACING} y1={0} x2={(i + 1) * SPACING} y2={h} stroke={LINE_COLOR} strokeWidth={1} />
          ))}
        </>
      )}
    </Root>
  );
}

// DOM canvas renderer — uses <svg> as root
function PageBackground({ template, w, h }: { template: PageTemplate; w: number; h: number }) {
  return (
    <TemplateContent
      template={template}
      w={w}
      h={h}
      Root="svg"
      rootProps={{ width: w, height: h, style: { position: "absolute", inset: 0, display: "block" } }}
    />
  );
}

// SVG export renderer — uses <g> as root (embedded inside tldraw's parent <svg>)
function PageBackgroundSvg({ template, w, h }: { template: PageTemplate; w: number; h: number }) {
  return <TemplateContent template={template} w={w} h={h} Root="g" />;
}
