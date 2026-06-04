import { describe, expect, it } from "vitest";
import {
  getOrientationPreset,
  detectOrientation,
  ORIENTATION_PRESETS,
  PAGE_W,
  PAGE_H,
} from "@/lib/tldraw/page-config";

describe("ORIENTATION_PRESETS", () => {
  it("has exactly four presets", () => {
    expect(ORIENTATION_PRESETS).toHaveLength(4);
  });

  it("landscape preset matches the default PAGE_W × PAGE_H", () => {
    const landscape = ORIENTATION_PRESETS.find((p) => p.id === "landscape");
    expect(landscape?.w).toBe(PAGE_W);
    expect(landscape?.h).toBe(PAGE_H);
  });

  it("portrait preset is taller than it is wide", () => {
    const portrait = ORIENTATION_PRESETS.find((p) => p.id === "portrait")!;
    expect(portrait.h).toBeGreaterThan(portrait.w);
  });

  it("square preset has equal width and height", () => {
    const square = ORIENTATION_PRESETS.find((p) => p.id === "square")!;
    expect(square.w).toBe(square.h);
  });

  it("widescreen preset is wider than landscape height", () => {
    const ws = ORIENTATION_PRESETS.find((p) => p.id === "widescreen")!;
    expect(ws.w).toBeGreaterThan(ws.h);
  });
});

describe("getOrientationPreset", () => {
  it("returns the correct preset for each id", () => {
    for (const preset of ORIENTATION_PRESETS) {
      expect(getOrientationPreset(preset.id)).toEqual(preset);
    }
  });

  it("falls back to landscape for an unknown id", () => {
    // TypeScript normally prevents this but we can cast to test the fallback
    const result = getOrientationPreset("unknown" as never);
    expect(result.id).toBe("landscape");
  });
});

describe("detectOrientation", () => {
  it("detects landscape from exact dimensions", () => {
    expect(detectOrientation(1600, 1000)).toBe("landscape");
  });

  it("detects portrait from exact dimensions", () => {
    expect(detectOrientation(1000, 1600)).toBe("portrait");
  });

  it("detects widescreen from exact dimensions", () => {
    expect(detectOrientation(1600, 900)).toBe("widescreen");
  });

  it("detects square from exact dimensions", () => {
    expect(detectOrientation(1200, 1200)).toBe("square");
  });

  it("falls back to landscape for wide custom dimensions not in presets", () => {
    expect(detectOrientation(2000, 1200)).toBe("landscape");
  });

  it("falls back to portrait for tall custom dimensions not in presets", () => {
    expect(detectOrientation(800, 1400)).toBe("portrait");
  });
});
