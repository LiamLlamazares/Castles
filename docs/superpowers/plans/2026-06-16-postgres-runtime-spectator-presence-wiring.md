# PostgreSQL Runtime Spectator Presence Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the PostgreSQL spectator-presence primitive into the runtime coordinator seam without enabling multi-instance deployment.

**Architecture:** Make presence expiry and live-count cutoffs database-clock authoritative, then add a coordinator factory that delegates only spectator registration, removal, counting, and cleanup to a PostgreSQL presence store. Snapshot fanout and operation gates remain process-local, and production `createConfiguredRuntimeCoordinator()` remains single-node for this slice.

**Tech Stack:** TypeScript, Vitest, PostgreSQL SQL through the existing lightweight `query(text, values)` pattern.

---

## Source Documents

- Approved design: `docs/superpowers/specs/2026-06-15-multi-instance-online-runtime-design.md`
- Roadmap: `docs/online-multiplayer-plan.md`
- Presence primitive: `src/online/server/PostgresOnlineSpectatorPresenceStore.ts`
- Runtime coordinator seam: `src/online/server/onlineRuntimeCoordinator.ts`
- Production coordinator factory: `server/runtimeCoordinator.ts`

## Scope

This slice advances item 11 only.

In scope:

- Resolve the deferred clock-skew review item by using PostgreSQL `now()` for live presence expiry, count cutoffs, and cleanup cutoffs.
- Add a `createPostgresSpectatorPresenceRuntimeCoordinator()` factory that keeps process-local fanout and gates but delegates spectator presence to a store.
- Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected and leave `server/runtimeCoordinator.ts` on `createSingleNodeOnlineRuntimeCoordinator()`.
- Update roadmap evidence and review decisions.

Out of scope:

- Do not add `LISTEN/NOTIFY`, outbox rows, cross-node snapshot fanout, room hydration, drain mode, shared rate limits, shared Quick Match gates, or two-instance smoke.
- Do not make PostgreSQL presence the production default yet.
- Do not change public client protocol or UI.

## File Structure

- Modify `src/online/server/PostgresOnlineSpectatorPresenceStore.ts`
  - Use PostgreSQL `now()` for expiry/count/cleanup SQL.
  - Remove the app-clock dependency from live presence decisions.
- Modify `src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts`
  - Update the fake queryable to simulate database time.
  - Add a regression proving app-clock skew does not affect expiry/count decisions.
- Modify `src/online/server/onlineRuntimeCoordinator.ts`
  - Add a small presence-store interface.
  - Add `createPostgresSpectatorPresenceRuntimeCoordinator()`.
  - Extend `OnlineRuntimeCoordinatorCapabilities.spectatorPresence` with `"postgres-live-presence"`.
- Modify `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`
  - Add tests proving PostgreSQL spectator presence is aggregated through a shared store while fanout/gates remain process-local.
- Modify `docs/online-multiplayer-plan.md`
  - Record the completed wiring sub-slice, verification, and remaining item 11 follow-up.

## Task 1: Database-Clock Presence Store

**Files:**
- Modify: `src/online/server/PostgresOnlineSpectatorPresenceStore.ts`
- Modify: `src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts`

- [x] **Step 1: Write the failing database-clock test**

Add a fake-queryable `databaseNowMs` field and a test named:

```ts
it("uses database time instead of app time for expiry and live cutoffs", async () => {
  const queryable = new FakePostgresSpectatorPresenceQueryable();
  queryable.databaseNowMs = Date.parse("2026-06-16T00:10:00.000Z");
  const store = new PostgresOnlineSpectatorPresenceStore({
    nodeId: "node-a",
    queryable,
    now: () => Date.parse("2030-01-01T00:00:00.000Z"),
    presenceTtlMs: 10_000,
    connectionIdFactory: () => "spectator_dbclock123",
  });

  const registered = await store.registerSpectator({ gameId: "game_123" });
  expect(registered.expiresAt).toBe("2026-06-16T00:10:10.000Z");
  expect(await store.countSpectators("game_123")).toBe(1);

  queryable.databaseNowMs = Date.parse("2026-06-16T00:10:11.000Z");
  expect(await store.countSpectators("game_123")).toBe(0);
  expect(await store.cleanupExpiredSpectators()).toBe(1);
});
```

Update the fake queryable only as much as needed for the test to compile. It should still fail because production SQL currently passes app-computed timestamps.

- [x] **Step 2: Verify red**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts -t "database time"
```

Expected: fail because registration expiry is based on the injected app clock.

- [x] **Step 3: Implement database-clock SQL**

Change the store so:

```ts
VALUES ($1, $2, $3, now() + ($4::int * interval '1 millisecond'), now())
```

is used for registration, refresh uses:

```ts
SET
  expires_at = now() + ($1::int * interval '1 millisecond'),
  updated_at = now()
```

and count/cleanup use:

```ts
expires_at > now()
expires_at <= now()
```

Remove the private `now`, `nextExpiryIso()`, and `nowIso()` members if they become unused. Keep `presenceTtlMs` validation.

- [x] **Step 4: Verify green**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts
```

Expected: pass.

## Task 2: PostgreSQL Spectator Presence Coordinator

**Files:**
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`

- [x] **Step 1: Write the failing coordinator test**

Add a fake shared presence store in `onlineRuntimeCoordinator.test.ts` and a test named:

```ts
it("delegates spectator presence to a shared PostgreSQL presence store", async () => {
  const presenceStore = new FakeRuntimeSpectatorPresenceStore();
  const nodeA = createPostgresSpectatorPresenceRuntimeCoordinator({
    nodeId: "node-a",
    spectatorPresenceStore: presenceStore.forNode("node-a"),
  });
  const nodeB = createPostgresSpectatorPresenceRuntimeCoordinator({
    nodeId: "node-b",
    spectatorPresenceStore: presenceStore.forNode("node-b"),
  });

  const first = await nodeA.registerSpectator({ gameId: "game_123" });
  const second = await nodeB.registerSpectator({ gameId: "game_123" });

  expect(nodeA.capabilities).toMatchObject({
    mode: "single-node",
    websocketFanout: "process-local",
    spectatorPresence: "postgres-live-presence",
    operationGates: "process-local",
  });
  expect(await nodeA.countSpectators("game_123")).toBe(2);
  await nodeA.removeSpectator({ gameId: "game_123", connectionId: first.connectionId });
  expect(await nodeB.countSpectators("game_123")).toBe(1);
  await nodeB.removeSpectator({ gameId: "game_123", connectionId: second.connectionId });
  expect(await nodeA.countSpectators("game_123")).toBe(0);
});
```

Also add a second test proving process-local fanout remains local:

```ts
it("keeps snapshot fanout local when only spectator presence is PostgreSQL-backed", async () => {
  const presenceStore = new FakeRuntimeSpectatorPresenceStore();
  const nodeA = createPostgresSpectatorPresenceRuntimeCoordinator({
    nodeId: "node-a",
    spectatorPresenceStore: presenceStore.forNode("node-a"),
  });
  const nodeB = createPostgresSpectatorPresenceRuntimeCoordinator({
    nodeId: "node-b",
    spectatorPresenceStore: presenceStore.forNode("node-b"),
  });
  const seenByB: unknown[] = [];
  nodeB.subscribeGameSnapshotChanged((event) => {
    seenByB.push(event);
  });

  await nodeA.publishGameSnapshotChanged({
    type: "game_snapshot_changed",
    gameId: "game_123",
    roomVersion: 2,
    reason: "action",
    nodeId: "node-a",
    createdAt: "2026-06-16T00:00:00.000Z",
  });

  expect(seenByB).toEqual([]);
});
```

- [x] **Step 2: Verify red**

Run:

```powershell
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "PostgreSQL presence|fanout local"
```

Expected: fail because `createPostgresSpectatorPresenceRuntimeCoordinator` does not exist.

- [x] **Step 3: Implement the coordinator factory**

In `onlineRuntimeCoordinator.ts`, add:

```ts
export interface OnlineRuntimeSpectatorPresenceStore {
  registerSpectator(input: { gameId: string }): Promise<OnlineRuntimeSpectatorRegistration>;
  removeSpectator(input: { gameId: string; connectionId: string }): Promise<void>;
  countSpectators(gameId: string): Promise<number>;
  cleanupExpiredSpectators?(): Promise<number>;
}
```

Extend capabilities:

```ts
spectatorPresence: "process-local" | "postgres-live-presence";
```

Add:

```ts
export function createPostgresSpectatorPresenceRuntimeCoordinator(options: {
  nodeId: string;
  spectatorPresenceStore: OnlineRuntimeSpectatorPresenceStore;
}): OnlineRuntimeCoordinator {
  const local = createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId });
  return {
    ...local,
    capabilities: {
      ...local.capabilities,
      spectatorPresence: "postgres-live-presence",
    },
    async registerSpectator(input) {
      return options.spectatorPresenceStore.registerSpectator(input);
    },
    async removeSpectator(input) {
      await options.spectatorPresenceStore.removeSpectator(input);
    },
    async countSpectators(gameId) {
      return options.spectatorPresenceStore.countSpectators(gameId);
    },
    async close() {
      await local.close();
      await options.spectatorPresenceStore.cleanupExpiredSpectators?.();
    },
  };
}
```

- [x] **Step 4: Verify green**

Run:

```powershell
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
```

Expected: pass.

## Task 3: Roadmap, Review, Verification, Push

**Files:**
- Modify: `docs/online-multiplayer-plan.md`

- [x] **Step 1: Add roadmap evidence**

Record that PostgreSQL-backed spectator presence can now be used through the runtime coordinator seam, with PostgreSQL-authoritative clock semantics, while production remains configured for single-node and multi-instance mode remains rejected.

- [x] **Step 2: Run verification**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "spectator|runtime coordinator|PostgresOnlineSpectatorPresenceStore|PostgreSQL presence|fanout local"
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all pass. Existing Vite large-chunk warnings are acceptable if unchanged.

- [x] **Step 3: Review**

Review scope:

```text
Review the PostgreSQL spectator-presence runtime wiring. Focus on whether DB time really resolves clock skew for live counts, whether the coordinator capabilities avoid overclaiming full multi-instance readiness, whether close/cleanup behavior is safe, and whether production remains single-node.
```

Classify findings as `accept`, `reject`, `investigate`, or `defer`.

Review dispositions:

| Finding | Severity | Decision | Action |
|---|---|---|---|
| `"postgres-live-presence"` overstated liveness because the coordinator/HTTP path registered spectators but did not refresh them. | major | accept | Added `refreshSpectator()` to the runtime coordinator contract, delegated it to the PostgreSQL presence store, and refreshed spectator presence on WebSocket `ping`, with re-registration if the TTL row disappeared. |
| Shutdown close/removal can leave stale presence rows until TTL if fire-and-forget socket removal races process shutdown. | minor | defer | TTL staleness is acceptable for this unwired primitive; node-scoped shutdown cleanup belongs with drain/shutdown work. |
| Database-clock proof is partly fake-queryable based. | minor | investigate | SQL now uses PostgreSQL `now()` for register/refresh/count/cleanup and tests assert app-clock skew is ignored. A real PostgreSQL DDL/time check remains for the two-instance/local-smoke slice. |

Additional review-driven verification:

```powershell
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "refreshes spectator presence"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime coordinator to decorate public game summaries"
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "spectator|runtime coordinator|PostgresOnlineSpectatorPresenceStore|PostgreSQL presence|fanout local|heartbeat"
```

- [x] **Step 4: Commit and push**

Run:

```powershell
git add src/online/server/PostgresOnlineSpectatorPresenceStore.ts src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts src/online/server/onlineRuntimeCoordinator.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-postgres-runtime-spectator-presence-wiring.md
git commit -m "Wire PostgreSQL spectator presence coordinator"
git push origin online-qa-closure:online-action-log
```

## Plan Self-Review

- Spec coverage: this implements rollout step 3's live spectator presence wiring only. It does not implement fanout, outbox, room hydration, shared gates, drain, monitoring metadata, or two-instance tests.
- Placeholder scan: no placeholder tasks are intended; every code-changing task has a concrete failing test and verification command.
- Type consistency: `createPostgresSpectatorPresenceRuntimeCoordinator`, `OnlineRuntimeSpectatorPresenceStore`, and `"postgres-live-presence"` are the canonical names for this slice.
