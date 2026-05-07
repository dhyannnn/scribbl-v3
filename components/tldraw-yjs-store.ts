"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoom, useSelf } from "@liveblocks/react/suspense";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { YKeyValue } from "y-utility/y-keyvalue";
import {
  computed,
  createPresenceStateDerivation,
  createTLStore,
  defaultShapeUtils,
  InstancePresenceRecordType,
  react,
  type TLAnyShapeUtilConstructor,
  type TLInstancePresence,
  type TLRecord,
  type TLStoreWithStatus,
} from "tldraw";
import { cursorColor } from "@/lib/tiptap/liveblocks-cursors";

export function useTldrawYjsStore({
  shapeUtils = [],
  initialSnapshot,
}: {
  shapeUtils?: TLAnyShapeUtilConstructor[];
  initialSnapshot?: unknown;
} = {}) {
  const room = useRoom();
  const selfId = useSelf((me) => me.id);
  const selfName = useSelf((me) => {
    const info = me.info as { name?: string; email?: string } | undefined;
    return info?.name ?? info?.email ?? "Collaborator";
  });

  const { yDoc, yStore, yProvider } = useMemo(() => {
    const yProvider = getYjsProviderForRoom(room);
    const yDoc = yProvider.getYDoc();
    yDoc.gc = true;
    const yArr = yDoc.getArray<{ key: string; val: TLRecord }>("tl_records");
    const yStore = new YKeyValue(yArr);
    return { yDoc, yStore, yProvider };
  }, [room]);

  const [store] = useState(() => {
    const s = createTLStore({ shapeUtils: [...defaultShapeUtils, ...shapeUtils] });
    if (initialSnapshot) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        s.loadStoreSnapshot(initialSnapshot as any);
      } catch {
        // Invalid or incompatible snapshot — start with a blank board.
      }
    }
    return s;
  });

  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: "loading",
  });

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    function handleSync() {
      // If Yjs already has records, load them into the tldraw store (they take
      // precedence over the DB snapshot). Otherwise push the local store state
      // (which may contain the DB snapshot) into Yjs.
      if (yStore.yarray.length) {
        // mergeRemoteChanges avoids needing an editor context (unlike transact)
        // and marks these as source:'remote' so our store.listen won't re-sync them.
        store.mergeRemoteChanges(() => {
          store.clear();
          const records = yStore.yarray.toJSON().map(({ val }: { val: TLRecord }) => val);
          store.put(records);
        });
      } else {
        yDoc.transact(() => {
          for (const record of store.allRecords()) {
            yStore.set(record.id, record);
          }
        });
      }

      // tldraw → Yjs
      unsubs.push(
        store.listen(
          ({ changes }) => {
            yDoc.transact(() => {
              Object.values(changes.added).forEach((r) => yStore.set(r.id, r));
              Object.values(changes.updated).forEach(([, r]) => yStore.set(r.id, r));
              Object.values(changes.removed).forEach((r) => yStore.delete(r.id));
            });
          },
          { source: "user", scope: "document" },
        ),
      );

      // Yjs → tldraw
      // Note: we do NOT filter by transaction.local here. The @liveblocks/yjs
      // provider marks remote updates as local transactions, so that check would
      // silently discard all remote changes. Instead we rely on
      // store.mergeRemoteChanges tagging incoming records as source:'remote',
      // which our store.listen({ source:'user' }) already ignores — no loop risk.
      const handleYjsChange = (
        changes: Map<
          string,
          | { action: "delete"; oldValue: TLRecord }
          | { action: "update"; oldValue: TLRecord; newValue: TLRecord }
          | { action: "add"; newValue: TLRecord }
        >,
      ) => {
        const toRemove: TLRecord["id"][] = [];
        const toPut: TLRecord[] = [];
        changes.forEach((change, id) => {
          if (change.action === "delete") {
            toRemove.push(id as TLRecord["id"]);
          } else {
            const record = yStore.get(id);
            if (record) toPut.push(record);
          }
        });
        store.mergeRemoteChanges(() => {
          if (toRemove.length) store.remove(toRemove);
          if (toPut.length) store.put(toPut);
        });
      };
      yStore.on("change", handleYjsChange);
      unsubs.push(() => yStore.off("change", handleYjsChange));

      // Presence
      const userPreferences = computed("userPreferences", () => ({
        id: selfId ?? "unknown",
        color: cursorColor(selfId ?? "unknown"),
        name: selfName,
      }));

      const self = room.getSelf();
      // Liveblocks injects __yjs_clientid into presence via the Yjs provider.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yClientId = (self?.presence as any)?.__yjs_clientid;
      const presenceId = InstancePresenceRecordType.createId(yClientId);
      const presenceDerivation = createPresenceStateDerivation(userPreferences, presenceId)(store);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yProvider.awareness.setLocalStateField("presence", presenceDerivation.get() as any ?? null);

      unsubs.push(
        react("sync presence", () => {
          const presence = presenceDerivation.get() ?? null;
          requestAnimationFrame(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            yProvider.awareness.setLocalStateField("presence", presence as any);
          });
        }),
      );

      const handleAwarenessUpdate = ({
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => {
        const states = yProvider.awareness.getStates() as Map<
          number,
          { presence: TLInstancePresence }
        >;
        const toRemove: TLInstancePresence["id"][] = [];
        const toPut: TLInstancePresence[] = [];
        for (const clientId of [...added, ...updated]) {
          const state = states.get(clientId);
          if (state?.presence && state.presence.id !== presenceId) {
            toPut.push(state.presence);
          }
        }
        for (const clientId of removed) {
          toRemove.push(InstancePresenceRecordType.createId(clientId.toString()));
        }
        store.mergeRemoteChanges(() => {
          if (toRemove.length) store.remove(toRemove);
          if (toPut.length) store.put(toPut);
        });
      };
      yProvider.awareness.on("change", handleAwarenessUpdate);
      unsubs.push(() => yProvider.awareness.off("change", handleAwarenessUpdate));

      setStoreWithStatus({ store, status: "synced-remote", connectionStatus: "online" });
    }

    if (yProvider.synced) {
      handleSync();
    } else {
      yProvider.on("synced", handleSync);
      unsubs.push(() => yProvider.off("synced", handleSync));
    }

    return () => {
      unsubs.forEach((fn) => fn());
      unsubs.length = 0;
    };
  }, [yProvider, yDoc, store, yStore, selfId, selfName, room]);

  return storeWithStatus;
}
