# Quick Match Shared Session Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance item 11 by adding a PostgreSQL-backed shared Quick Match session gate and routing Quick Match through the runtime coordinator gate instead of the server-local queue.

**Architecture:** Quick Match spans active-owned-seek checks, candidate acceptance, and fallback open-seek creation, so the shared gate must wrap the whole flow. The coordinator exposes a Quick Match session gate seam; the single-node coordinator preserves process-local behavior, and a PostgreSQL operation-gate store holds a row lock on one transaction client while the operation runs. This is a partial shared-operation-gate slice only; it does not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`.

**Tech Stack:** TypeScript, Vitest, Express HTTP server tests, PostgreSQL row locks through node-postgres-compatible queryables.

---

### Task 1: Coordinator Quick Match Gate Contract

Status: done on 2026-06-16.

**Files:**
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`

- [x] **Step 1: Write failing coordinator tests**

Add tests proving:

- `createSingleNodeOnlineRuntimeCoordinator().withQuickMatchSessionGate()` serializes concurrent work for the same normalized public session key.
- A PostgreSQL-backed coordinator wrapper delegates Quick Match gates to a store with scope `quick_match_session` and key equal to the normalized session key.
- The PostgreSQL-backed wrapper reports partial operation-gate capability without claiming full multi-instance readiness.

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "Quick Match session gate|operation gate"
```

Expected and observed before implementation: failed because `coordinator.withQuickMatchSessionGate` and `createPostgresOperationGateRuntimeCoordinator` did not exist.

- [x] **Step 2: Implement minimal coordinator seam**

Add:

```ts
export type OnlineRuntimeOperationGateScope = "quick_match_session";

export interface OnlineRuntimeOperationGateStore {
  withOperationGate<T>(
    input: { scope: OnlineRuntimeOperationGateScope; key: string },
    operation: () => Promise<T>
  ): Promise<T>;
}
```

Extend `OnlineRuntimeCoordinator` with:

```ts
withQuickMatchSessionGate<T>(sessionKey: string, operation: () => Promise<T>): Promise<T>;
```

Single-node implementation uses the same promise-chain pattern as `withGameOperationGate`, scoped by session key. Add `createPostgresOperationGateRuntimeCoordinator({ nodeId, operationGateStore })`, which delegates `withQuickMatchSessionGate()` to the store with `{ scope: "quick_match_session", key: sessionKey }` and reports `operationGates: "postgres-quick-match-session"`.

- [x] **Step 3: Verify coordinator tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "Quick Match session gate|operation gate"
```

Observed after implementation: 3 matching tests passed.

### Task 2: PostgreSQL Operation Gate Store

Status: done on 2026-06-16.

**Files:**
- Create: `src/online/server/PostgresOnlineOperationGateStore.ts`
- Create: `src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts`

- [x] **Step 1: Write failing PostgreSQL operation gate tests**

Add tests proving:

- The store creates `online_operation_locks` with primary key `(scope, lock_key)`.
- `withOperationGate({ scope: "quick_match_session", key }, operation)` uses one transaction client, runs `BEGIN`, upserts the lock row, selects it `FOR UPDATE`, runs the operation while the lock is held, commits, and releases the transaction client.
- Operation errors roll back and release the client.
- Invalid scope/key values are rejected, and key values containing durable secrets are rejected before persistence.

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts
```

Expected and observed before implementation: failed because `PostgresOnlineOperationGateStore` did not exist.

- [x] **Step 2: Implement the store**

Use a node-postgres-compatible `queryable` plus optional `transactionClientFactory`, mirroring `PostgresOnlineGameStore` transaction handling. With a `connectionString`, create a `Pool` and set `transactionClientFactory = () => pool.connect()`. With a provided `queryable`, use the provided `transactionClientFactory` when available; otherwise treat the queryable as a dedicated transaction-capable client for tests.

`withOperationGate()` sequence:

```sql
BEGIN;
INSERT INTO online_operation_locks (scope, lock_key, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (scope, lock_key) DO UPDATE SET updated_at = now();
SELECT scope, lock_key FROM online_operation_locks
WHERE scope = $1 AND lock_key = $2
FOR UPDATE;
-- run operation
COMMIT;
```

On error, run `ROLLBACK`; if rollback also fails, throw an `AggregateError`. Always release a transaction client.

- [x] **Step 3: Verify store tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts
```

Observed after implementation: 5 tests passed.

### Task 3: Quick Match Route Wiring

Status: done on 2026-06-16.

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Write failing HTTP server test**

Add a test proving `POST /api/online/matchmaking/quick` runs the whole flow under `runtimeCoordinator.withQuickMatchSessionGate()` with key `session:<public-session-id>` or `account:<account-id>`, and that the active-seek check happens inside the gate before fallback open-seek creation.

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "Quick Match shared session gate"
```

Expected and observed before route wiring: failed because `withQuickMatchSessionGate` was never called.

- [x] **Step 2: Wire Quick Match to the coordinator**

Remove the route's direct dependency on `quickMatchSessionQueues` and `runQuickMatchForSession`. Use:

```ts
runtimeCoordinator.withQuickMatchSessionGate(
  publicPlayerIdentityQueueKey(sessionIdentity.identity),
  async () => { /* existing Quick Match flow */ }
)
```

Preserve existing rate limits, optional account resolution, active-seek checks before and after candidate matching, candidate filtering, open-seek acceptance behavior, fallback creation, response shapes, and error handling.

- [x] **Step 3: Verify HTTP route test passes**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "Quick Match shared session gate"
```

Observed after implementation: the matching test passed.

### Task 4: Review, Verification, Roadmap, Commit

Status: done on 2026-06-16 except commit/push, which is performed after this file and the roadmap are staged.

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-16-quick-match-shared-session-gate.md`

- [x] **Step 1: Review**

Run code review focused on:

- whether the shared gate holds one PostgreSQL lock for the whole Quick Match operation;
- whether the route re-checks active owned seeks under the gate before fallback creation;
- whether coordinator capabilities avoid overclaiming full shared gate coverage or multi-instance readiness;
- token/log hygiene for gate keys and stored rows;
- whether process-local behavior remains available for single-node mode without legacy fallback behavior.

Classify findings as accept, reject, investigate, or defer before applying changes.

Review dispositions:

- No blocking code issue found.
- Deferred: this slice intentionally covers only Quick Match session gates. Account challenge pair gates, remaining shared operation gate audit items, drain, startup ownership, rate-limit semantics, and two-instance tests remain item 11 follow-up work.
- No micro-reflection was appended because no accepted or investigated reusable mistake pattern was found.

- [x] **Step 2: Final verification**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "Quick Match session gate|operation gate"
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "Quick Match shared session gate"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

No browser screenshots are required unless user-visible UI behavior changes; this slice is backend/runtime routing and synchronization.

Observed verification:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "Quick Match session gate|operation gate"
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "Quick Match shared session gate"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

Results: focused coordinator tests passed with 3 matching tests; the PostgreSQL operation gate store passed 5 tests; the focused HTTP Quick Match gate regression passed; the broader affected suite passed 4 files and 284 tests; `npm run build` passed with the existing large-chunk warning only; `npm run server:build` passed; `npm run audit` found 0 vulnerabilities; `git diff --check` reported only CRLF conversion warnings.

- [x] **Step 3: Roadmap update**

Record the completed item 11 sub-slice in `docs/online-multiplayer-plan.md`, including exact commands, non-goals, and the next shared-runtime prerequisite.

- [x] **Step 4: Commit and push**

Run during final handoff:

```bash
git status --short
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-quick-match-shared-session-gate.md src/online/server/onlineRuntimeCoordinator.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/PostgresOnlineOperationGateStore.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts
git commit -m "Add Quick Match shared session gate"
git push origin HEAD:online-action-log
```
