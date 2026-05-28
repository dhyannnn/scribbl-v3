import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const CURSOR_COLORS = [
  "#2f604b", "#4a6fa5", "#8b4513", "#6a0dad",
  "#c0392b", "#e67e22", "#16a085", "#8e44ad",
];

export function cursorColor(id: string | number): string {
  const str = String(id);
  let hash = 0;
  for (const ch of str) hash = (hash << 5) - hash + ch.charCodeAt(0);
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export type CursorUser = {
  id: string | number;
  name: string;
  cursor: { from: number; to: number } | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    liveblocksСursors: {
      updateLiveblocksUsers: (users: CursorUser[]) => ReturnType;
    };
  }
}

const pluginKey = new PluginKey<DecorationSet>("liveblocksСursors");

export const LiveblocksCursors = Extension.create({
  name: "liveblocksСursors",

  addStorage() {
    return { users: [] as CursorUser[] };
  },

  addCommands() {
    return {
      updateLiveblocksUsers:
        (users: CursorUser[]) =>
        ({ dispatch, tr }) => {
          if (dispatch) dispatch(tr.setMeta(pluginKey, { users }));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, _prev, _old, newState) => {
            const meta = tr.getMeta(pluginKey) as { users: CursorUser[] } | undefined;
            if (!meta) return _prev;
            const maxPos = newState.doc.content.size;
            const decs = meta.users.flatMap((user) => {
              if (!user.cursor) return [];
              const pos = Math.max(0, Math.min(user.cursor.from, maxPos - 1));
              try {
                return [
                  Decoration.widget(
                    pos,
                    () => {
                      const color = cursorColor(user.id);
                      const caret = document.createElement("span");
                      caret.className = "collaboration-cursor__caret";
                      caret.style.cssText = `border-color: ${color}`;
                      const label = document.createElement("div");
                      label.className = "collaboration-cursor__label";
                      label.style.cssText = `background-color: ${color}`;
                      label.textContent = user.name;
                      caret.appendChild(label);
                      return caret;
                    },
                    { side: -1, key: String(user.id) },
                  ),
                ];
              } catch {
                return [];
              }
            });
            return DecorationSet.create(newState.doc, decs);
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
