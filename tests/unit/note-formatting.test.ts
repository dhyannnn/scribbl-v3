import { describe, expect, it } from "vitest";

// ── Pure helpers mirroring NoteToolbar stepping logic ─────────────────────────

const FONT_SIZES = ["8px", "10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px"];
const DEFAULT_FONT_SIZE = "16px";

function stepFontSize(current: string | undefined, direction: "up" | "down"): string {
  const active = current || DEFAULT_FONT_SIZE;
  const idx = FONT_SIZES.indexOf(active);
  if (direction === "down") {
    return idx > 0 ? FONT_SIZES[idx - 1]! : FONT_SIZES[0]!;
  }
  return idx < FONT_SIZES.length - 1 ? FONT_SIZES[idx + 1]! : FONT_SIZES[FONT_SIZES.length - 1]!;
}

function isAtMin(current: string | undefined): boolean {
  return !!current && current === FONT_SIZES[0];
}

function isAtMax(current: string | undefined): boolean {
  return !!current && current === FONT_SIZES[FONT_SIZES.length - 1];
}

// ── Line / letter / word spacing helpers ──────────────────────────────────────

const LINE_SPACING_VALUES = ["", "1", "1.15", "1.5", "2", "2.5"];
const LETTER_SPACING_VALUES = ["", "-0.05em", "0em", "0.05em", "0.1em", "0.15em", "0.25em"];
const WORD_SPACING_VALUES   = ["", "-0.05em", "0em", "0.05em", "0.1em", "0.2em", "0.4em"];

function isValidSpacingValue(value: string, options: string[]): boolean {
  return options.includes(value);
}

// ── FONT_SIZES array ──────────────────────────────────────────────────────────

describe("FONT_SIZES array", () => {
  it("starts with 8px and 10px", () => {
    expect(FONT_SIZES[0]).toBe("8px");
    expect(FONT_SIZES[1]).toBe("10px");
  });

  it("has 12 entries total", () => {
    expect(FONT_SIZES).toHaveLength(12);
  });

  it("ends with 48px", () => {
    expect(FONT_SIZES[FONT_SIZES.length - 1]).toBe("48px");
  });

  it("contains 16px (default)", () => {
    expect(FONT_SIZES).toContain("16px");
  });
});

// ── stepFontSize ──────────────────────────────────────────────────────────────

describe("stepFontSize", () => {
  it("steps up from an explicit size", () => {
    expect(stepFontSize("14px", "up")).toBe("16px");
  });

  it("steps down from an explicit size", () => {
    expect(stepFontSize("18px", "down")).toBe("16px");
  });

  it("uses 16px as default when no current size, stepping up", () => {
    expect(stepFontSize(undefined, "up")).toBe("18px");
  });

  it("uses 16px as default when no current size, stepping down", () => {
    expect(stepFontSize(undefined, "down")).toBe("14px");
  });

  it("clamps at minimum when stepping down from 8px", () => {
    expect(stepFontSize("8px", "down")).toBe("8px");
  });

  it("clamps at maximum when stepping up from 48px", () => {
    expect(stepFontSize("48px", "up")).toBe("48px");
  });

  it("steps correctly through every adjacent pair (up)", () => {
    for (let i = 0; i < FONT_SIZES.length - 1; i++) {
      expect(stepFontSize(FONT_SIZES[i], "up")).toBe(FONT_SIZES[i + 1]);
    }
  });

  it("steps correctly through every adjacent pair (down)", () => {
    for (let i = 1; i < FONT_SIZES.length; i++) {
      expect(stepFontSize(FONT_SIZES[i], "down")).toBe(FONT_SIZES[i - 1]);
    }
  });

  it("empty string current behaves same as undefined (uses default)", () => {
    expect(stepFontSize("", "up")).toBe("18px");
  });
});

// ── isAtMin / isAtMax ─────────────────────────────────────────────────────────

describe("isAtMin", () => {
  it("returns true only at 8px", () => {
    expect(isAtMin("8px")).toBe(true);
  });

  it("returns false for any other size", () => {
    expect(isAtMin("10px")).toBe(false);
    expect(isAtMin("48px")).toBe(false);
  });

  it("returns false when no size is active (undefined)", () => {
    expect(isAtMin(undefined)).toBe(false);
  });
});

describe("isAtMax", () => {
  it("returns true only at 48px", () => {
    expect(isAtMax("48px")).toBe(true);
  });

  it("returns false for any other size", () => {
    expect(isAtMax("36px")).toBe(false);
    expect(isAtMax("8px")).toBe(false);
  });

  it("returns false when no size is active (undefined)", () => {
    expect(isAtMax(undefined)).toBe(false);
  });
});

// ── Spacing option validation ─────────────────────────────────────────────────

describe("isValidSpacingValue — line height", () => {
  it("accepts empty string (default)", () => {
    expect(isValidSpacingValue("", LINE_SPACING_VALUES)).toBe(true);
  });

  it("accepts all defined values", () => {
    for (const v of LINE_SPACING_VALUES) {
      expect(isValidSpacingValue(v, LINE_SPACING_VALUES)).toBe(true);
    }
  });

  it("rejects an arbitrary string", () => {
    expect(isValidSpacingValue("99", LINE_SPACING_VALUES)).toBe(false);
  });
});

describe("isValidSpacingValue — letter spacing", () => {
  it("accepts all defined letter-spacing values", () => {
    for (const v of LETTER_SPACING_VALUES) {
      expect(isValidSpacingValue(v, LETTER_SPACING_VALUES)).toBe(true);
    }
  });

  it("rejects a word-spacing value", () => {
    expect(isValidSpacingValue("0.4em", LETTER_SPACING_VALUES)).toBe(false);
  });
});

describe("isValidSpacingValue — word spacing", () => {
  it("accepts all defined word-spacing values", () => {
    for (const v of WORD_SPACING_VALUES) {
      expect(isValidSpacingValue(v, WORD_SPACING_VALUES)).toBe(true);
    }
  });

  it("rejects a letter-spacing value not in word list", () => {
    expect(isValidSpacingValue("0.15em", WORD_SPACING_VALUES)).toBe(false);
  });
});
