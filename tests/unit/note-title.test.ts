import { describe, expect, it } from "vitest";
import { createDefaultNoteTitle, sanitizeNoteTitle, noteTitleMaxLength } from "@/lib/note-title";

describe("createDefaultNoteTitle", () => {
  const date = new Date("2026-06-03T14:30:00Z");

  it("produces 'Private note' prefix for TEXT/PRIVATE", () => {
    const title = createDefaultNoteTitle({ scope: "PRIVATE", type: "TEXT", date });
    expect(title).toMatch(/^Private note/);
  });

  it("produces 'Shared note' prefix for TEXT/WORKSPACE_SHARED non-collaborative", () => {
    const title = createDefaultNoteTitle({
      scope: "WORKSPACE_SHARED",
      type: "TEXT",
      collaborative: false,
      date,
    });
    expect(title).toMatch(/^Shared note/);
  });

  it("produces 'Collaborative note' prefix for TEXT/WORKSPACE_SHARED collaborative", () => {
    const title = createDefaultNoteTitle({
      scope: "WORKSPACE_SHARED",
      type: "TEXT",
      collaborative: true,
      date,
    });
    expect(title).toMatch(/^Collaborative note/);
  });

  it("uses 'whiteboard' type label for WHITEBOARD", () => {
    const title = createDefaultNoteTitle({ scope: "PRIVATE", type: "WHITEBOARD", date });
    expect(title).toContain("whiteboard");
  });

  it("uses 'mind board' type label for MINDBOARD", () => {
    const title = createDefaultNoteTitle({ scope: "PRIVATE", type: "MINDBOARD", date });
    expect(title).toContain("mind board");
  });

  it("uses 'mind board' type label for shared MINDBOARD", () => {
    const title = createDefaultNoteTitle({
      scope: "WORKSPACE_SHARED",
      type: "MINDBOARD",
      collaborative: true,
      date,
    });
    expect(title).toContain("mind board");
    expect(title).toMatch(/^Collaborative/);
  });

  it("private MINDBOARD is prefixed 'Private'", () => {
    const title = createDefaultNoteTitle({ scope: "PRIVATE", type: "MINDBOARD", date });
    expect(title).toMatch(/^Private mind board/);
  });

  it("includes a timestamp in the title", () => {
    const title = createDefaultNoteTitle({ scope: "PRIVATE", type: "MINDBOARD", date });
    // should contain the date separator
    expect(title).toContain(" - ");
    // and at least some digit from the date
    expect(title).toMatch(/\d/);
  });
});

describe("sanitizeNoteTitle", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeNoteTitle("  hello   world  ", "fallback")).toBe("hello world");
  });

  it("falls back to the provided fallback when value is empty", () => {
    expect(sanitizeNoteTitle("", "My fallback")).toBe("My fallback");
  });

  it("falls back to 'Untitled note' when both value and fallback are empty", () => {
    expect(sanitizeNoteTitle("", "")).toBe("Untitled note");
  });

  it("truncates to noteTitleMaxLength", () => {
    const long = "a".repeat(noteTitleMaxLength + 50);
    expect(sanitizeNoteTitle(long, "fb")).toHaveLength(noteTitleMaxLength);
  });

  it("handles null value", () => {
    expect(sanitizeNoteTitle(null, "fallback")).toBe("fallback");
  });
});
