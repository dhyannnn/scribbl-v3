import { Extension, type Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

type MathCtx = { display: boolean; latex: string; docFrom: number; docTo: number };

// Build a flat character array with doc positions for each char in the parent node.
// Non-text inline nodes (e.g. existing math nodes) are represented as \x00 placeholders
// so they don't accidentally match $ delimiters.
function buildTextMap(
  parent: Node,
  start: number,
): { text: string; posMap: (number | null)[] } {
  const chars: string[] = [];
  const posMap: (number | null)[] = [];

  parent.forEach((child, offset) => {
    const childDocStart = start + offset;
    if (child.isText && child.text) {
      for (let i = 0; i < child.text.length; i++) {
        chars.push(child.text[i]);
        posMap.push(childDocStart + i);
      }
    } else {
      chars.push("\x00");
      posMap.push(null);
    }
  });

  return { text: chars.join(""), posMap };
}

// Detect whether the cursor is sitting inside (or just after) a $...$ or $$...$$ text region.
// Returns the doc range of the full delimiter pair and the captured latex.
//
// Handles four cursor positions relative to inline `$...$`:
//   A) cursor between $ and $:  $content|$   (closing $ in `after`)
//   B) cursor just after closing $: $content$|   (full pair in `before`)
// And the block `$$...$$` equivalents.
function getMathCtx(state: EditorState): MathCtx | null {
  const { from, empty } = state.selection;
  if (!empty) return null;

  const $from = state.doc.resolve(from);
  const parent = $from.parent;
  if (!["paragraph", "heading"].includes(parent.type.name)) return null;

  const { text, posMap } = buildTextMap(parent, $from.start());
  const cursorChar = from - $from.start();

  const before = text.slice(0, cursorChar);
  const after = text.slice(cursorChar);

  // ── Block math ────────────────────────────────────────────────────────────

  // A) cursor between $$ and $$
  const blockInside = /\$\$([^\x00$]*)$/.exec(before);
  if (blockInside && after.startsWith("$$")) {
    const openPos = posMap[blockInside.index];
    const closePos = posMap[cursorChar + 1];
    if (openPos === null || closePos === null) return null;
    return { display: true, latex: blockInside[1], docFrom: openPos, docTo: closePos + 1 };
  }

  // B) cursor just after closing $$
  const blockAfter = /\$\$([^\x00$]*)\$\$$/.exec(before);
  if (blockAfter && !after.startsWith("$")) {
    const openPos = posMap[blockAfter.index];
    const closePos = posMap[cursorChar - 1]; // last $ of the closing $$
    if (openPos === null || closePos === null) return null;
    return { display: true, latex: blockAfter[1], docFrom: openPos, docTo: closePos + 1 };
  }

  // ── Inline math ───────────────────────────────────────────────────────────

  // A) cursor between $ and $
  const inlineInside = /(?<!\$)\$(?!\$)([^\x00$]*)$/.exec(before);
  if (inlineInside && /^\$(?!\$)/.test(after)) {
    const openPos = posMap[inlineInside.index];
    const closePos = posMap[cursorChar];
    if (openPos === null || closePos === null) return null;
    return { display: false, latex: inlineInside[1], docFrom: openPos, docTo: closePos + 1 };
  }

  // B) cursor just after closing $
  const inlineAfter = /(?<!\$)\$(?!\$)([^\x00$]+)\$(?!\$)$/.exec(before);
  if (inlineAfter && !after.startsWith("$")) {
    const openPos = posMap[inlineAfter.index];
    const closePos = posMap[cursorChar - 1]; // the closing $
    if (openPos === null || closePos === null) return null;
    return { display: false, latex: inlineAfter[1], docFrom: openPos, docTo: closePos + 1 };
  }

  return null;
}

// Convert a $...$ or $$...$$ text region to an inlineMath node.
// If latex is empty, just delete the delimiters.
function commitMath(editor: Editor, ctx: MathCtx): boolean {
  if (!ctx.latex.trim()) {
    return editor.chain().focus().deleteRange({ from: ctx.docFrom, to: ctx.docTo }).run();
  }
  return editor
    .chain()
    .focus()
    .deleteRange({ from: ctx.docFrom, to: ctx.docTo })
    .insertContentAt(ctx.docFrom, {
      type: "inlineMath",
      attrs: { latex: ctx.latex.trim(), evaluate: "no", display: ctx.display ? "yes" : "no" },
    })
    .run();
}

export const KeyboardShortcuts = Extension.create({
  name: "keyboardShortcuts",

  addKeyboardShortcuts() {
    const setPromptedLink = () => {
      const previousHref = this.editor.getAttributes("link").href as string | undefined;
      const href = window.prompt("URL:", previousHref ?? "");
      if (href === null) return true;
      if (!href.trim()) return this.editor.chain().focus().unsetLink().run();
      return this.editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
    };

    // Insert $|$ with cursor between the two signs. If already inside $...$, commit it.
    const commitOrInsertInline = () => {
      const ctx = getMathCtx(this.editor.state);
      if (ctx) return commitMath(this.editor, ctx);
      const pos = this.editor.state.selection.from;
      return this.editor.chain().focus().insertContent("$$").setTextSelection(pos + 1).run();
    };

    // Insert $$|$$ with cursor between the two pairs. If already inside $$...$$, commit it.
    const commitOrInsertDisplay = () => {
      const ctx = getMathCtx(this.editor.state);
      if (ctx) return commitMath(this.editor, ctx);
      const pos = this.editor.state.selection.from;
      return this.editor.chain().focus().insertContent("$$$$").setTextSelection(pos + 2).run();
    };

    const toggleCenterAlign = () => {
      if (this.editor.isActive({ textAlign: "center" })) {
        return this.editor.chain().focus().unsetTextAlign().run();
      }
      return this.editor.chain().focus().setTextAlign("center").run();
    };

    return {
      "Mod-Shift-k": setPromptedLink,
      "Mod-e": toggleCenterAlign,
      "Mod-Alt-e": () => this.editor.chain().focus().toggleCode().run(),
      "Mod-Alt-c": () => this.editor.chain().focus().toggleCodeBlock().run(),
      // Press once → inserts $|$. Press again (or Escape) while inside → commits to rendered math.
      "Mod-Alt-m": commitOrInsertInline,
      // Press once → inserts $$|$$. Press again (or Escape) while inside → commits.
      "Mod-Alt-M": commitOrInsertDisplay,
      "Mod-Alt-Shift-m": commitOrInsertDisplay,
      // Escape commits $...$ or $$...$$ to a rendered math node — cursor stays on same line.
      Escape: () => {
        const ctx = getMathCtx(this.editor.state);
        if (!ctx) return false;
        return commitMath(this.editor, ctx);
      },
      // Enter commits and then splits the block (normal Enter behaviour after committing).
      Enter: () => {
        const ctx = getMathCtx(this.editor.state);
        if (!ctx) return false;
        const ok = commitMath(this.editor, ctx);
        if (ok) this.editor.commands.splitBlock();
        return ok;
      },
      "Mod-Shift-7": () => this.editor.chain().focus().toggleOrderedList().run(),
      "Mod-Shift-8": () => this.editor.chain().focus().toggleBulletList().run(),
      "Mod-Shift-9": () => this.editor.chain().focus().toggleBlockquote().run(),
      "Mod-Alt-1": () => this.editor.chain().focus().toggleHeading({ level: 1 }).run(),
      "Mod-Alt-2": () => this.editor.chain().focus().toggleHeading({ level: 2 }).run(),
      "Mod-Alt-3": () => this.editor.chain().focus().toggleHeading({ level: 3 }).run(),
      "Mod-Alt-4": () => this.editor.chain().focus().toggleHeading({ level: 4 }).run(),
      "Mod-Alt-5": () => this.editor.chain().focus().toggleHeading({ level: 5 }).run(),
      "Mod-Alt-6": () => this.editor.chain().focus().toggleHeading({ level: 6 }).run(),
      "Mod-L": () => this.editor.chain().focus().setTextAlign("left").run(),
      "Mod-R": () => this.editor.chain().focus().setTextAlign("right").run(),
      "Mod-J": () => this.editor.chain().focus().setTextAlign("justify").run(),
    };
  },
});
