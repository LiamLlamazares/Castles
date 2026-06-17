# Runtime Node Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated operator-only runtime status diagnostic endpoint for the current runtime node without exposing node identity in public health or enabling multi-instance mode.

**Architecture:** Extend the runtime-node store/coordinator seam with a read-only current-node state method, then add `GET /api/online/admin/runtime/status` beside the existing operator drain route. The route uses the same hidden-admin and no-store behavior as drain, returns sanitized runtime state/capabilities/heartbeat/poller metadata, and never echoes operator reasons, tokens, database URLs, raw account ids, or private game data.

**Tech Stack:** TypeScript, Express, Vitest, existing `OnlineRuntimeCoordinator`, `PostgresOnlineRuntimeNodeStore`, and admin bearer route patterns.

---

### Task 1: Runtime Node State Store/Coordinator Read

**Files:**
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `src/online/server/PostgresOnlineRuntimeNodeStore.ts`
- Test: `src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts`
- Test: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`

- [x] **Step 1: Write failing store/coordinator tests**

Add tests that require:
- `PostgresOnlineRuntimeNodeStore.getNodeState()` returns the current node row with normalized ISO timestamps.
- `getNodeState()` returns `null` for a missing row.
- `createPostgresRuntimeNodeCoordinator(...).getRuntimeNodeState()` delegates to the runtime-node store.
- `createSingleNodeOnlineRuntimeCoordinator(...).getRuntimeNodeState()` returns `null`.

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node|node state|getRuntimeNodeState"
```

Expected: FAIL because the store and coordinator do not expose the node-state read yet.

- [x] **Step 2: Implement the minimal store/coordinator read**

Add a shared `OnlineRuntimeNodeState` interface to `onlineRuntimeCoordinator.ts`, add `getNodeState?()` to `OnlineRuntimeNodeStore`, and add `getRuntimeNodeState()` to `OnlineRuntimeCoordinator`.

Implementation requirements:
- Single-node coordinator returns `null`.
- PostgreSQL runtime-node wrapper delegates to `runtimeNodeStore.getNodeState?.() ?? null`.
- `PostgresOnlineRuntimeNodeStore.getNodeState()` uses the existing `online_runtime_nodes` row shape and returns `PostgresOnlineRuntimeNodeState | null`.
- `getDrainState()` may reuse `getNodeState()` as long as the missing-row behavior stays `{ draining: false }`.

- [x] **Step 3: Verify the store/coordinator green state**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node|node state|getRuntimeNodeState"
```

Expected: PASS.

Result: PASS. The red run failed on missing `store.getNodeState()` and `coordinator.getRuntimeNodeState()` APIs. The green run passed 6 focused store/coordinator tests.

### Task 2: Authenticated Runtime Status Endpoint

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Test: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Write failing admin-route tests**

Add tests that require:
- `GET /api/online/admin/runtime/status` returns the same hidden 404 shape as other admin runtime routes when no admin token is configured or auth is missing/wrong.
- With a configured admin bearer token, the route returns `protocolVersion`, `runtime.nodeId`, `runtime.capabilities`, `runtime.draining`, `runtime.drainStartedAt`, `runtime.node`, `runtime.eventPolling`, and `runtime.nodeHeartbeat`.
- The route sets no-store headers and `Vary: Authorization`.
- Store/runtime failures return sanitized JSON 503 and do not expose secret-bearing database URLs, table names, raw reason text, or tokens.

Run:

```powershell
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime status|operator runtime"
```

Expected: FAIL because `/api/online/admin/runtime/status` does not exist.

- [x] **Step 2: Implement the route**

Add `app.get("/api/online/admin/runtime/status", ...)` next to the existing drain route.

Implementation requirements:
- Use `setOnlineNoStoreHeaders(res)`.
- Resolve admin bearer before revealing route existence.
- Check `admin_read` rate limits with the same hidden-auth behavior as the drain route.
- On success, call `runtimeCoordinator.getDrainState()` and `runtimeCoordinator.getRuntimeNodeState()`.
- Return:

```ts
{
  protocolVersion: ONLINE_PROTOCOL_VERSION,
  runtime: {
    nodeId: runtimeCoordinator.nodeId,
    capabilities: runtimeCoordinator.capabilities,
    draining: drainState.draining,
    drainStartedAt: drainState.startedAt,
    node: nodeState,
    eventPolling: options.health?.getRuntimeEventPollingStatus?.(),
    nodeHeartbeat: options.health?.getRuntimeNodeHeartbeatStatus?.(),
  },
}
```

- Do not return `drainState.reason`.
- On failure, log a generic runtime-status failure and return `{ error: { code: "persistence_failed", message: "Runtime status could not be loaded." } }`.

- [x] **Step 3: Verify the admin route green state**

Run:

```powershell
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime status|operator runtime"
```

Expected: PASS.

Result: PASS. The red run failed because the missing route returned default HTML 404 instead of the hidden JSON admin shape. The green run passed 7 focused operator-runtime tests.

### Task 3: Verification, Review, Roadmap, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-17-runtime-node-diagnostics.md`

- [x] **Step 1: Run verification**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime node|node state|getRuntimeNodeState|runtime status|operator runtime"
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all commands exit 0. Existing Vite large-chunk warnings and CRLF conversion warnings are acceptable if unchanged.

Result: PASS on 2026-06-17 after review fix:
- `npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime node|node state|getRuntimeNodeState|runtime status|operator runtime"`: 3 files passed, 13 tests passed, 233 skipped.
- `npx vitest run`: 138 files passed, 1 skipped; 1657 tests passed, 3 skipped. The first full-suite run caught a `startDrain()` raw-row/refactored-state mismatch; the affected store suite and full suite passed after fixing that source contract. The final post-review full run emitted a post-success worker-termination warning for `HamburgerMenu.test.tsx` but exited 0.
- `npm run build`: passed with the existing Vite large-chunk warning.
- `npm run server:build`: passed.
- `npm run audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed with existing CRLF conversion warnings for touched files.

- [x] **Step 2: Run code review and classify findings**

Review for:
- public `/api/health` still not exposing node ids;
- admin route stays hidden unless admin bearer is configured and matched;
- runtime status failures are sanitized;
- no raw drain reasons, database URLs, table names, account ids, session ids, or tokens in responses;
- no accidental `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement.

Disposition:
- Accepted and fixed one major sanitization finding: successful runtime status responses could echo scheduler `lastError` text. The route now projects scheduler status through a response-specific helper that strips `lastError`, and the test seeds unsafe table-name/account-session/database-URL text to prove it is not returned.
- No issues found for public health node-id exposure, hidden admin auth behavior, no-store/Vary behavior, route-level 503 sanitization, read-only `getNodeState()` semantics, missing-row drain behavior, or accidental multi-instance enablement.

- [x] **Step 3: Update roadmap and commit**

Record the evidence in `docs/online-multiplayer-plan.md`, mark this plan complete, then commit and push:

```powershell
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-runtime-node-diagnostics.md src/online/server/onlineRuntimeCoordinator.ts src/online/server/PostgresOnlineRuntimeNodeStore.ts src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts
git commit -m "Add runtime node diagnostics"
git push
```
