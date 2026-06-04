import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    letterSpacing: {
      setLetterSpacing: (value: string) => ReturnType;
      unsetLetterSpacing: () => ReturnType;
      setWordSpacing: (value: string) => ReturnType;
      unsetWordSpacing: () => ReturnType;
    };
  }
}

export const LetterSpacing = Extension.create({
  name: "letterSpacing",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element) => (element as HTMLElement).style.letterSpacing || null,
            renderHTML: (attributes) => {
              if (!attributes.letterSpacing) return {};
              return { style: `letter-spacing: ${attributes.letterSpacing}` };
            },
          },
          wordSpacing: {
            default: null,
            parseHTML: (element) => (element as HTMLElement).style.wordSpacing || null,
            renderHTML: (attributes) => {
              if (!attributes.wordSpacing) return {};
              return { style: `word-spacing: ${attributes.wordSpacing}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLetterSpacing:
        (value: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { letterSpacing: value }).run(),
      unsetLetterSpacing:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { letterSpacing: null }).removeEmptyTextStyle().run(),
      setWordSpacing:
        (value: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { wordSpacing: value }).run(),
      unsetWordSpacing:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { wordSpacing: null }).removeEmptyTextStyle().run(),
    };
  },
});
