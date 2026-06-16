# Open Seek Challenge Lifecycle Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance Item 11 by routing open-seek and challenge terminal lifecycle mutations through shared runtime operation gates.

**Architecture:** Extend the existing `OnlineRuntimeCoordinator` operation-gate seam with `open_seek_lifecycle` and `challenge_lifecycle` scopes. Keep the single-node coordinator process-local, delegate those scopes through `PostgresOnlineOperationGateStore` when the PostgreSQL operation-gate coordinator is used, and wrap HTTP route mutations after authentication/authorization so no secret-bearing token becomes a gate key.

**Tech Stack:** TypeScript, Express, Vitest, PostgreSQL row-lock operation gate store.

---

## Scope

This slice advances `docs/online-multiplayer-plan.md` item 11 and the multi-instance design requirement to audit and close shared gate coverage for challenge and open-seek lifecycle actions.

Non-goals:

- Do not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`.
- Do not wire the PostgreSQL operation-gate coordinator into production traffic yet.
- Do not add shared rate limits in this slice.
- Do not add two-instance smoke tests in this slice.
- Do not keep or add legacy process-local special cases beyond the single-node coordinator fallback.

## Files

- Modify `src/online/server/onlineRuntimeCoordinator.ts`
- Modify `src/online/server/PostgresOnlineOperationGateStore.ts`
- Modify `src/online/server/createOnlineHttpServer.ts`
- Modify `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`
- Modify `src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts`
- Modify `src/online/server/__tests__/createOnlineHttpServer.test.ts`
- Modify `docs/online-multiplayer-plan.md`
- Modify this plan with execution evidence

## Tasks

### Task 1: Coordinator Lifecycle Gate API

- [x] Write failing coordinator tests proving same-key local serialization for `withOpenSeekLifecycleGate` and `withChallengeLifecycleGate`.
- [x] Write failing PostgreSQL coordinator delegation test expecting scopes `open_seek_lifecycle` and `challenge_lifecycle`.
- [x] Run `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "lifecycle gate"` and confirm failures are missing methods/delegation.
- [x] Add the two methods to `OnlineRuntimeCoordinator`, the process-local coordinator, and the PostgreSQL operation-gate coordinator.
- [x] Re-run the targeted coordinator tests and confirm they pass.

### Task 2: PostgreSQL Operation-Gate Scope Validation

- [x] Write failing store tests proving `open_seek_lifecycle` and `challenge_lifecycle` row locks use safe entity-id keys.
- [x] Write failing store tests proving malformed lifecycle keys and secret-looking keys are rejected before persistence.
- [x] Run `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "lifecycle"` and confirm failures are unsupported scopes.
- [x] Add the two scopes and bounded key-shape validation:
  - `open_seek_lifecycle:seek_<safe-id>`
  - `challenge_lifecycle:challenge_<safe-id>`
- [x] Re-run targeted store tests and confirm they pass.

### Task 3: HTTP Route Gate Wiring

- [x] Write failing route tests proving direct challenge decline/cancel actions call `withChallengeLifecycleGate("challenge_lifecycle:<challengeId>", operation)`.
- [x] Write failing route test proving account challenge accept/decline/cancel actions call the same challenge lifecycle gate.
- [x] Write failing route tests proving open-seek owner refresh/cancel and public accept actions call `withOpenSeekLifecycleGate("open_seek_lifecycle:<seekId>", operation)`.
- [x] Run targeted route tests and confirm failures are missing gate calls.
- [x] Wrap authorized challenge lifecycle mutation paths and open-seek lifecycle mutation paths inside the coordinator gates. Keep validation/auth/rate-limit behavior outside the gate where it already runs before durable mutation.
- [x] Re-run targeted route tests and confirm they pass.

### Task 4: Roadmap, Review, Verification, Commit

- [x] Update `docs/online-multiplayer-plan.md` with the completed sub-slice, evidence, non-goals, and remaining Item 11 work.
- [x] Update this plan with exact red/green verification evidence.
- [x] Run a code review pass focused on lifecycle race coverage, gate-key privacy, and whether any terminal mutation path was missed.
- [x] Classify findings as accept/reject/investigate/defer; apply accepted code/test fixes.
- [x] Run verification:
  - `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "lifecycle gate|shared lifecycle gate|open seek lifecycle|challenge lifecycle"`
  - broader affected suites as needed
  - `npm run build`
  - `npm run server:build`
  - `npm run audit`
  - `git diff --check`
- [x] Commit and push the completed slice.

## Execution Evidence

- Red: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "lifecycle gate"` failed because `withOpenSeekLifecycleGate` and `withChallengeLifecycleGate` did not exist on the coordinator.
- Green: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "lifecycle gate|delegates selected shared operation gates"` passed with 3 matching tests.
- Red: `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "lifecycle"` failed because `open_seek_lifecycle` and `challenge_lifecycle` were unsupported PostgreSQL operation-gate scopes.
- Green: `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "lifecycle"` passed with 2 matching tests.
- Red: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "wraps open seek|wraps direct challenge|wraps account challenge accept"` failed with 6 lifecycle gate spies not called.
- Green: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "wraps open seek|wraps lazy open seek|wraps direct challenge|wraps account challenge accept|wraps lazy direct challenge"` passed with 8 matching tests after adding centralized lifecycle gate wrappers and correcting test expiry intervals to the API-accepted value.
- Affected suite: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts` passed with 3 files and 225 tests.
- Review: external reviewer found no blocking lifecycle-gate bypass. Accepted minor findings:
  - Add lifecycle-specific secret-looking key tests in `PostgresOnlineOperationGateStore.test.ts`.
  - Prove route mutations run inside the lifecycle gate callback, not merely that the gate method was called.
  - Add explicit Quick Match matched-candidate lifecycle-gate coverage.
- Review fixes: lifecycle-specific secret-looking key assertions were added for `open_seek_lifecycle` and `challenge_lifecycle`; direct challenge, account challenge, open-seek, and Quick Match matched-candidate route tests now assert the durable mutation marker occurs after the gate callback marker.
- Review-fix verification: `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "lifecycle"` passed with 2 matching tests.
- Review-fix verification: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "wraps open seek|wraps lazy open seek|wraps direct challenge|wraps account challenge accept|wraps lazy direct challenge|quick match uses injected store listing"` passed with 9 matching tests.
- Review-fix verification: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts` passed with 3 files and 225 tests.
- Fresh final-diff review: accepted the major test-strength finding that lazy expiry route tests still proved only gate invocation, not that expiry append mutations ran inside the gate callback.
- Fresh final-diff review fix: lazy open-seek expiry and lazy challenge expiry tests now inject append hooks and assert append markers occur after the inside-gate marker.
- Fresh final-diff review verification: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "wraps open seek|wraps lazy open seek|wraps direct challenge|wraps account challenge accept|wraps lazy direct challenge|quick match uses injected store listing"` passed with 9 matching tests.
- Fresh final-diff review verification: `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "lifecycle"` passed with 2 matching tests.
- Fresh final-diff review verification: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts` passed with 3 files and 225 tests.
- Full verification: first post-review `npx vitest run` found one unrelated `OnlineGameBrowser` account-challenge inbox assertion failure; the exact failing test then passed in isolation with `npx vitest run src/components/__tests__/OnlineGameBrowser.test.tsx -t "lets signed-in players act on account challenges from the inbox"`.
- Full verification: rerun `npx vitest run` passed with 132 files, 1580 tests, and 3 skipped.
- Full verification: `npm run build` passed with the existing Vite large-chunk warning.
- Full verification: `npm run server:build` passed.
- Full verification: `npm run audit` passed with 0 vulnerabilities.
- Full verification: `git diff --check` exited 0 with CRLF conversion warnings only.
- Ledger: appended `2026-06-16 - Castles Lifecycle Gate Test Illusion` to `C:\Users\liaml\Documents\GitHub\Personal\codex-research-skills\cognitive_ledger.md`.
- Commit/push: implementation commit `ff8bd0a Add lifecycle operation gates` pushed to `origin/online-action-log`.
