# Two-Instance Race Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing two-instance runtime characterization so shared Quick Match, open-seek, and targeted account-challenge race invariants are exercised through real HTTP routes before multi-instance mode is ever enabled.

**Architecture:** Reuse `src/online/server/__tests__/twoInstanceRuntimeHarness.ts`. Add shared in-memory durable seek/challenge stores, a shared in-memory operation-gate store, and helper methods for node A/node B HTTP calls. Tests stay in `twoInstanceOnlineRuntime.test.ts` and prove cross-node race outcomes with `CASTLES_DEPLOYMENT_MODE=multi-instance` still rejected elsewhere.

**Tech Stack:** TypeScript, Vitest, real `createOnlineHttpServer` instances, WebSocket client, existing runtime coordinator seams, in-memory test stores.

---

### Task 1: Shared Operation Gate Harness

**Files:**
- Modify: `src/online/server/__tests__/twoInstanceRuntimeHarness.ts`
- Test: `src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts`

- [x] **Step 1: Write failing two-instance race tests**

Add tests for:
- two concurrent Quick Match fallback requests with the same public session across node A and node B create at most one open seek;
- two concurrent open-seek accept requests across node A and node B create at most one game;
- targeted account challenge creation from the same challenger to the same challenged account across node A and node B creates one pending challenge and rejects the duplicate as pending.

- [x] **Step 2: Run tests and verify RED**

Run:

```powershell
npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts -t "race|Quick Match|open seek|targeted account"
```

Expected: FAIL because the harness does not expose shared seek/challenge/account helpers yet.

- [x] **Step 3: Add a shared test operation-gate store**

Implement a small `InMemoryOperationGateStore` in the harness and pass it to both `createPostgresCompositeRuntimeCoordinator(...)` calls. It must serialize by `(scope, key)` and record calls for assertions.

- [x] **Step 4: Add shared durable seek/challenge/account helpers**

Add shared open-seek events/credentials, challenge events/credentials, account store, and HTTP helper methods. Keep credentials private inside the harness and expose only response bodies/statuses needed by tests.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts -t "race|Quick Match|open seek|targeted account"
```

Expected: PASS.

Result: PASS after harness implementation and review tightening. The focused red run first failed because `quickMatchOnNodeA`, `createOpenSeekOnNodeA`, and `createChallengeAccounts` did not exist; the review-fix red run then failed because deterministic shared-gate contention helpers did not exist. The final focused green run and the full `twoInstanceOnlineRuntime.test.ts` suite both pass with 5 tests, and each race test now arms a two-entrant barrier for the exact shared gate key before asserting the final one-open-seek/one-game/one-challenge invariant.

### Task 2: Verification, Review, Roadmap, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-17-two-instance-race-coverage.md`

- [x] **Step 1: Run verification**

Run:

```powershell
npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "two-instance|Quick Match|open seek|targeted account|operation gate"
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all commands exit 0. Existing Vite large-chunk warnings and CRLF conversion warnings are acceptable if unchanged.

Result: PASS on 2026-06-17 after the review fix:
- `npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "two-instance|Quick Match|open seek|targeted account|operation gate"`: 3 files passed, 37 tests passed, 198 skipped.
- `npx vitest run`: 138 files passed, 1 skipped; 1650 tests passed, 3 skipped. Vitest emitted a post-success worker-termination warning for `RulesManualPage.test.tsx` but exited 0.
- `npm run build`: passed with the existing Vite large-chunk warning.
- `npm run server:build`: passed.
- `npm run audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed with existing CRLF conversion warnings for touched test files.

- [x] **Step 2: Run code review and classify findings**

Review for:
- tests accidentally relying on process-local state instead of shared harness state;
- gates serializing by the wrong key/scope;
- duplicate accept/challenge results both succeeding;
- leaked tokens/raw account ids in test-visible public responses;
- accidental deployment-mode enablement.

Disposition:
- Accepted and fixed one major coverage finding: the first version asserted final state and only one gate call, so it could pass without proving both node requests contended on the same shared gate. The harness now supports deterministic two-entrant gate barriers, the tests arm the exact gate key for Quick Match, open-seek accept, and targeted account challenge races, and assertions require exactly two calls to that shared key.
- No issues found for real HTTP coverage, gate serialization mechanics, duplicate-success final state, open-seek credential/seat mapping, token/raw-private-data assertions, or accidental multi-instance enablement.

- [x] **Step 3: Update roadmap and commit**

Record the evidence in `docs/online-multiplayer-plan.md`, mark this plan complete, then commit and push:

```powershell
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-two-instance-race-coverage.md src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts src/online/server/__tests__/twoInstanceRuntimeHarness.ts
git commit -m "Add two-instance race coverage"
git push
```
