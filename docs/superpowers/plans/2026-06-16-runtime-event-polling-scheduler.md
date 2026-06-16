# Runtime Event Polling Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start a conservative production runtime-event polling scheduler for the already wired PostgreSQL runtime event coordinator, with bounded backoff, readiness metadata, shutdown cleanup, and no multi-instance enablement.

**Architecture:** Add a focused `server/runtimeEventPolling.ts` helper that owns timer state and exposes `startRuntimeEventPolling()` plus a readiness/status snapshot. `server/index.ts` starts it only after the HTTP server has subscribed to runtime snapshot hints, passes its readiness into `/api/health`, and stops it during shutdown/startup failure before closing the coordinator/stores.

**Tech Stack:** TypeScript, Node timers, existing `OnlineRuntimeCoordinator`, Express health response, Vitest fake timers/source checks.

---

## Scope

- Add a production scheduler that repeatedly calls `runtimeCoordinator.pollRemoteGameSnapshotChangedEvents({ limit })`.
- Prevent overlapping polls by scheduling the next poll after the current attempt settles.
- Back off after poll failures with bounded delay and reset to the normal interval after success.
- Expose a status snapshot for `/api/health`:
  - running/stopped
  - consecutive failure count
  - last success/failure timestamps
  - sanitized last error message
  - current readiness boolean
- Mark health readiness false after a small threshold of consecutive runtime polling failures.
- Stop polling during shutdown and startup-failure cleanup.
- Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.

## Out Of Scope

- LISTEN/NOTIFY.
- Two-instance integration tests.
- Enabling `multiInstanceReady`.
- Changing user-facing UI.
- Refactoring the entire production entrypoint.

## Task 1: Add Scheduler Tests

**Files:**
- Create: `server/__tests__/runtime-event-polling.test.ts`
- Modify: none

- [x] **Step 1: Write failing tests**

Tests should cover:

```ts
it("polls once immediately and then repeats after the normal interval");
it("does not overlap polls while a previous poll is still in flight");
it("backs off after failures and becomes ready again after a successful poll");
it("sanitizes failure messages and stops future polls");
```

- [x] **Step 2: Run red tests**

Run:

```bash
npx vitest run server/__tests__/runtime-event-polling.test.ts
```

Expected: fail because `server/runtimeEventPolling.ts` does not exist.

Observed: failed because `server/runtimeEventPolling.ts` did not exist. After adding the minimal stub, the behavioral tests failed for immediate polling, single-flight polling, failure backoff/readiness, and sanitized failure status.

## Task 2: Implement Scheduler Helper

**Files:**
- Create: `server/runtimeEventPolling.ts`
- Test: `server/__tests__/runtime-event-polling.test.ts`

- [x] **Step 1: Add `startRuntimeEventPolling()`**

Implement a helper with injected timer functions so tests can use fake timers without sleeping.

- [x] **Step 2: Track readiness state**

Status is ready when stopped or when consecutive failures are below the threshold. Runtime polling failures should not crash the process, but repeated failures must make health readiness false.

- [x] **Step 3: Run green tests**

Run:

```bash
npx vitest run server/__tests__/runtime-event-polling.test.ts
```

Expected: all tests pass.

Observed: `npx vitest run server/__tests__/runtime-event-polling.test.ts` passed with 4 tests after implementation. A stricter sanitizer regression was then added for a credentialed PostgreSQL URL without a token query; it failed with the raw URL in status, then passed after URL-credential detection was added.

## Task 3: Wire Scheduler Into Production Entrypoint

**Files:**
- Modify: `server/index.ts`
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `server/__tests__/server-index-runtime.test.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Add failing source/health tests**

Tests should prove:
- `server/index.ts` imports and starts the runtime event poller after `createOnlineHttpServer(...)`.
- shutdown and startup-failure cleanup stop the poller before closing the runtime coordinator.
- `/api/health` can include runtime event polling metadata and returns HTTP 503 when runtime readiness is false.

- [x] **Step 2: Implement wiring**

Add an optional health callback to `createOnlineHttpServer` for runtime readiness/status. Start the poller after HTTP server creation, pass readiness/status into health, and stop it in both shutdown paths.

- [x] **Step 3: Run focused tests**

Run:

```bash
npx vitest run server/__tests__/runtime-event-polling.test.ts server/__tests__/server-index-runtime.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime event polling|health|runtime coordinator"
```

Observed: the focused source/health tests first failed because `startRuntimeEventPolling` was not imported/started and `/api/health` ignored runtime readiness. After wiring, filtered and affected suites passed, including `npx vitest run server/__tests__/runtime-event-polling.test.ts server/__tests__/server-index-runtime.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts` with 206 tests.

## Task 4: Update Roadmap And Run Review

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/deployment/castles-server.md`
- Modify: `docs/online-data-contract.md`
- Modify: this plan file

- [x] **Step 1: Update docs**

Record that production has an explicit polling scheduler, bounded backoff, and readiness metadata. Keep multi-instance rejected until two-instance tests and remaining readiness work are complete.

Observed: updated `docs/online-multiplayer-plan.md`, `docs/deployment/castles-server.md`, and `docs/online-data-contract.md` so runtime polling is no longer listed as absent while multi-instance remains rejected.

- [x] **Step 2: Run code review**

Reviewer focus:
- timer lifecycle leaks
- readiness overclaiming
- secret hygiene in error/status output
- shutdown ordering
- test coverage for no-overlap/backoff

- [x] **Step 3: Classify findings**

Record accept/reject/investigate/defer dispositions in this plan before final verification.

Review dispositions:

- Accept/fixed Critical: embedded credentialed URLs could still leak because credentialed-URL detection only matched at the start of the error string. Added a red/green regression for `connect failed for postgresql://castles:secret@db.example/castles refused` and changed sanitization to detect credentialed URLs anywhere in the message.
- Accept/fixed Important: `stop()` cleared queued timers but did not wait for an in-flight poll before production shutdown closed runtime coordinator/stores. Added a red/green regression proving `stop()` remains pending until the active poll settles; `RuntimeEventPoller.stop()` now returns `Promise<void>` and `server/index.ts` awaits it on normal shutdown and startup failure.
- Accept/fixed Minor: the multi-instance rejection message still named runtime-event polling readiness as incomplete. Tightened `serverRuntimeConfig` coverage and updated the operator-facing rejection text to list the remaining blockers only.

## Task 5: Final Verification And Commit

Run:

```bash
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

Observed final verification:

- `npx vitest run` passed: 134 files passed, 1 skipped; 1606 tests passed, 3 skipped.
- `npm run build` passed with the existing large-chunk warning.
- `npm run server:build` passed.
- `npm run audit` passed with 0 vulnerabilities.
- `git diff --check` passed with CRLF conversion warnings only.

No browser screenshots are required unless a visible UI surface changes.

Commit:

```bash
git add docs server src scripts
git commit -m "Add runtime event polling scheduler"
git push origin master
```
