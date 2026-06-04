import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { escapeRegExp, findMatches } from "@/lib/tiptap/search";

// ── Minimal ProseMirror schema ────────────────────────────────────────────────
// Enough to create text nodes inside paragraphs inside a doc.

const schema = new Schema({
  nodes: {
    doc:       { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text:      { group: "inline" },
  },
  marks: {},
});

function makeDoc(...paragraphs: string[]) {
  return schema.node(
    "doc",
    null,
    paragraphs.map((text) =>
      schema.node("paragraph", null, text ? [schema.text(text)] : []),
    ),
  );
}

// ── escapeRegExp ──────────────────────────────────────────────────────────────

describe("escapeRegExp", () => {
  it("leaves plain text unchanged", () => {
    expect(escapeRegExp("hello world")).toBe("hello world");
  });

  it("escapes . so it matches a literal dot", () => {
    const escaped = escapeRegExp("3.14");
    expect(new RegExp(escaped).test("3.14")).toBe(true);
    expect(new RegExp(escaped).test("3X14")).toBe(false);
  });

  it("escapes * + ? so they are treated as literals", () => {
    for (const char of ["*", "+", "?"]) {
      const escaped = escapeRegExp(char);
      expect(new RegExp(`^${escaped}$`).test(char)).toBe(true);
    }
  });

  it("escapes [] so they are treated as literals", () => {
    const escaped = escapeRegExp("[a-z]");
    expect(new RegExp(escaped).test("[a-z]")).toBe(true);
    expect(new RegExp(escaped).test("a")).toBe(false);
  });

  it("escapes ^ $ { } ( ) |", () => {
    const specials = "^${}()|";
    for (const char of specials) {
      const escaped = escapeRegExp(char);
      expect(new RegExp(`^${escaped}$`).test(char)).toBe(true);
    }
  });

  it("escapes backslash", () => {
    const escaped = escapeRegExp("a\\b");
    expect(new RegExp(escaped).test("a\\b")).toBe(true);
  });
});

// ── findMatches ───────────────────────────────────────────────────────────────

describe("findMatches", () => {
  it("returns empty array for empty search term", () => {
    const doc = makeDoc("hello world");
    expect(findMatches(doc, "")).toHaveLength(0);
  });

  it("returns empty array when term is not present", () => {
    const doc = makeDoc("hello world");
    expect(findMatches(doc, "xyz")).toHaveLength(0);
  });

  it("finds a single match and positions cover the right text", () => {
    const doc = makeDoc("hello world");
    const results = findMatches(doc, "hello");
    expect(results).toHaveLength(1);
    expect(doc.textBetween(results[0].from, results[0].to)).toBe("hello");
  });

  it("finds multiple non-overlapping matches in one paragraph", () => {
    const doc = makeDoc("cat and cat and cat");
    const results = findMatches(doc, "cat");
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(doc.textBetween(r.from, r.to)).toBe("cat");
    }
  });

  it("from is strictly less than to for every match", () => {
    const doc = makeDoc("abcabc");
    const results = findMatches(doc, "a");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.from).toBeLessThan(r.to);
    }
  });

  it("results are ordered by ascending position", () => {
    const doc = makeDoc("one two one two one");
    const results = findMatches(doc, "one");
    for (let i = 1; i < results.length; i++) {
      expect(results[i].from).toBeGreaterThan(results[i - 1].from);
    }
  });

  it("is case-insensitive", () => {
    const doc = makeDoc("Hello HELLO hello");
    const results = findMatches(doc, "hello");
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(doc.textBetween(r.from, r.to).toLowerCase()).toBe("hello");
    }
  });

  it("matches a term with regex special characters literally", () => {
    const doc = makeDoc("price is $3.99 or $5.00");
    const results = findMatches(doc, "$3.99");
    expect(results).toHaveLength(1);
    expect(doc.textBetween(results[0].from, results[0].to)).toBe("$3.99");
  });

  it("does not match substrings of a special-char term as a regex pattern", () => {
    // If '.' were not escaped, findMatches(doc, "a.c") would match "abc".
    const doc = makeDoc("abc aXc a.c");
    const results = findMatches(doc, "a.c");
    expect(results).toHaveLength(1);
    expect(doc.textBetween(results[0].from, results[0].to)).toBe("a.c");
  });

  it("finds matches across multiple paragraphs", () => {
    const doc = makeDoc("first paragraph note", "second paragraph note", "third");
    const results = findMatches(doc, "note");
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(doc.textBetween(r.from, r.to)).toBe("note");
    }
  });

  it("results from different paragraphs are in document order", () => {
    const doc = makeDoc("alpha", "alpha");
    const results = findMatches(doc, "alpha");
    expect(results).toHaveLength(2);
    expect(results[0].from).toBeLessThan(results[1].from);
  });

  it("handles a match at the very start of a paragraph", () => {
    const doc = makeDoc("start of line");
    const results = findMatches(doc, "start");
    expect(results).toHaveLength(1);
    expect(doc.textBetween(results[0].from, results[0].to)).toBe("start");
  });

  it("handles a match at the very end of a paragraph", () => {
    const doc = makeDoc("line ends here");
    const results = findMatches(doc, "here");
    expect(results).toHaveLength(1);
    expect(doc.textBetween(results[0].from, results[0].to)).toBe("here");
  });

  it("returns no results for an empty paragraph", () => {
    const doc = makeDoc("");
    expect(findMatches(doc, "anything")).toHaveLength(0);
  });

  it("replace-all ordering: sorted results cover every occurrence without overlap", () => {
    // Simulates what replaceAllResults does: sort descending by from.
    const doc = makeDoc("foo foo foo");
    const results = findMatches(doc, "foo");
    const sorted = [...results].sort((a, b) => b.from - a.from);
    // sorted should start with the rightmost match
    expect(sorted[0].from).toBeGreaterThan(sorted[1].from);
    expect(sorted[1].from).toBeGreaterThan(sorted[2].from);
    // No two ranges overlap
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].from).toBeGreaterThanOrEqual(sorted[i + 1].to);
    }
  });
});
