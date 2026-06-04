import { Extension, type CommandProps } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";

export interface SearchAndReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  results: Array<{ from: number; to: number }>;
  currentIndex: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      nextSearchResult: () => ReturnType;
      previousSearchResult: () => ReturnType;
      replaceCurrentResult: () => ReturnType;
      replaceAllResults: () => ReturnType;
    };
  }
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMatches(doc: PmNode, term: string): Array<{ from: number; to: number }> {
  if (!term) return [];
  const regex = new RegExp(escapeRegExp(term), "gi");
  const results: Array<{ from: number; to: number }> = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(node.text)) !== null) {
      results.push({ from: pos + match.index, to: pos + match.index + match[0].length });
    }
  });
  return results;
}

type PluginData = {
  searchTerm: string;
  replaceTerm: string;
  results: Array<{ from: number; to: number }>;
  currentIndex: number;
  decorations: DecorationSet;
};

const searchPluginKey = new PluginKey<PluginData>("searchAndReplace");

function buildDecos(doc: PmNode, results: Array<{ from: number; to: number }>, currentIndex: number): DecorationSet {
  if (!results.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    results.map((r, i) =>
      Decoration.inline(r.from, r.to, {
        class: i === currentIndex ? "search-result-current" : "search-result",
      }),
    ),
  );
}

export const SearchAndReplace = Extension.create<Record<string, never>, SearchAndReplaceStorage>({
  name: "searchAndReplace",

  addStorage(): SearchAndReplaceStorage {
    return { searchTerm: "", replaceTerm: "", results: [], currentIndex: 0 };
  },

  addCommands() {
    return {
      setSearchTerm: (term: string) => ({ tr, dispatch, editor }: CommandProps) => {
        const storage = (editor.storage as unknown as Record<string, unknown>).searchAndReplace as SearchAndReplaceStorage;
        const results = findMatches(editor.state.doc, term);
        tr.setMeta(searchPluginKey, { searchTerm: term, replaceTerm: storage.replaceTerm, results, currentIndex: 0 });
        if (dispatch) dispatch(tr);
        return true;
      },
      setReplaceTerm: (term: string) => ({ tr, dispatch, editor }: CommandProps) => {
        const storage = (editor.storage as unknown as Record<string, unknown>).searchAndReplace as SearchAndReplaceStorage;
        tr.setMeta(searchPluginKey, { searchTerm: storage.searchTerm, replaceTerm: term, results: storage.results, currentIndex: storage.currentIndex });
        if (dispatch) dispatch(tr);
        return true;
      },
      nextSearchResult: () => ({ tr, dispatch, editor }: CommandProps) => {
        const storage = (editor.storage as unknown as Record<string, unknown>).searchAndReplace as SearchAndReplaceStorage;
        if (!storage.results.length) return false;
        const next = (storage.currentIndex + 1) % storage.results.length;
        tr.setMeta(searchPluginKey, { searchTerm: storage.searchTerm, replaceTerm: storage.replaceTerm, results: storage.results, currentIndex: next });
        if (dispatch) dispatch(tr);
        return true;
      },
      previousSearchResult: () => ({ tr, dispatch, editor }: CommandProps) => {
        const storage = (editor.storage as unknown as Record<string, unknown>).searchAndReplace as SearchAndReplaceStorage;
        if (!storage.results.length) return false;
        const prev = (storage.currentIndex - 1 + storage.results.length) % storage.results.length;
        tr.setMeta(searchPluginKey, { searchTerm: storage.searchTerm, replaceTerm: storage.replaceTerm, results: storage.results, currentIndex: prev });
        if (dispatch) dispatch(tr);
        return true;
      },
      replaceCurrentResult: () => ({ tr, dispatch, editor }: CommandProps) => {
        const storage = (editor.storage as unknown as Record<string, unknown>).searchAndReplace as SearchAndReplaceStorage;
        if (!storage.results.length) return false;
        const match = storage.results[storage.currentIndex];
        if (!match) return false;
        tr.insertText(storage.replaceTerm, match.from, match.to);
        if (dispatch) dispatch(tr);
        return true;
      },
      replaceAllResults: () => ({ tr, dispatch, editor }: CommandProps) => {
        const storage = (editor.storage as unknown as Record<string, unknown>).searchAndReplace as SearchAndReplaceStorage;
        if (!storage.results.length) return false;
        // Replace from end to start to preserve positions
        const sorted = [...storage.results].sort((a, b) => b.from - a.from);
        for (const match of sorted) {
          tr.insertText(storage.replaceTerm, match.from, match.to);
        }
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage as SearchAndReplaceStorage;

    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init(): PluginData {
            return { searchTerm: "", replaceTerm: "", results: [], currentIndex: 0, decorations: DecorationSet.empty };
          },
          apply(tr, prev): PluginData {
            const meta = tr.getMeta(searchPluginKey) as Omit<PluginData, "decorations"> | undefined;
            let next: PluginData;

            if (meta) {
              next = { ...meta, decorations: buildDecos(tr.doc, meta.results, meta.currentIndex) };
            } else if (tr.docChanged && prev.searchTerm) {
              const results = findMatches(tr.doc, prev.searchTerm);
              const currentIndex = Math.min(prev.currentIndex, Math.max(0, results.length - 1));
              next = { ...prev, results, currentIndex, decorations: buildDecos(tr.doc, results, currentIndex) };
            } else {
              next = prev;
            }

            storage.searchTerm = next.searchTerm;
            storage.replaceTerm = next.replaceTerm;
            storage.results = next.results;
            storage.currentIndex = next.currentIndex;

            return next;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
