# PostgreSQL Runtime Event Coordinator Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing PostgreSQL runtime event outbox into snapshot-change publication paths without enabling multi-instance mode.

**Architecture:** Keep `createSingleNodeOnlineRuntimeCoordinator` as the production default. Add a store-backed coordinator wrapper that records `game_snapshot_changed` routing metadata before invoking local process subscribers, then make the HTTP server publish action/timeout snapshot changes through the coordinator. Remote outbox polling, missed-event hydration, `LISTEN/NOTIFY`, and multi-instance deployment remain later item 11 slices.

**Tech Stack:** TypeScript, Vitest, Node HTTP/WebSocket server, existing PostgreSQL runtime event store interface.

---

### Task 1: Coordinator Outbox Wrapper

**Files:**
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`

- [x] **Step 1: Write failing tests**

Add a fake runtime event store to `onlineRuntimeCoordinator.test.ts`:

```ts
class FakeRuntimeEventStore {
  readonly events: Array<{
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: "action" | "timeout" | "visibility" | "challenge" | "open_seek" | "snapshot";
  }> = [];
  cleanupCalls = 0;

  async recordGameSnapshotChanged(event: {
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: "action" | "timeout" | "visibility" | "challenge" | "open_seek" | "snapshot";
  }) {
    this.events.push(event);
    return {
      id: this.events.length,
      type: "game_snapshot_changed" as const,
      ...event,
      nodeId: "node-a",
      createdAt: "2026-06-16T00:00:00.000Z",
    };
  }

  async cleanupRuntimeEventsBefore() {
    this.cleanupCalls += 1;
    return 0;
  }
}
```

Add tests:

```ts
describe("createPostgresRuntimeEventCoordinator", () => {
  it("records snapshot-change hints before local fanout", async () => {
    const runtimeEventStore = new FakeRuntimeEventStore();
    const coordinator = createPostgresRuntimeEventCoordinator({
      nodeId: "node-a",
      runtimeEventStore,
    });
    const seen: unknown[] = [];
    coordinator.subscribeGameSnapshotChanged((event) => seen.push(event));

    await coordinator.publishGameSnapshotChanged({
      type: "game_snapshot_changed",
      gameId: "game_123",
      roomVersion: 4,
      lastEventId: "event_4",
      reason: "action",
      nodeId: "node-a",
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    expect(runtimeEventStore.events).toEqual([
      { gameId: "game_123", roomVersion: 4, lastEventId: "event_4", reason: "action" },
    ]);
    expect(seen).toHaveLength(1);
  });

  it("does not overclaim remote fanout or multi-instance readiness", () => {
    const coordinator = createPostgresRuntimeEventCoordinator({
      nodeId: "node-a",
      runtimeEventStore: new FakeRuntimeEventStore(),
    });

    expect(coordinator.capabilities).toEqual({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
    });
  });
});
```

- [x] **Step 2: Verify red**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "Postgres runtime event coordinator"
```

Expected: fail because `createPostgresRuntimeEventCoordinator` is not exported.

- [x] **Step 3: Implement minimal wrapper**

In `onlineRuntimeCoordinator.ts`, add:

```ts
export interface OnlineRuntimeEventStore {
  recordGameSnapshotChanged(input: {
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeSnapshotReason;
  }): Promise<unknown>;
  cleanupRuntimeEventsBefore?(cutoffIso: string): Promise<number>;
}

export function createPostgresRuntimeEventCoordinator(options: {
  nodeId: string;
  runtimeEventStore: OnlineRuntimeEventStore;
}): OnlineRuntimeCoordinator {
  const local = createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId });
  return {
    ...local,
    async publishGameSnapshotChanged(event) {
      await options.runtimeEventStore.recordGameSnapshotChanged({
        gameId: event.gameId,
        roomVersion: event.roomVersion,
        lastEventId: event.lastEventId,
        reason: event.reason,
      });
      await local.publishGameSnapshotChanged(event);
    },
  };
}
```

- [x] **Step 4: Verify green**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "Postgres runtime event coordinator"
```

Expected: pass.

### Task 2: HTTP Server Publishes Snapshot Changes

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Write failing test**

Add a focused test near existing runtime coordinator coverage:

```ts
it("publishes accepted action snapshot changes through the runtime coordinator", async () => {
  const published: unknown[] = [];
  const runtimeCoordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-action-publisher" });
  runtimeCoordinator.subscribeGameSnapshotChanged((event) => published.push(event));
  const service = new OnlineGameService({
    idFactory: () => "game_runtime_publish_action",
    tokenFactory: (seat) => `${seat}-token`,
    now: () => 1_700_000_000_000,
  });
  const { server } = createOnlineHttpServer({
    publicBaseUrl: "https://castles.example",
    service,
    runtimeCoordinator,
  });
  servers.push(server);
  const port = await listen(server);
  const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup: createSetup() }),
  });
  const created = await createResponse.json();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const joined = nextSocketMessage(socket);

  socket.on("open", () => {
    socket.send(JSON.stringify(versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })));
  });

  try {
    await expect(joined).resolves.toMatchObject({ type: "joined", snapshot: { version: 0 } });
    socket.send(
      JSON.stringify(
        versionedMessage({
          type: "action",
          clientActionId: "client-runtime-publish-action",
          action: { type: "PASS", baseVersion: 0 },
        })
      )
    );
    await expect(nextSocketMessage(socket, "accepted action snapshot")).resolves.toMatchObject({
      type: "snapshot",
      snapshot: { version: 1 },
    });
    expect(published).toEqual([
      expect.objectContaining({
        type: "game_snapshot_changed",
        gameId: created.gameId,
        roomVersion: 1,
        reason: "action",
        nodeId: "node-action-publisher",
      }),
    ]);
  } finally {
    socket.close();
  }
});
```

- [x] **Step 2: Verify red**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "publishes accepted action snapshot changes"
```

Expected: fail because local broadcasts do not publish coordinator snapshot events.

- [x] **Step 3: Implement minimal server publication**

Change `broadcastSnapshot(gameId)` into an async helper with optional `reason` and `lastEventId`:

```ts
const broadcastSnapshot = async (
  gameId: string,
  reason: OnlineRuntimeSnapshotReason = "snapshot",
  lastEventId?: string
) => {
  const room = service.getRoom(gameId);
  if (!room) return;
  disconnectStalePlayerSockets(gameId);
  const snapshot = room.getSnapshot();
  await runtimeCoordinator.publishGameSnapshotChanged({
    type: "game_snapshot_changed",
    gameId,
    roomVersion: snapshot.version,
    lastEventId,
    reason,
    nodeId: runtimeCoordinator.nodeId,
    createdAt: new Date(options.now?.() ?? Date.now()).toISOString(),
  });
  for (const [socket, connection] of connections) {
    if (connection.gameId === gameId) {
      sendJson(socket, { type: "snapshot", snapshot });
    }
  }
};
```

Update action and timeout call sites to `await broadcastSnapshot(gameId, "action", eventId)` or `await broadcastSnapshot(gameId, "timeout", eventId)` where event ids are available. Keep generic call sites as `await broadcastSnapshot(gameId)`.

- [x] **Step 4: Verify green**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "publishes accepted action snapshot changes"
```

Expected: pass.

### Task 3: Roadmap, Verification, Review, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`

- [x] **Step 1: Update roadmap**

Record that the PostgreSQL runtime event coordinator wiring sub-slice is done, with exact test/build evidence and explicit non-goals: no remote event consumption, no room hydration, no LISTEN/NOTIFY, no production multi-instance enablement.

- [x] **Step 2: Run verification**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime coordinator|runtime event|publishes accepted action snapshot changes|spectator|heartbeat"
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all commands exit 0. `npm run build` may repeat the known large-chunk warning.

- [x] **Step 3: Review**

Run a code review focused on whether publication happens after accepted durable changes, whether coordinator/store failure behavior is intentional, whether token hygiene is preserved, and whether capabilities avoid overclaiming multi-instance readiness. Classify findings as accept, reject, investigate, or defer before applying changes.

- [x] **Step 4: Commit and push**

Run:

```bash
git status --short
git add docs/superpowers/plans/2026-06-16-postgres-runtime-event-coordinator-wiring.md docs/online-multiplayer-plan.md src/online/server/onlineRuntimeCoordinator.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts
git commit -m "Wire runtime snapshot publication through coordinator"
git push origin HEAD:online-action-log
```
