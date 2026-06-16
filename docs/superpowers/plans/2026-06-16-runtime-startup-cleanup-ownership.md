# Runtime Startup Cleanup Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance item 11 by running startup cleanup for PostgreSQL runtime operational tables under the existing once-per-run startup-maintenance lock.

**Architecture:** Add missing cleanup methods to the PostgreSQL operation-gate and rate-limit stores, then add a focused `runOnlineRuntimeTableCleanup(...)` helper beside the existing summary rebuild helper. Production startup should run this cleanup through the configured runtime coordinator before service creation, while `CASTLES_DEPLOYMENT_MODE=multi-instance` remains rejected.

**Tech Stack:** TypeScript, Vitest, existing PostgreSQL store fakes, `server/startupMaintenance.ts`, `server/index.ts`, `docs/online-multiplayer-plan.md`.

---

## Scope

- Add `PostgresOnlineOperationGateStore.cleanupOperationLocksBefore(cutoffIso)` for explicit cutoff cleanup and `cleanupOperationLocksOlderThan(retentionMs)` for DB-clock startup retention cleanup.
- Add `PostgresOnlineRateLimitStore.cleanupExpiredRateLimits()`.
- Add a startup-maintenance-owned runtime cleanup helper that calls:
  - `spectatorPresenceStore.cleanupExpiredSpectators()`
  - `runtimeEventStore.cleanupRuntimeEventsOlderThan(retentionMs)`
  - `operationGateStore.cleanupOperationLocksOlderThan(retentionMs)`
  - `rateLimitStore.cleanupExpiredRateLimits()`
- Wire production startup to call the helper after summary rebuild maintenance and before `OnlineGameService.fromRecords(...)`.
- Record exact verification and review dispositions here and in `docs/online-multiplayer-plan.md`.

## Non-Goals

- No `online_runtime_nodes` persistent node-state table.
- No authenticated operator drain route.
- No bounded forced socket-close drain timer.
- No multi-instance deployment enablement.
- No schema migration framework rewrite.
- No UI/screenshots.

## Files

- Modify: `src/online/server/PostgresOnlineOperationGateStore.ts`
- Modify: `src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts`
- Modify: `src/online/server/PostgresOnlineRateLimitStore.ts`
- Modify: `src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts`
- Modify: `server/startupMaintenance.ts`
- Modify: `server/__tests__/startup-maintenance.test.ts`
- Modify: `server/index.ts`
- Modify: `server/__tests__/server-index-runtime.test.ts`
- Modify: `docs/online-multiplayer-plan.md`
- Modify: this plan file

## Task 1: Operation Lock Cleanup

- [x] **Step 1: Write the failing operation-lock cleanup test**

Add to `src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts`:

```ts
it("deletes stale operation lock rows before a retention cutoff", async () => {
  const queryable = new FakePostgresClient();
  queryable.nextRowCount = 3;
  const store = new PostgresOnlineOperationGateStore({ queryable });

  await expect(
    store.cleanupOperationLocksBefore("2026-06-16T12:00:00.000Z")
  ).resolves.toBe(3);

  const deleteQuery = queryable.queries.find((query) =>
    /delete from online_operation_locks/i.test(query.text)
  );
  expect(compactSql(deleteQuery?.text ?? "")).toBe(
    "DELETE FROM online_operation_locks WHERE updated_at < $1::timestamptz"
  );
  expect(deleteQuery?.values).toEqual(["2026-06-16T12:00:00.000Z"]);
});

it("rejects invalid operation lock cleanup cutoffs before querying", async () => {
  const queryable = new FakePostgresClient();
  const store = new PostgresOnlineOperationGateStore({ queryable });

  await expect(store.cleanupOperationLocksBefore("not-a-date")).rejects.toThrow(
    /operation lock cleanup cutoff/
  );
  expect(queryable.queries).toEqual([]);
});
```

Also add `nextRowCount = 0;` to `FakePostgresClient` and make `query(...)` return `{ rows: [], rowCount: this.nextRowCount }`.

- [x] **Step 2: Run the red test**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "operation lock cleanup|stale operation lock"
```

Expected: fail because `cleanupOperationLocksBefore` does not exist.

Observed: failed with `TypeError: store.cleanupOperationLocksBefore is not a function`.

- [x] **Step 3: Implement minimal operation-lock cleanup**

Add to `PostgresOnlineOperationGateStore`:

```ts
async cleanupOperationLocksBefore(cutoffIso: string): Promise<number> {
  const cutoff = new Date(cutoffIso);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error("PostgreSQL operation lock cleanup cutoff must be an ISO timestamp.");
  }
  await this.ensureSchema();
  const result = await this.queryable.query(
    `
      DELETE FROM online_operation_locks
      WHERE updated_at < $1::timestamptz
    `,
    [cutoff.toISOString()]
  );
  return result.rowCount ?? 0;
}
```

- [x] **Step 4: Verify operation-lock cleanup passes**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "operation lock cleanup|stale operation lock"
```

Expected: pass.

Observed: passed with 2 matching tests.

## Task 2: Rate-Limit Cleanup

- [x] **Step 1: Write the failing rate-limit cleanup test**

Add to `src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts`:

```ts
it("deletes expired fixed-window rate-limit rows", async () => {
  const queryable = new FakePostgresRateLimitClient();
  queryable.nextRowCount = 4;
  const store = new PostgresOnlineRateLimitStore({ queryable });

  await expect(store.cleanupExpiredRateLimits()).resolves.toBe(4);

  const deleteQuery = queryable.queries.find((query) =>
    /delete from online_rate_limits/i.test(query.text)
  );
  expect(compactSql(deleteQuery?.text ?? "")).toBe(
    "DELETE FROM online_rate_limits WHERE window_started_at + (window_ms * interval '1 millisecond') <= now()"
  );
  expect(deleteQuery?.values).toEqual([]);
});
```

Also add `nextRowCount = 0;` to `FakePostgresRateLimitClient` and make `query(...)` return `{ rows: [], rowCount: this.nextRowCount }` for unhandled SQL.

- [x] **Step 2: Run the red test**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts -t "expired fixed-window"
```

Expected: fail because `cleanupExpiredRateLimits` does not exist.

Observed: failed with `TypeError: store.cleanupExpiredRateLimits is not a function`.

- [x] **Step 3: Implement minimal rate-limit cleanup**

Add to `PostgresOnlineRateLimitStore`:

```ts
async cleanupExpiredRateLimits(): Promise<number> {
  await this.ensureSchema();
  const result = await this.queryable.query(
    `
      DELETE FROM online_rate_limits
      WHERE window_started_at + (window_ms * interval '1 millisecond') <= now()
    `,
    []
  );
  return result.rowCount ?? 0;
}
```

- [x] **Step 4: Verify rate-limit cleanup passes**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts -t "expired fixed-window"
```

Expected: pass.

Observed: passed with 1 matching test.

## Task 3: Startup Runtime Cleanup Helper

- [x] **Step 1: Write failing helper tests**

Add to `server/__tests__/startup-maintenance.test.ts`:

```ts
import {
  ONLINE_STARTUP_RUNTIME_CLEANUP_TASK_KEY,
  runOnlineRuntimeTableCleanup,
} from "../startupMaintenance";

class FakeRuntimeCleanupStores {
  readonly calls: string[] = [];

  async cleanupExpiredSpectators(): Promise<number> {
    this.calls.push("spectators");
    return 1;
  }

  async cleanupRuntimeEventsBefore(cutoffIso: string): Promise<number> {
    this.calls.push(`events:${cutoffIso}`);
    return 2;
  }

  async cleanupOperationLocksBefore(cutoffIso: string): Promise<number> {
    this.calls.push(`locks:${cutoffIso}`);
    return 3;
  }

  async cleanupExpiredRateLimits(): Promise<number> {
    this.calls.push("rate-limits");
    return 4;
  }
}

it("runs runtime operational table cleanup under a once-per-run maintenance task", async () => {
  const runtimeCoordinator = new FakeRuntimeCoordinator();
  const stores = new FakeRuntimeCleanupStores();

  await expect(
    runOnlineRuntimeTableCleanup({
      config: {
        runtimeNodeId: "node-a",
        commit: "0123456789abcdef0123456789abcdef01234567",
      },
      runtimeCoordinator: runtimeCoordinator as unknown as OnlineRuntimeCoordinator,
      stores,
      now: new Date("2026-06-16T12:00:00.000Z"),
      runtimeEventRetentionMs: 86_400_000,
      operationLockRetentionMs: 86_400_000,
    })
  ).resolves.toEqual({
    status: "completed",
    value: {
      expiredSpectators: 1,
      runtimeEvents: 2,
      operationLocks: 3,
      rateLimits: 4,
      runtimeEventCutoffIso: "2026-06-15T12:00:00.000Z",
      operationLockCutoffIso: "2026-06-15T12:00:00.000Z",
    },
  });

  expect(runtimeCoordinator.calls).toEqual([
    {
      taskKey: ONLINE_STARTUP_RUNTIME_CLEANUP_TASK_KEY,
      runKey: "commit:0123456789abcdef0123456789abcdef01234567",
    },
  ]);
  expect(stores.calls).toEqual([
    "spectators",
    "events:2026-06-15T12:00:00.000Z",
    "locks:2026-06-15T12:00:00.000Z",
    "rate-limits",
  ]);
});

it("does not run runtime operational cleanup when another node already completed it", async () => {
  const runtimeCoordinator = new FakeRuntimeCoordinator();
  runtimeCoordinator.nextResult = { status: "already_completed" };
  const stores = new FakeRuntimeCleanupStores();

  await expect(
    runOnlineRuntimeTableCleanup({
      config: { runtimeNodeId: "node-b", commit: "0123456789abcdef0123456789abcdef01234567" },
      runtimeCoordinator: runtimeCoordinator as unknown as OnlineRuntimeCoordinator,
      stores,
      now: new Date("2026-06-16T12:00:00.000Z"),
    })
  ).resolves.toEqual({ status: "already_completed" });

  expect(stores.calls).toEqual([]);
});
```

- [x] **Step 2: Run the red helper tests**

Run:

```bash
npx vitest run server/__tests__/startup-maintenance.test.ts -t "runtime operational"
```

Expected: fail because the runtime cleanup exports do not exist.

Observed: failed with `TypeError: runOnlineRuntimeTableCleanup is not a function`.

- [x] **Step 3: Implement the helper**

Add to `server/startupMaintenance.ts`:

```ts
export const ONLINE_STARTUP_RUNTIME_CLEANUP_TASK_KEY = "startup_runtime_table_cleanup";
const DEFAULT_RUNTIME_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OPERATION_LOCK_RETENTION_MS = 24 * 60 * 60 * 1000;

interface RuntimeTableCleanupStores {
  cleanupExpiredSpectators(): Promise<number>;
  cleanupRuntimeEventsBefore(cutoffIso: string): Promise<number>;
  cleanupOperationLocksBefore(cutoffIso: string): Promise<number>;
  cleanupExpiredRateLimits(): Promise<number>;
}

interface RunOnlineRuntimeTableCleanupOptions {
  config: StartupMaintenanceConfig;
  runtimeCoordinator: Pick<OnlineRuntimeCoordinator, "runStartupMaintenance">;
  stores: RuntimeTableCleanupStores;
  now?: Date;
  runtimeEventRetentionMs?: number;
  operationLockRetentionMs?: number;
}

export interface OnlineRuntimeTableCleanupResult {
  expiredSpectators: number;
  runtimeEvents: number;
  operationLocks: number;
  rateLimits: number;
  runtimeEventCutoffIso: string;
  operationLockCutoffIso: string;
}

function cleanupCutoffIso(now: Date, retentionMs: number, label: string): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error("Runtime cleanup current time must be a valid Date.");
  }
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1) {
    throw new Error(`${label} retention must be a positive integer of milliseconds.`);
  }
  return new Date(now.getTime() - retentionMs).toISOString();
}

export function runOnlineRuntimeTableCleanup(
  options: RunOnlineRuntimeTableCleanupOptions
): Promise<OnlineRuntimeStartupMaintenanceResult<OnlineRuntimeTableCleanupResult>> {
  return options.runtimeCoordinator.runStartupMaintenance(
    {
      taskKey: ONLINE_STARTUP_RUNTIME_CLEANUP_TASK_KEY,
      runKey: createStartupMaintenanceRunKey(options.config),
    },
    async () => {
      const now = options.now ?? new Date();
      const runtimeEventCutoffIso = cleanupCutoffIso(
        now,
        options.runtimeEventRetentionMs ?? DEFAULT_RUNTIME_EVENT_RETENTION_MS,
        "Runtime event"
      );
      const operationLockCutoffIso = cleanupCutoffIso(
        now,
        options.operationLockRetentionMs ?? DEFAULT_OPERATION_LOCK_RETENTION_MS,
        "Operation lock"
      );
      const expiredSpectators = await options.stores.cleanupExpiredSpectators();
      const runtimeEvents = await options.stores.cleanupRuntimeEventsBefore(runtimeEventCutoffIso);
      const operationLocks = await options.stores.cleanupOperationLocksBefore(operationLockCutoffIso);
      const rateLimits = await options.stores.cleanupExpiredRateLimits();
      return {
        expiredSpectators,
        runtimeEvents,
        operationLocks,
        rateLimits,
        runtimeEventCutoffIso,
        operationLockCutoffIso,
      };
    }
  );
}
```

- [x] **Step 4: Verify helper tests pass**

Run:

```bash
npx vitest run server/__tests__/startup-maintenance.test.ts -t "runtime operational"
```

Expected: pass.

Observed: passed with 2 matching tests.

## Task 4: Production Startup Wiring

- [x] **Step 1: Write failing production wiring test**

Update `server/__tests__/server-index-runtime.test.ts` startup-maintenance test to assert:

```ts
const summaryMaintenanceIndex = source.indexOf("runOnlineStartupMaintenance({");
const runtimeCleanupIndex = source.indexOf("runOnlineRuntimeTableCleanup({");
expect(runtimeCleanupIndex).toBeGreaterThan(summaryMaintenanceIndex);
expect(runtimeCleanupIndex).toBeLessThan(serviceIndex);
expect(source).toMatch(/runOnlineRuntimeTableCleanup\(\{[\s\S]*spectatorPresenceStore,[\s\S]*runtimeEventStore,[\s\S]*operationGateStore,[\s\S]*rateLimitStore,[\s\S]*\}\)/);
```

Also require `runOnlineRuntimeTableCleanup` in the import assertion.

- [x] **Step 2: Run the red production wiring test**

Run:

```bash
npx vitest run server/__tests__/server-index-runtime.test.ts -t "startup maintenance"
```

Expected: fail because `server/index.ts` does not call `runOnlineRuntimeTableCleanup`.

Observed: failed because `server/index.ts` did not contain `runOnlineRuntimeTableCleanup`.

- [x] **Step 3: Wire production startup cleanup**

In `server/index.ts`, import `runOnlineRuntimeTableCleanup` and call it after `runOnlineStartupMaintenance(...)`:

```ts
await runOnlineRuntimeTableCleanup({
  config,
  runtimeCoordinator,
  stores: {
    spectatorPresenceStore,
    runtimeEventStore,
    operationGateStore,
    rateLimitStore,
  },
});
```

- [x] **Step 4: Verify production wiring passes**

Run:

```bash
npx vitest run server/__tests__/server-index-runtime.test.ts -t "startup maintenance"
```

Expected: pass.

Observed: passed with 1 matching test.

## Task 5: Docs, Review, Verification, Commit

- [x] **Step 1: Update roadmap**

Add an Item 11 sub-slice entry to `docs/online-multiplayer-plan.md` saying runtime operational table cleanup is now owned by startup maintenance, while persistent runtime-node drain rows, operator drain route, bounded forced socket close, deeper two-instance race tests, production smoke, and multi-instance enablement remain follow-up work.

Observed: added the runtime startup cleanup ownership entry and updated the current slice selection rule in `docs/online-multiplayer-plan.md`.

Affected verification before review:

- `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts` passed with 30 tests.
- `npm run server:build` initially failed because the helper type expected direct cleanup methods while production passed named stores; fixed the helper/test shape to match production.
- `npm run server:build` then passed.

- [x] **Step 2: Run review**

Request a reviewer focused on:

- whether cleanup is safely startup-owned and not repeated by every node;
- whether cutoff semantics are conservative;
- whether cleanup methods delete only operational metadata;
- whether docs avoid claiming multi-instance readiness.

Review dispositions:

- Accept/fixed Medium: startup cleanup originally derived runtime event and operation-lock cutoffs from the app-node clock while comparing against PostgreSQL timestamps. Added DB-clock retention cleanup methods, `cleanupRuntimeEventsOlderThan(retentionMs)` and `cleanupOperationLocksOlderThan(retentionMs)`, and changed `runOnlineRuntimeTableCleanup(...)` to call those methods. Red tests first failed because the retention methods did not exist and the helper still called cutoff methods, then passed after implementation.
- Reject as a code change / accept as wording clarification Low: coordinator close still calls `cleanupExpiredSpectators()` for best-effort expired spectator cleanup. This does not delete active rows or durable history because the store deletes only `expires_at <= now()` rows. Kept the close cleanup and clarified the roadmap wording: startup owns scheduled cross-store cleanup, while coordinator close may still clean expired spectator rows.

Post-review verification:

- `npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts -t "PostgreSQL time|retention"` passed with 1 matching test.
- `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "PostgreSQL time|retention"` passed with 3 matching tests.
- `npx vitest run server/__tests__/startup-maintenance.test.ts -t "runtime operational"` passed with 2 matching tests.
- `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts` passed with 39 tests.
- `npm run server:build` passed.

- [x] **Step 3: Final verification**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts
npm run server:build
npm run audit
git diff --check
```

If production code changes touch shared server/runtime behavior, also run:

```bash
npx vitest run
npm run build
```

No browser screenshots are required because this slice changes backend startup cleanup only.

Final verification evidence:

- `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts server/__tests__/startup-maintenance.test.ts server/__tests__/server-index-runtime.test.ts` passed with 39 tests.
- `npx vitest run` passed with 135 files passed, 1 skipped; 1616 tests passed, 3 skipped.
- `npm run build` passed with the existing large-chunk warning.
- `npm run server:build` passed.
- `npm run audit` passed with 0 vulnerabilities.
- `git diff --check` passed with only CRLF conversion warnings.
- Browser screenshots were not required because this slice changes backend startup cleanup only.

- [ ] **Step 4: Commit and push**

```bash
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-runtime-startup-cleanup-ownership.md src/online/server/PostgresOnlineOperationGateStore.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/PostgresOnlineRateLimitStore.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts server/startupMaintenance.ts server/__tests__/startup-maintenance.test.ts server/index.ts server/__tests__/server-index-runtime.test.ts
git commit -m "Add runtime startup cleanup ownership"
git push origin master
```
