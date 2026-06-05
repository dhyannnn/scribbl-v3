"use client";

import "katex/dist/katex.min.css";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeaderBase from "@tiptap/extension-table-header";
import TableCellBase from "@tiptap/extension-table-cell";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import MentionExtension from "@tiptap/extension-mention";
import { InlineMathNode } from "@aarkue/tiptap-math-extension";
import { FontSize } from "@/lib/tiptap/font-size";
import { LineHeight } from "@/lib/tiptap/line-height";
import { LetterSpacing } from "@/lib/tiptap/letter-spacing";
import { CommentMark } from "@/lib/tiptap/comment-mark";
import { EmbedNode } from "@/lib/tiptap/embed-node";
import { Indent } from "@/lib/tiptap/indent";

const MathNode = InlineMathNode.extend({ renderText() { return " "; } }).configure({ evaluation: false });

function tiptapContent(contentJson: unknown): object | null {
  const c = contentJson as Record<string, unknown> | null;
  if (c?.type === "tiptap" && c.content) return c.content as object;
  return null;
}

export function SharedNoteViewer({ contentJson }: { contentJson: unknown }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    content: tiptapContent(contentJson) ?? undefined,
    extensions: [
      StarterKit.configure({ link: false, underline: false, undoRedo: false }),
      Underline, TextStyle, Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      FontFamily, FontSize, LineHeight, LetterSpacing,
      Link.configure({ openOnClick: true }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: false }),
      TableRow, TableHeaderBase, TableCellBase,
      TaskList, TaskItem.configure({ nested: true }),
      CharacterCount, Subscript, Superscript, MathNode,
      CommentMark, EmbedNode, Indent,
      MentionExtension.configure({ suggestion: { items: () => [] } }),
    ],
  });

  return <EditorContent editor={editor} />;
}
