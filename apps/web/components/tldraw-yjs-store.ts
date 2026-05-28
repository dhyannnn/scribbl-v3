"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { liveblocksNow, logLiveblocksClientTiming } from "@/lib/liveblocks-timing";

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

  // Keep refs so the presence effect always uses the latest values without
  // re-running the sync effect when identity changes (e.g. on token refresh).
  const selfIdRef = useRef(selfId);
  const selfNameRef = useRef(selfName);
  useEffect(() => { selfIdRef.current = selfId; }, [selfId]);
  useEffect(() => { selfNameRef.current = selfName; }, [selfName]);

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

  // ── Sync effect (stable) ────────────────────────────────────────────────────
  // Sets up store↔Yjs bidirectional sync and remote-presence → store updates.
  // Does NOT depend on selfId/selfName so that a Liveblocks token refresh
  // (which briefly cycles those values) can't tear down and re-establish the
  // Yjs connection.
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const startedAt = liveblocksNow();
    // Unique object used as the Yjs transaction origin for changes we write.
    // Remote changes arrive with a different origin (null or the Liveblocks
    // provider object), so we can skip re-applying our own writes.
    const localTldrawOrigin = {};

    function getRemoteRecords() {
      const latestById = new Map<string, TLRecord>();
      for (const { key, val } of yStore.yarray.toJSON() as Array<{ key: string; val: TLRecord }>) {
        if (isSyncedDocumentRecord(val)) {
          latestById.set(key, val);
        }
      }
      return [...latestById.values()];
    }

    function removeLocalOnlyRecordsFromYjs() {
      const keysToDelete = (yStore.yarray.toJSON() as Array<{ key: string; val: TLRecord }>)
        .filter(({ val }) => !isSyncedDocumentRecord(val))
        .map(({ key }) => key);

      if (keysToDelete.length === 0) return;

      yDoc.transact(() => {
        for (const key of keysToDelete) {
          yStore.delete(key);
        }
      });
    }

    function applyRemoteRecords(records: TLRecord[]) {
      store.mergeRemoteChanges(() => {
        const remoteIds = new Set(records.map((r) => r.id));
        const toRemove = store
          .allRecords()
          .filter(isSyncedDocumentRecord)
          .map((r) => r.id)
          .filter((id) => !remoteIds.has(id));
        if (toRemove.length) store.remove(toRemove as TLRecord["id"][]);
        if (records.length) store.put(records);
      });
    }

    function handleSync() {
      logLiveblocksClientTiming(
        "Whiteboard Yjs sync",
        { room: room.id, alreadySynced: yProvider.synced, recordCount: yStore.yarray.length },
        liveblocksNow() - startedAt,
      );

      removeLocalOnlyRecordsFromYjs();

      // If Yjs already has records, they take precedence over the DB snapshot.
      // Otherwise push the local store state (which may contain the DB snapshot) into Yjs.
      if (yStore.yarray.length) {
        applyRemoteRecords(getRemoteRecords());
      } else {
        yDoc.transact(() => {
          for (const record of store.allRecords()) {
            if (isSyncedDocumentRecord(record)) {
              yStore.set(record.id, record);
            }
          }
        });
      }

      // tldraw → Yjs
      // source:"user" ensures we only forward user-initiated changes — remote
      // changes applied via mergeRemoteChanges have source:"remote" and are
      // already in Yjs, so we must not echo them back.
      unsubs.push(
        store.listen(
          ({ changes }) => {
            yDoc.transact(() => {
              Object.values(changes.added).forEach((r) => {
                if (isSyncedDocumentRecord(r)) yStore.set(r.id, r);
              });
              Object.values(changes.updated).forEach(([, r]) => {
                if (isSyncedDocumentRecord(r)) yStore.set(r.id, r);
              });
              Object.values(changes.removed).forEach((r) => {
                if (isSyncedDocumentRecord(r)) yStore.delete(r.id);
              });
            }, localTldrawOrigin);
          },
          { source: "user", scope: "document" },
        ),
      );

      // Yjs → tldraw
      // Use change.newValue directly — O(1) and guaranteed to be the value that
      // triggered this event. Calling yStore.get(id) instead iterates the whole
      // backing Y.Array (O(n)) and can return a stale entry during rapid updates,
      // which is the root cause of drawings not appearing for remote users.
      const handleYjsChange = (
        changes: Map<
          string,
          | { action: "delete"; oldValue: TLRecord }
          | { action: "update"; oldValue: TLRecord; newValue: TLRecord }
          | { action: "add"; newValue: TLRecord }
        >,
        transaction?: { origin?: unknown },
      ) => {
        // Skip changes we wrote ourselves.
        if (transaction?.origin === localTldrawOrigin) return;

        const toRemove: TLRecord["id"][] = [];
        const toPut: TLRecord[] = [];

        changes.forEach((change, id) => {
          if (change.action === "delete") {
            if (isSyncedDocumentRecord(change.oldValue)) {
              toRemove.push(id as TLRecord["id"]);
            }
          } else {
            // "add" | "update" — use newValue directly, not yStore.get(id)
            if (isSyncedDocumentRecord(change.newValue)) {
              toPut.push(change.newValue);
            }
          }
        });

        if (toRemove.length === 0 && toPut.length === 0) return;

        store.mergeRemoteChanges(() => {
          if (toRemove.length) store.remove(toRemove);
          if (toPut.length) store.put(toPut);
        });
      };

      yStore.on("change", handleYjsChange);
      unsubs.push(() => yStore.off("change", handleYjsChange));

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
  }, [yProvider, yDoc, store, yStore, room]);

  // ── Presence effect (reactive to identity) ──────────────────────────────────
  // Separate from sync so that identity changes (token refresh, profile update)
  // only restart presence — not the entire Yjs sync.
  useEffect(() => {
    const self = room.getSelf();
    // Liveblocks injects __yjs_clientid into presence via the Yjs provider.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yClientId = (self?.presence as any)?.__yjs_clientid;
    const presenceId = InstancePresenceRecordType.createId(yClientId);

    const userPreferences = computed("userPreferences", () => ({
      id: selfIdRef.current ?? "unknown",
      color: cursorColor(selfIdRef.current ?? "unknown"),
      name: selfNameRef.current,
    }));

    const presenceDerivation = createPresenceStateDerivation(userPreferences, presenceId)(store);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yProvider.awareness.setLocalStateField("presence", presenceDerivation.get() as any ?? null);

    const unsubPresence = react("sync presence", () => {
      const presence = presenceDerivation.get() ?? null;
      requestAnimationFrame(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yProvider.awareness.setLocalStateField("presence", presence as any);
      });
    });

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

    return () => {
      unsubPresence();
      yProvider.awareness.off("change", handleAwarenessUpdate);
    };
  }, [yProvider, store, selfId, selfName, room]);

  return storeWithStatus;
}

// Records that are shared across all collaborators via Yjs.
// Instance-scoped records (camera, instance, instance_page_state, pointer)
// are intentionally excluded — they are per-user and must not sync.
function isSyncedDocumentRecord(record: TLRecord | undefined): record is TLRecord {
  return (
    record?.typeName === "document" ||
    record?.typeName === "page" ||
    record?.typeName === "shape" ||
    record?.typeName === "asset" ||
    record?.typeName === "binding" // tldraw v3: required for arrow/connector sync
  );
}
