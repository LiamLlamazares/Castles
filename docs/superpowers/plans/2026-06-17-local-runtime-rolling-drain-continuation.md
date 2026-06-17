# Local Runtime Rolling-Drain Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the local PostgreSQL runtime-nodes smoke from "two nodes are alive and drain state persists" to "a game created before node A drains can continue through node B against the same PostgreSQL store."

**Architecture:** Reuse `npm run online:smoke:local:runtime-nodes` and its built-server two-node harness. After both nodes are healthy, create a direct game on node A, submit one accepted action on node A, start runtime drain on node A, verify node A is unhealthy/draining and node B remains healthy, then fetch/join/submit the next action through node B. Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected; this is a rolling-drain rehearsal, not a production multi-instance enablement.

**Tech Stack:** Node ESM deploy scripts, PostgreSQL local rehearsal database, WebSocket smoke helper primitives, Vitest source/unit tests.

---

### Task 1: Rolling-Drain Continuation Smoke

**Files:**
- Modify: `scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs`
- Modify: `scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs`
- Test: `scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs`

- [x] **Step 1: Write failing tests**

Add tests requiring:
- the runtime-nodes smoke script creates an online game through node A before drain;
- the script starts drain on node A before the node B continuation check;
- the script fetches/joins the same game through node B after node A is draining;
- the script submits a second accepted action through node B;
- smoke metrics include a token-free rolling-continuation summary.

Run:

```powershell
npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "rolling|runtime-node"
```

Expected: FAIL because the continuation check and metrics do not exist.

Result: FAIL as expected. The focused command reported that runtime-node metrics did not include `rollingContinuation`, and the script did not import/use `makeSmokeSetup`, `buildWebSocketUrl`, `versionedSocketMessage`, `createRollingDrainSmokeGame`, or `continueRollingDrainSmokeGame`.

- [x] **Step 2: Implement the continuation check**

Implement a narrow built-server flow:
- import the existing WebSocket helpers and `makeSmokeSetup`;
- create a game on node A and assert no-store response properties while keeping raw player tokens out of smoke metrics/log output;
- join node A as white over WebSocket and submit `PASS` at `baseVersion: 0`;
- drain node A;
- wait for node A health 503/draining and node B health 200/non-draining;
- fetch the same game from node B with the black token and assert persisted version 1;
- join node B as black over WebSocket and submit `PASS` at `baseVersion: 1`;
- add token-free continuation metrics to the summary output.

- [x] **Step 3: Verify focused tests pass**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "rolling|runtime-node"
```

Expected: PASS.

Result: PASS. `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "rolling|runtime-node"` passed 9 matching tests.

### Task 2: Live Smoke, Review, Roadmap, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-17-local-runtime-rolling-drain-continuation.md`

- [x] **Step 1: Run verification**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs
npm run online:smoke:local:runtime-nodes
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all commands exit 0. Existing Vite large-chunk warnings and CRLF conversion warnings are acceptable if unchanged.

Result: PASS on 2026-06-17:
- `node --check scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs`: passed.
- `node --check scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs`: passed.
- `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs`: 10 tests passed.
- `$env:DATABASE_URL='postgresql://castles_local:castles_local_dev@localhost:5432/castles_local'; npm run online:smoke:local:runtime-nodes`: passed with `rollingContinuation=local-runtime-smoke-a->local-runtime-smoke-b@v2`.
- Final full `npx vitest run`: 139 files passed, 1 skipped; 1679 tests passed, 3 skipped.
- `npm run build`: passed with the existing Vite large-chunk warning.
- `npm run server:build`: passed.
- `npm run audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed with CRLF conversion warnings for touched files.

- [x] **Step 2: Run code review and classify findings**

Review for:
- continuation is checked after node A enters drain;
- node B continuation proves PostgreSQL-backed hydration rather than same-process state;
- smoke output does not leak player tokens, account sessions, database URLs, or bearer values;
- direct-create invite URLs still include legacy query tokens; record that as follow-up instead of migrating that broader response contract in this rolling-drain slice;
- the script still strips inherited `CASTLES_DEPLOYMENT_MODE`;
- cleanup does not mask the original operation failure.

Classify each finding as `accept`, `reject`, `investigate`, or `defer`; append a micro-reflection only for accepted/investigated reusable process mistakes.

Disposition:
- Accepted and fixed one cleanup honesty finding: the first implementation swallowed rolling-drain cleanup resignation failures and could have reported a clean smoke while leaving an active disposable game behind. A red/green source regression now requires cleanup errors to fail the smoke.
- Deferred one broader legacy contract finding: low-level direct game creation still returns token-bearing invite URLs from `OnlineGameService.buildInviteUrl`. The rolling-drain smoke now avoids logging those URLs, but deleting that legacy response shape is a separate URL-token cleanup slice.
- No findings for continuation ordering, node B hydration evidence, token leakage in metrics, inherited `CASTLES_DEPLOYMENT_MODE`, or shutdown error precedence.
- A micro-reflection was appended to the tracked `codex-research-skills` ledger.

- [x] **Step 3: Update roadmap and commit**

Record exact red/green/live-smoke/full verification evidence and review dispositions in this plan and `docs/online-multiplayer-plan.md`, then commit and push.

Result: roadmap updated. Commit/push handled after final diff hygiene.
