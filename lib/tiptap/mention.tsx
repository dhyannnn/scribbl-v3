"use client";

import { createRoot, type Root } from "react-dom/client";
import React from "react";
import MentionExtension from "@tiptap/extension-mention";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

export type MentionMember = {
  id: string;
  name: string;
};

function filterMembers(members: MentionMember[], query: string): MentionMember[] {
  const q = query.toLowerCase().trim();
  if (!q) return members.slice(0, 8);
  return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
}

type MenuProps = {
  items: MentionMember[];
  selectedIndex: number;
  onSelect: (member: MentionMember) => void;
  position: { top: number; left: number };
};

function MentionMenu({ items, selectedIndex, onSelect, position }: MenuProps) {
  if (items.length === 0) return null;

  return (
    <div style={{ position: "fixed", top: position.top, left: position.left, zIndex: 9999 }}>
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
          minWidth: "200px",
          maxWidth: "260px",
          overflow: "hidden",
          padding: "4px",
        }}
      >
        {items.map((member, i) => (
          <button
            key={member.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(member);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
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
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: i === selectedIndex ? "rgba(255,255,255,0.25)" : "var(--color-surface-mid)",
                fontSize: "11px",
                fontWeight: 700,
                flexShrink: 0,
                color: i === selectedIndex ? "white" : "var(--color-secondary)",
              }}
            >
              {member.name[0]?.toUpperCase()}
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {member.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function computePosition(props: SuggestionProps): { top: number; left: number } {
  const { decorationNode } = props;
  if (decorationNode) {
    const rect = decorationNode.getBoundingClientRect();
    const MENU_H = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= MENU_H + 8 ? rect.bottom + 4 : rect.top - Math.min(MENU_H, MENU_H + 8);
    return { top, left: Math.min(rect.left, window.innerWidth - 280) };
  }
  return { top: 200, left: 200 };
}

class MentionMenuPopup {
  private container: HTMLDivElement;
  private root: Root;
  private state: {
    items: MentionMember[];
    selectedIndex: number;
    position: { top: number; left: number };
    command: (member: MentionMember) => void;
  };

  constructor(props: SuggestionProps) {
    this.container = document.createElement("div");
    document.body.appendChild(this.container);
    this.root = createRoot(this.container);
    this.state = {
      items: props.items as MentionMember[],
      selectedIndex: 0,
      position: computePosition(props),
      command: (member) => props.command({ id: member.id, label: member.name }),
    };
    this.render();
  }

  update(props: SuggestionProps) {
    this.state = {
      ...this.state,
      items: props.items as MentionMember[],
      selectedIndex: 0,
      position: computePosition(props),
      command: (member) => props.command({ id: member.id, label: member.name }),
    };
    this.render();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const { items, selectedIndex } = this.state;
    if (items.length === 0) return false;

    if (event.key === "ArrowDown") {
      this.state = { ...this.state, selectedIndex: (selectedIndex + 1) % items.length };
      this.render();
      return true;
    }
    if (event.key === "ArrowUp") {
      this.state = { ...this.state, selectedIndex: (selectedIndex - 1 + items.length) % items.length };
      this.render();
      return true;
    }
    if (event.key === "Enter") {
      const member = items[selectedIndex];
      if (member) { this.state.command(member); return true; }
    }
    return false;
  }

  private render() {
    const { items, selectedIndex, position, command } = this.state;
    this.root.render(
      React.createElement(MentionMenu, { items, selectedIndex, position, onSelect: command }),
    );
  }

  destroy() {
    this.root.unmount();
    this.container.remove();
  }
}

export function buildMentionExtension(members: MentionMember[]) {
  return MentionExtension.configure({
    HTMLAttributes: {
      class: "scribbl-mention",
    },
    suggestion: {
      items: ({ query }) => filterMembers(members, query),
      render() {
        let popup: MentionMenuPopup | null = null;
        return {
          onStart(props: SuggestionProps) {
            popup = new MentionMenuPopup(props);
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
    },
  });
}
