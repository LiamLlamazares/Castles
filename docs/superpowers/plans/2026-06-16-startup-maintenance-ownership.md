# Startup Maintenance Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Advance item 11 by giving production startup summary rebuilds shared PostgreSQL ownership so ordinary app nodes do not repeatedly run the expensive rebuild block for the same deployment.

**Architecture:** Add a small PostgreSQL startup-maintenance store that owns a named `(task_key, run_key)` maintenance row, runs the task once, marks it complete only after the operation succeeds, and lets later nodes skip the same completed deployment task. Route this through the online runtime coordinator, then wrap the production startup summary/challenge/open-seek rebuild block with that coordinator. This does not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`, does not add shared rate limits, and does not claim that all schema migration or cleanup ownership is closed.

**Tech Stack:** TypeScript, PostgreSQL operational tables, Vitest unit/source tests, production `server/index.ts` wiring.

---

### Task 1: PostgreSQL Startup-Maintenance Store

**Files:**
- Create: `src/online/server/PostgresOnlineStartupMaintenanceStore.ts`
- Create: `src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts`

- [x] **Step 1: Write failing store tests**

Add tests proving:

- `ensureSchema()` creates `online_startup_maintenance` with primary key `(task_key, run_key)`;
- the first `runStartupMaintenance({ taskKey, runKey, nodeId }, operation)` call runs the operation and marks the row complete;
- a later call for the same completed `(taskKey, runKey)` skips the operation;
- a failing operation rolls back and does not mark the task complete;
- task keys, run keys, and node ids reject empty, too-long, URL/token-looking, or unsafe values before persistence.

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts
```

Expected before implementation: fail because the module does not exist.

- [x] **Step 2: Implement the minimal store**

Create an interface-compatible store that:

- uses the same `pg.Pool` and `poolMaxPerStore` conventions as the other PostgreSQL online stores;
- validates `taskKey`, `runKey`, and `nodeId` using bounded non-secret strings;
- creates `online_startup_maintenance`;
- starts a transaction, inserts the row if absent, selects it `FOR UPDATE`, skips if `completed_at` is already set, otherwise runs the operation while holding the row lock, updates `completed_at = now()`, commits, and releases the client;
- rolls back and releases the client on operation failure;
- closes its pool through `close()`.

- [x] **Step 3: Verify store tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts
```

Expected after implementation: all startup-maintenance store tests pass.

### Task 2: Coordinator Startup-Maintenance Seam

**Files:**
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`
- Modify: `server/runtimeCoordinator.ts`
- Modify: `server/__tests__/runtime-coordinator.test.ts`

- [x] **Step 1: Write failing coordinator tests**

Add tests proving:

- the single-node coordinator exposes `runStartupMaintenance()` and reports `startupMaintenance: "process-local"`;
- process-local startup maintenance serializes the same task/run key but executes when called;
- a PostgreSQL-backed startup-maintenance coordinator delegates to the supplied store with the runtime node id and reports `startupMaintenance: "postgres-once-per-run"`;
- `createConfiguredRuntimeCoordinator(config, { startupMaintenanceStore })` wires the supplied PostgreSQL store without changing `mode: "single-node"` or overclaiming WebSocket fanout.

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts server/__tests__/runtime-coordinator.test.ts -t "startup maintenance|configured runtime coordinator"
```

Expected before implementation: fail because the coordinator contract has no startup-maintenance seam.

- [x] **Step 2: Implement coordinator seam and configured wiring**

Extend `OnlineRuntimeCoordinatorCapabilities` with:

```ts
startupMaintenance: "process-local" | "postgres-once-per-run";
```

Add:

```ts
export type OnlineRuntimeStartupMaintenanceResult<T> =
  | { status: "completed"; value: T }
  | { status: "already_completed" };

runStartupMaintenance<T>(
  input: { taskKey: string; runKey: string },
  operation: () => Promise<T>
): Promise<OnlineRuntimeStartupMaintenanceResult<T>>;
```

The single-node implementation validates and serializes by `${taskKey}\u0000${runKey}` and always runs the operation. Add `createPostgresStartupMaintenanceRuntimeCoordinator()` that delegates to a supplied startup-maintenance store with `nodeId`. Update `createConfiguredRuntimeCoordinator()` to wrap the single-node coordinator with the startup-maintenance store when one is supplied.

- [x] **Step 3: Verify coordinator tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts server/__tests__/runtime-coordinator.test.ts -t "startup maintenance|configured runtime coordinator"
```

Expected after implementation: matching coordinator tests pass.

### Task 3: Production Startup Rebuild Ownership

**Files:**
- Create: `server/startupMaintenance.ts`
- Create: `server/__tests__/startup-maintenance.test.ts`
- Modify: `server/index.ts`
- Modify: `server/__tests__/server-index-runtime.test.ts`

- [x] **Step 1: Write failing startup helper and source tests**

Add tests proving:

- `createStartupMaintenanceRunKey()` uses `commit:<40-char sha>` when a production commit exists;
- otherwise it uses `build:<buildId>` when available;
- otherwise it falls back to `node:<runtimeNodeId>` for local/dev runs;
- `runOnlineStartupMaintenance()` calls `runtimeCoordinator.runStartupMaintenance()` with task key `startup_summary_rebuilds` and runs `rebuildSummaries`, `rebuildChallengeSummaries`, and `rebuildOpenSeekSummaries` in that order only when the coordinator returns a completed operation;
- source-level `server/index.ts` wiring creates the runtime coordinator before the rebuild block and calls `runOnlineStartupMaintenance()` before `OnlineGameService.fromRecords(...)`.

Run:

```bash
npx vitest run server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts -t "startup maintenance|runtime coordinator"
```

Expected before implementation: fail because the helper and production wiring do not exist.

- [x] **Step 2: Implement helper and production wiring**

Create `server/startupMaintenance.ts` with:

- `ONLINE_STARTUP_SUMMARY_REBUILD_TASK_KEY = "startup_summary_rebuilds"`;
- `createStartupMaintenanceRunKey(config)`;
- `runOnlineStartupMaintenance({ config, runtimeCoordinator, store, onGameEventError, onChallengeEventError, onOpenSeekEventError })`.

In `server/index.ts`:

- destructure `startupMaintenanceStore` from `createOnlineGameStoreFromEnv()`;
- create `runtimeCoordinator = createConfiguredRuntimeCoordinator(config, { startupMaintenanceStore })` before the rebuild block;
- replace the three direct rebuild calls with `runOnlineStartupMaintenance(...)`;
- close `startupMaintenanceStore` through the existing startup-failure and shutdown cleanup paths.

- [x] **Step 3: Verify startup wiring tests pass**

Run:

```bash
npx vitest run server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts -t "startup maintenance|runtime coordinator"
```

Expected after implementation: matching startup tests pass.

### Task 4: Store Factory Wiring

**Files:**
- Modify: `src/online/server/createOnlineGameStore.ts`
- Modify: `src/online/server/__tests__/createOnlineGameStore.test.ts`

- [x] **Step 1: Write failing factory tests**

Add tests proving:

- `createOnlineGameStoreFromEnv()` returns a `startupMaintenanceStore`;
- the startup-maintenance store is constructed with the same validated `DATABASE_URL` and `POSTGRES_POOL_MAX_PER_STORE`;
- direct startup-maintenance store constructors use the same bounded default and reject unsafe explicit pool values.

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineGameStore.test.ts src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts -t "startup|pool max|PostgreSQL store"
```

Expected before implementation: fail because the factory has no startup-maintenance store.

- [x] **Step 2: Wire the factory**

Import and construct `PostgresOnlineStartupMaintenanceStore` in `createOnlineGameStoreFromEnv()`. Add it to `ConfiguredOnlineGameStore` and use the existing pool max parsing/validation.

- [x] **Step 3: Verify factory tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineGameStore.test.ts src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts -t "startup|pool max|PostgreSQL store"
```

Expected after implementation: matching factory tests pass.

### Task 5: Review, Verification, Roadmap, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-16-startup-maintenance-ownership.md`

- [x] **Step 1: Review**

Run code review focused on:

- whether the startup rebuild block is actually owned through the runtime coordinator before the server listens;
- whether completed startup maintenance skips repeated rebuilds for the same deployment run key;
- whether failed maintenance can be retried;
- whether operational tables store no tokens, session data, raw invite URLs, IPs, user agents, or account ids;
- whether capabilities avoid claiming full multi-instance readiness;
- whether the implementation deletes/replaces narrow legacy startup behavior instead of preserving duplicate direct rebuild paths.

Classify findings as accept, reject, investigate, or defer before applying changes.

- [x] **Step 2: Final verification**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts server/__tests__/runtime-coordinator.test.ts -t "startup maintenance|configured runtime coordinator"
npx vitest run server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts -t "startup maintenance|runtime coordinator"
npx vitest run src/online/server/__tests__/createOnlineGameStore.test.ts src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts -t "startup|pool max|PostgreSQL store"
npx vitest run src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineGameStore.test.ts server/__tests__/runtime-coordinator.test.ts server/__tests__/server-index-runtime.test.ts server/__tests__/startup-maintenance.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

No browser screenshots are required because this slice changes backend/runtime startup behavior with no user-facing layout change.

- [x] **Step 3: Roadmap update**

Record the completed item 11 sub-slice in `docs/online-multiplayer-plan.md`, including exact commands, non-goals, review dispositions, and the next shared-runtime prerequisite.

- [x] **Step 4: Commit and push**

Run:

```bash
git status --short
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-startup-maintenance-ownership.md server/index.ts server/runtimeCoordinator.ts server/startupMaintenance.ts server/__tests__/runtime-coordinator.test.ts server/__tests__/server-index-runtime.test.ts server/__tests__/startup-maintenance.test.ts src/online/server/createOnlineGameStore.ts src/online/server/onlineRuntimeCoordinator.ts src/online/server/PostgresOnlineStartupMaintenanceStore.ts src/online/server/__tests__/createOnlineGameStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts
git commit -m "Add startup maintenance ownership"
git push origin HEAD:online-action-log
```

## Execution Evidence

Status: implemented locally on 2026-06-16.

TDD red evidence:

- `npx vitest run src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts` failed because `PostgresOnlineStartupMaintenanceStore` did not exist.
- `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts server/__tests__/runtime-coordinator.test.ts -t "startup maintenance|configured runtime coordinator"` failed because `runStartupMaintenance()` and `createPostgresStartupMaintenanceRuntimeCoordinator()` did not exist.
- `npx vitest run server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts -t "startup maintenance|runtime coordinator"` failed because `server/startupMaintenance.ts` did not exist and `server/index.ts` still ran direct rebuilds.
- `npx vitest run src/online/server/__tests__/createOnlineGameStore.test.ts src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts -t "startup|pool max|PostgreSQL store"` failed because the startup-maintenance store/factory wiring did not exist.
- Review/local hardening red evidence: `npx vitest run src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts -t "invalid maintenance identifiers"` failed because `game_123` was accepted as a maintenance task key.
- Review lifecycle red evidence: `npx vitest run server/__tests__/check-config.test.ts -t "closes game"` failed because `checkServerConfiguration` was not exported and importing `check-config.ts` ran the script.

Green evidence before final full gates:

- `npx vitest run src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts` passed with 5 tests.
- `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts server/__tests__/runtime-coordinator.test.ts -t "startup maintenance|configured runtime coordinator"` passed with 4 matching tests.
- `npx vitest run server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts -t "startup maintenance|runtime coordinator"` passed with 6 tests.
- `npx vitest run src/online/server/__tests__/createOnlineGameStore.test.ts src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts -t "startup|pool max|PostgreSQL store"` passed with 8 matching tests.
- `npx vitest run src/online/server/__tests__/PostgresOnlineStartupMaintenanceStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineGameStore.test.ts server/__tests__/runtime-coordinator.test.ts server/__tests__/server-index-runtime.test.ts server/__tests__/startup-maintenance.test.ts server/__tests__/check-config.test.ts` passed with 7 files and 51 tests.
- Final full `npx vitest run` passed after review follow-up with 132 files passed, 1 skipped; 1568 tests passed, 3 skipped.
- `npm run build` passed with the existing Vite large-chunk warning.
- `npm run server:build` passed.
- `npm run audit` passed with 0 vulnerabilities.
- `git diff --check` passed with CRLF conversion warnings only.

Review dispositions:

| Finding | Severity | Decision | Action |
|---|---|---|---|
| `server/check-config.ts` created the new `startupMaintenanceStore` but closed only game/account stores. | minor | accept | Refactored `check-config.ts` into import-safe `checkServerConfiguration()` with injectable store factory and added a behavioral close-order test covering game, account, and startup-maintenance stores. |
| `server-index-runtime` production wiring coverage is source-order based. | minor | accept | Kept the source-order guard as a smoke test, but relied on behavioral helper tests for run-key, skip, and rebuild order; recorded the remaining limitation. |
| Retry-after-failure coverage asserted rollback but not a second successful retry. | minor | investigate/accept | Extended the failing-maintenance test to call the store again and prove the operation reruns and completes after rollback. |
| Maintenance identifiers could accept online entity-id-looking values such as `game_123`. | minor | accept | Added red/green lower-boundary rejection for online entity id prefixes before persistence. |

Micro-reflections were appended to the tracked `codex-research-skills` ledger for lifecycle drift and startup-maintenance test-boundary gaps.
