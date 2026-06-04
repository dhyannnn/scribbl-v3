"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embedNode: {
      insertEmbed: (attrs: { src: string; title?: string; provider?: string }) => ReturnType;
    };
  }
}

export { toEmbedUrl } from "@/lib/tiptap/embed-url";

function EmbedView({ node }: NodeViewProps) {
  const attrs = node.attrs as { src: string; title: string; provider: string };
  return (
    <NodeViewWrapper>
      <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
            {attrs.provider || "Embed"}
          </span>
          <a
            href={attrs.src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--color-secondary)] hover:underline"
          >
            Open ↗
          </a>
        </div>
        <iframe
          src={attrs.src}
          title={attrs.title || "Embedded content"}
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
