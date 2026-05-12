import { Extension, type CommandProps } from "@tiptap/core";

const minIndent = 0;
const maxIndent = 8;
const indentStepRem = 1.5;

function clampIndent(value: number) {
  return Math.min(maxIndent, Math.max(minIndent, value));
}

function parseIndent(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? clampIndent(parsed) : minIndent;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

export const Indent = Extension.create({
  name: "indent",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => parseIndent(element.getAttribute("data-indent")),
            renderHTML: (attributes) => {
              const indent = clampIndent(Number(attributes.indent) || 0);
              if (!indent) return {};
              return {
                "data-indent": String(indent),
                style: `padding-left: ${indent * indentStepRem}rem`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const updateIndent =
      (direction: 1 | -1) =>
      ({ dispatch, state }: CommandProps) => {
        const { selection, tr } = state;
        const positions: Array<{ pos: number; indent: number }> = [];

        const maybeAddNode = (pos: number) => {
          const node = tr.doc.nodeAt(pos);
          if (!node || !this.options.types.includes(node.type.name)) return;
          const currentIndent = clampIndent(Number(node.attrs.indent) || 0);
          const nextIndent = clampIndent(currentIndent + direction);
          if (nextIndent !== currentIndent) positions.push({ pos, indent: nextIndent });
        };

        if (selection.empty) {
          maybeAddNode(selection.$from.before(selection.$from.depth));
        } else {
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const currentIndent = clampIndent(Number(node.attrs.indent) || 0);
              const nextIndent = clampIndent(currentIndent + direction);
              if (nextIndent !== currentIndent) positions.push({ pos, indent: nextIndent });
            }
          });
        }

        if (!positions.length) return false;

        positions.forEach(({ pos, indent }) => {
          const node = tr.doc.nodeAt(pos);
          if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
        });

        if (dispatch) dispatch(tr);
        return true;
      };

    return {
      indent: () => updateIndent(1),
      outdent: () => updateIndent(-1),
    };
  },

  addKeyboardShortcuts() {
    const isInList = () =>
      this.editor.isActive("bulletList")
      || this.editor.isActive("orderedList")
      || this.editor.isActive("taskList");

    const backspaceOutdent = () => {
      const { selection } = this.editor.state;
      if (!selection.empty || selection.$from.parentOffset !== 0) return false;
      if (!this.options.types.includes(selection.$from.parent.type.name)) return false;

      const indent = clampIndent(Number(selection.$from.parent.attrs.indent) || 0);
      if (!indent) return false;
      return this.editor.commands.outdent();
    };

    return {
      Tab: () => (isInList() ? false : this.editor.commands.indent()),
      "Shift-Tab": () => (isInList() ? false : this.editor.commands.outdent()),
      Backspace: backspaceOutdent,
    };
  },
});
