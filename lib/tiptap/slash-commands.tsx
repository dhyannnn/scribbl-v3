"use client";

import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import { createRoot, type Root } from "react-dom/client";
import React from "react";

type Range = { from: number; to: number };

type SlashCommand = {
  title: string;
  description: string;
  icon: string;
  keywords: string[];
  // Receives editor + the trigger range so delete + insert happen in one transaction
  execute: (editor: SuggestionProps["editor"], range: Range) => void | Promise<void>;
};

const COMMANDS: SlashCommand[] = [
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: "H1",
    keywords: ["h1", "heading", "title", "big"],
    execute: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: "H2",
    keywords: ["h2", "heading", "subtitle"],
    execute: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: "H3",
    keywords: ["h3", "heading"],
    execute: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: "•",
    keywords: ["bullet", "list", "ul", "unordered"],
    execute: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    keywords: ["numbered", "ordered", "list", "ol", "number"],
    execute: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    title: "Code Block",
    description: "Multi-line code block",
    icon: "</>",
    keywords: ["code", "block", "pre", "mono"],
    execute: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    title: "Math",
    description: "Inline KaTeX math expression",
    icon: "∑",
    keywords: ["math", "latex", "equation", "formula", "katex"],
    execute: (e, r) => {
      // Delete trigger, insert $$, park cursor between the two dollar signs
      e.chain().focus().deleteRange(r).insertContent("$$").setTextSelection(r.from + 1).run();
    },
  },
  {
    title: "Table",
    description: "Insert a table",
    icon: "▦",
    keywords: ["table", "grid", "rows", "columns"],
    execute: (e, r) =>
      e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "Divider",
    description: "Horizontal rule / separator",
    icon: "—",
    keywords: ["divider", "hr", "horizontal", "rule", "separator", "line"],
    execute: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    title: "Quote",
    description: "Block quotation",
    icon: "❝",
    keywords: ["quote", "blockquote", "callout"],
    execute: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    title: "Embed",
    description: "Embed YouTube, Loom or Figma",
    icon: "▶",
    keywords: ["embed", "video", "youtube", "loom", "figma", "iframe"],
    execute: async (e, r) => {
      const url = window.prompt("Paste a YouTube, Loom, or Figma URL:");
      if (!url) return;
      const { fetchEmbedMeta } = await import("@/app/workspaces/[id]/notes/actions");
      const meta = await fetchEmbedMeta(url);
      if (!meta) { window.alert("That URL isn't supported. Allowed: YouTube, Loom, Figma."); return; }
      e.chain().focus().deleteRange(r).insertEmbed({ src: meta.embedUrl, title: meta.title, provider: meta.provider }).run();
    },
  },
];

function filterCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase().trim();
  if (!q) return COMMANDS;
  return COMMANDS.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.includes(q)),
  );
}

type MenuProps = {
  items: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  position: { top: number; left: number };
};

function SlashMenu({ items, selectedIndex, onSelect, position }: MenuProps) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
          minWidth: "220px",
          maxWidth: "280px",
          overflow: "hidden",
          padding: "4px",
        }}
      >
        {items.map((cmd, i) => (
          <button
            key={cmd.title}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              padding: "7px 10px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              textAlign: "left",
              background: i === selectedIndex ? "var(--color-secondary)" : "transparent",
              color: i === selectedIndex ? "white" : "var(--color-text)",
              transition: "background 80ms",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: i === selectedIndex ? "rgba(255,255,255,0.2)" : "var(--color-surface-mid)",
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: "11px",
                fontWeight: 700,
                flexShrink: 0,
                color: i === selectedIndex ? "white" : "var(--color-muted)",
              }}
            >
              {cmd.icon}
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  lineHeight: 1.2,
                }}
              >
                {cmd.title}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "11px",
                  opacity: 0.7,
                  marginTop: "1px",
                  lineHeight: 1.2,
                }}
              >
                {cmd.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

type PopupState = {
  items: SlashCommand[];
  selectedIndex: number;
  position: { top: number; left: number };
  command: (cmd: SlashCommand) => void;
};

function computePosition(props: SuggestionProps): { top: number; left: number } {
  const { decorationNode } = props;
  if (decorationNode) {
    const rect = decorationNode.getBoundingClientRect();
    const MENU_H = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= MENU_H + 8 ? rect.bottom + 4 : rect.top - Math.min(MENU_H, MENU_H + 8);
    return { top, left: Math.min(rect.left, window.innerWidth - 300) };
  }
  return { top: 200, left: 200 };
}

class SlashMenuPopup {
  private container: HTMLDivElement;
  private root: Root;
  private state: PopupState;
  private keyDownHandler: ((event: KeyboardEvent) => boolean) | null = null;

  constructor(props: SuggestionProps) {
    this.container = document.createElement("div");
    document.body.appendChild(this.container);
    this.root = createRoot(this.container);
    this.state = {
      items: props.items as SlashCommand[],
      selectedIndex: 0,
      position: computePosition(props),
      command: (cmd) => props.command({ item: cmd }),
    };
    this.keyDownHandler = this.handleKeyDown.bind(this);
    this.render();
  }

  update(props: SuggestionProps) {
    this.state = {
      ...this.state,
      items: props.items as SlashCommand[],
      selectedIndex: 0,
      position: computePosition(props),
      command: (cmd) => props.command({ item: cmd }),
    };
    this.render();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    return this.keyDownHandler?.(event) ?? false;
  }

  private handleKeyDown(event: KeyboardEvent): boolean {
    const { items, selectedIndex } = this.state;
    if (items.length === 0) return false;

    if (event.key === "ArrowDown") {
      this.state = { ...this.state, selectedIndex: (selectedIndex + 1) % items.length };
      this.render();
      return true;
    }
    if (event.key === "ArrowUp") {
      this.state = {
        ...this.state,
        selectedIndex: (selectedIndex - 1 + items.length) % items.length,
      };
      this.render();
      return true;
    }
    if (event.key === "Enter") {
      const cmd = items[selectedIndex];
      if (cmd) {
        this.state.command(cmd);
        return true;
      }
    }
    return false;
  }

  private render() {
    const { items, selectedIndex, position, command } = this.state;
    this.root.render(
      React.createElement(SlashMenu, { items, selectedIndex, position, onSelect: command }),
    );
  }

  destroy() {
    this.root.unmount();
    this.container.remove();
  }
}

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterCommands(query),

        command({ editor, range, props }) {
          const cmd = props.item as SlashCommand;
          void Promise.resolve(cmd.execute(editor, range));
        },

        render() {
          let popup: SlashMenuPopup | null = null;

          return {
            onStart(props: SuggestionProps) {
              popup = new SlashMenuPopup(props);
            },
            onUpdate(props: SuggestionProps) {
              popup?.update(props);
            },
            onKeyDown({ event }: SuggestionKeyDownProps) {
              if (event.key === "Escape") {
                popup?.destroy();
                popup = null;
                return true;
              }
              return popup?.onKeyDown(event) ?? false;
            },
            onExit() {
              popup?.destroy();
              popup = null;
            },
          };
        },
      }),
    ];
  },
});
