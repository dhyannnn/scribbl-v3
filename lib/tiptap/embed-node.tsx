"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import React from "react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embedNode: {
      insertEmbed: (attrs: { src: string; title?: string; provider?: string }) => ReturnType;
    };
  }
}

const ALLOWED_ORIGINS = [
  "youtube.com", "www.youtube.com", "youtu.be",
  "loom.com", "www.loom.com",
  "figma.com", "www.figma.com",
];

export function toEmbedUrl(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }

  const host = url.hostname.replace(/^www\./, "");

  if (!ALLOWED_ORIGINS.some((o) => url.hostname === o || url.hostname === o.replace(/^www\./, ""))) {
    return null;
  }

  // YouTube: convert watch?v= and youtu.be to embed URL
  if (host === "youtube.com" || host === "youtu.be") {
    const videoId = host === "youtu.be"
      ? url.pathname.slice(1)
      : url.searchParams.get("v");
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}`;
  }

  return raw;
}

function EmbedView({ node }: { node: { attrs: { src: string; title: string; provider: string } } }) {
  return (
    <NodeViewWrapper>
      <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
            {node.attrs.provider || "Embed"}
          </span>
          <a
            href={node.attrs.src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--color-secondary)] hover:underline"
          >
            Open ↗
          </a>
        </div>
        <iframe
          src={node.attrs.src}
          title={node.attrs.title || "Embedded content"}
          allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture"
          className="h-64 w-full"
          style={{ border: 0 }}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const EmbedNode = Node.create({
  name: "embedNode",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src:      { default: "" },
      title:    { default: "" },
      provider: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-embed-src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-embed-src": HTMLAttributes.src as string })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },

  addCommands() {
    return {
      insertEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
