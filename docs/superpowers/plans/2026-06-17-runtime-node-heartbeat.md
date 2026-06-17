# Runtime Node Heartbeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the production PostgreSQL runtime-node row fresh after startup so operators can distinguish a live node from a stale or draining node during rolling deploy readiness work.

**Architecture:** Add a `recordNodeHeartbeat()` method to the PostgreSQL runtime-node store that refreshes `last_seen_at` and `updated_at` with database time while preserving existing drain state. Add a server-side heartbeat scheduler that mirrors the existing runtime-event poller pattern: immediate tick, single-flight execution, bounded exponential backoff, sanitized error status, readiness degradation after repeated failures, and stop waits for in-flight work. Wire the scheduler into `server/index.ts` health and shutdown without enabling `CASTLES_DEPLOYMENT_MODE=multi-instance`.

**Tech Stack:** TypeScript, Vitest, PostgreSQL queryable seam, Express health JSON, existing runtime coordinator/store patterns.

---

### Task 1: PostgreSQL Runtime Node Store Heartbeat

**Files:**
- Modify: `src/online/server/PostgresOnlineRuntimeNodeStore.ts`
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Test: `src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts`

- [x] **Step 1: Write failing store tests**

Add tests proving:

```ts
it("records heartbeats with database time without clearing drain state", async () => {
  const queryable = new FakePostgresRuntimeNodeQueryable();
  queryable.seed({
    node_id: "node-a",
    first_seen_at: "2026-06-17T09:00:00.000Z",
    last_seen_at: "2026-06-17T09:05:00.000Z",
    draining: true,
    drain_started_at: "2026-06-17T09:10:00.000Z",
    updated_at: "2026-06-17T09:05:00.000Z",
  });
  queryable.databaseNowMs = Date.parse("2026-06-17T10:15:00.000Z");
  const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

  const state = await store.recordNodeHeartbeat();

  expect(state).toEqual({
    nodeId: "node-a",
    firstSeenAt: "2026-06-17T09:00:00.000Z",
    lastSeenAt: "2026-06-17T10:15:00.000Z",
    draining: true,
    drainStartedAt: "2026-06-17T09:10:00.000Z",
    updatedAt: "2026-06-17T10:15:00.000Z",
  });
});
```

Add a second test proving a heartbeat creates a missing row as non-draining with database timestamps.

- [x] **Step 2: Run store tests and verify RED**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts -t "heartbeat"
```

Expected: FAIL because `recordNodeHeartbeat` does not exist and the fake queryable has no heartbeat SQL branch.

- [x] **Step 3: Implement minimal store heartbeat**

Add `recordNodeHeartbeat?(): Promise<unknown>` to `OnlineRuntimeNodeStore`, add the concrete method on `PostgresOnlineRuntimeNodeStore`, and extend the fake queryable with the expected heartbeat `INSERT ... ON CONFLICT ... DO UPDATE SET last_seen_at = now(), updated_at = now()` branch.

- [x] **Step 4: Run store tests and verify GREEN**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts -t "heartbeat"
```

Expected: PASS.

### Task 2: Runtime Node Heartbeat Scheduler

**Files:**
- Create: `server/runtimeNodeHeartbeat.ts`
- Create: `server/__tests__/runtime-node-heartbeat.test.ts`

- [x] **Step 1: Write failing scheduler tests**

Cover:
- immediate heartbeat and normal interval repeat;
- no overlapping heartbeats while one is in flight;
- `stop()` waits for an in-flight heartbeat;
- bounded backoff and readiness false after repeated failures;
- credentialed database URLs and durable secrets are redacted from public status.

Use the same fake timer style as `server/__tests__/runtime-event-polling.test.ts`.

- [x] **Step 2: Run scheduler tests and verify RED**

Run:

```powershell
npx vitest run server/__tests__/runtime-node-heartbeat.test.ts
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the scheduler**

Export:

```ts
export interface RuntimeNodeHeartbeatStatus {
  running: boolean;
  ready: boolean;
  consecutiveFailures: number;
  lastHeartbeatAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
}

export interface RuntimeNodeHeartbeat {
  getStatus(): RuntimeNodeHeartbeatStatus;
  stop(): Promise<void>;
}

export function startRuntimeNodeHeartbeat(options: RuntimeNodeHeartbeatOptions): RuntimeNodeHeartbeat
```

The scheduler should call `runtimeNodeStore.recordNodeHeartbeat()`, never overlap calls, schedule immediately, back off after failures, sanitize public error strings, and stop cleanly.

- [x] **Step 4: Run scheduler tests and verify GREEN**

Run:

```powershell
npx vitest run server/__tests__/runtime-node-heartbeat.test.ts
```

Expected: PASS.

### Task 3: Production Startup, Health, And Shutdown Wiring

**Files:**
- Modify: `server/index.ts`
- Modify: `server/__tests__/server-index-runtime.test.ts`
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Write failing health and source-order tests**

Add source tests proving:
- `server/index.ts` imports and starts `startRuntimeNodeHeartbeat`;
- node startup is recorded before the heartbeat starts;
- heartbeat starts after HTTP server construction and before `server.listen`;
- shutdown and startup failure stop heartbeat before closing runtime coordinator/stores;
- runtime readiness combines event polling and heartbeat readiness.

Add a health test proving `/api/health` includes `online.runtime.nodeHeartbeat` and fails readiness when the runtime readiness hook returns false.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx vitest run server/__tests__/server-index-runtime.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "heartbeat|runtime readiness"
```

Expected: FAIL because heartbeat wiring/status does not exist.

- [x] **Step 3: Implement production wiring**

In `server/index.ts`, create constants:

```ts
const RUNTIME_NODE_HEARTBEAT_INTERVAL_MS = 5_000;
const RUNTIME_NODE_HEARTBEAT_MAX_BACKOFF_MS = 30_000;
const RUNTIME_NODE_HEARTBEAT_FAILURE_READINESS_THRESHOLD = 3;
```

Start the heartbeat after `createOnlineHttpServer(...)` and before `server.listen(...)`. Health readiness should return true only when both runtime-event polling and runtime-node heartbeat are ready. Stop heartbeat before stopping/closing runtime primitives during shutdown and startup failure.

In `createOnlineHttpServer.ts`, add `OnlineRuntimeNodeHeartbeatHealth`, accept `getRuntimeNodeHeartbeatStatus`, and include it under `online.runtime.nodeHeartbeat`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npx vitest run server/__tests__/runtime-node-heartbeat.test.ts server/__tests__/server-index-runtime.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "heartbeat|runtime readiness"
```

Expected: PASS.

### Task 4: Roadmap, Verification, Review, Commit, Push

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-17-runtime-node-heartbeat.md`

- [x] **Step 1: Update the roadmap with evidence**

Add a dated item 11 sub-slice note stating heartbeat scheduling is done, listing tests/builds/review evidence, and keeping `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.

- [x] **Step 2: Run verification**

Run:

```powershell
npx vitest run server/__tests__/runtime-node-heartbeat.test.ts server/__tests__/runtime-event-polling.test.ts server/__tests__/server-index-runtime.test.ts src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/serverRuntimeConfig.test.ts
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all commands exit 0. Existing Vite large-chunk warnings and CRLF conversion warnings are acceptable if unchanged.

- [x] **Step 3: Run code review and classify findings**

Review for:
- heartbeat clears drain state accidentally;
- scheduler stop returns before in-flight work;
- readiness reports false positives;
- health leaks secrets;
- startup/shutdown ordering leaves stores open or closed too early;
- multi-instance is accidentally enabled.

Classify findings as accept/reject/investigate/defer before edits.

Reviewer result: no issues found. Findings processed: accepted 0, rejected 0, investigate 0, deferred 0. No cognitive-ledger entry was required because no review finding was accepted or investigated.

- [x] **Step 4: Commit and push**

Run:

```powershell
git status -sb
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-runtime-node-heartbeat.md server/runtimeNodeHeartbeat.ts server/__tests__/runtime-node-heartbeat.test.ts server/index.ts server/__tests__/server-index-runtime.test.ts src/online/server/PostgresOnlineRuntimeNodeStore.ts src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/onlineRuntimeCoordinator.ts
git commit -m "Add runtime node heartbeat scheduler"
git push
```

Expected: pushed `master` remains aligned with `origin/master`.
