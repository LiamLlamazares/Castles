# Production Runtime Health Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the production online API smoke so it fails early when `/api/health` does not report ready runtime event polling and runtime-node heartbeat, while also proving public health does not expose runtime-node identity or persisted node rows.

**Architecture:** Keep `check-online-smoke.mjs` as the production API smoke entrypoint. Add a narrow helper in `online-smoke-lib.mjs` that validates the already-fetched health JSON before the smoke mutates production state by creating test games/accounts.

**Tech Stack:** Node ESM deploy scripts, Vitest, existing `/api/health` runtime fields, existing production smoke script.

---

### Task 1: Runtime Health Smoke Guard

**Files:**
- Modify: `scripts/deploy/online-smoke-lib.mjs`
- Modify: `scripts/deploy/check-online-smoke.mjs`
- Test: `scripts/deploy/__tests__/online-smoke-lib.test.mjs`
- Test: `scripts/deploy/__tests__/online-api-smoke-script.test.mjs`

- [x] **Step 1: Write failing smoke-helper tests**

Add tests requiring:
- healthy runtime health passes when `online.runtime.readiness.ok`, `eventPolling.ready`, and `nodeHeartbeat.ready` are all true;
- missing runtime status fails with an actionable error;
- event polling not ready fails before production state is mutated;
- runtime-node heartbeat not ready fails before production state is mutated;
- public health fails if it exposes internal runtime node identity or persisted runtime-node rows.

Run:

```powershell
npx vitest run scripts/deploy/__tests__/online-smoke-lib.test.mjs scripts/deploy/__tests__/online-api-smoke-script.test.mjs -t "runtime|health"
```

Expected: FAIL because the helper and script wiring do not exist yet.

Result: FAIL as expected. The focused command reported six failures: `assertProductionRuntimeHealthReady` was missing from the helper module and `check-online-smoke.mjs` did not call it.

- [x] **Step 2: Implement the smoke guard**

Implement a helper in `online-smoke-lib.mjs` and call it from `check-online-smoke.mjs` immediately after the basic `/api/health` checks and optional expected-commit check.

The helper must:
- require `healthBody.online.runtime.readiness.ok === true`;
- require `healthBody.online.runtime.eventPolling.ready === true`;
- require `healthBody.online.runtime.nodeHeartbeat.ready === true`;
- reject public health payloads that expose internal runtime node identity/state such as `nodeId`, `runtimeNodeId`, `node`, `runtimeNode`, `nodeState`, `persistedNode`, or `online_runtime_nodes`;
- avoid confusing the allowed scheduler key `nodeHeartbeat` with runtime-node identity.

- [x] **Step 3: Verify focused tests pass**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/online-smoke-lib.test.mjs scripts/deploy/__tests__/online-api-smoke-script.test.mjs -t "runtime|health"
```

Expected: PASS.

Result: PASS. `npx vitest run scripts/deploy/__tests__/online-smoke-lib.test.mjs scripts/deploy/__tests__/online-api-smoke-script.test.mjs -t "runtime|health"` passed 8 matching tests after tightening the script-order assertion to the create-game call inside `main()`.

### Task 2: Roadmap, Verification, Review, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-17-production-runtime-health-smoke.md`

- [x] **Step 1: Run verification**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/online-smoke-lib.test.mjs scripts/deploy/__tests__/online-api-smoke-script.test.mjs
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all commands exit 0. Existing Vite large-chunk warnings and CRLF conversion warnings are acceptable if unchanged.

Result: PASS on 2026-06-17:
- `npx vitest run scripts/deploy/__tests__/online-smoke-lib.test.mjs scripts/deploy/__tests__/online-api-smoke-script.test.mjs`: 14 tests passed.
- Final full `npx vitest run`: 139 files passed, 1 skipped; 1677 tests passed, 3 skipped.
- `npm run build`: passed with the existing Vite large-chunk warning.
- `npm run server:build`: passed.
- `npm run audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed with CRLF conversion warnings for touched files.

- [x] **Step 2: Run code review and classify findings**

Review for:
- smoke guard runs before game/account mutation;
- public health does not expose node identity or persisted runtime-node rows;
- allowed `nodeHeartbeat` health is not falsely rejected as node identity;
- degraded/not-ready runtime status produces actionable failures;
- no accidental `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement.

Classify each finding as `accept`, `reject`, `investigate`, or `defer`; append a micro-reflection only for accepted/investigated reusable process mistakes.

Disposition:
- Accepted and fixed one minor false-positive finding: the recursive public-health leak guard rejected any exact `node` key anywhere in the health payload, which could fail future smoke checks on unrelated metadata such as `build.node`. A red/green regression now allows `build.node` while still rejecting `node` inside `online.runtime` and explicit runtime-node identity keys anywhere.
- No findings for smoke guard ordering, missing runtime readiness checks, runtime-node identity leakage, allowed `nodeHeartbeat` false positives, not-ready failure copy, or accidental `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement.
- A micro-reflection was appended to the tracked `codex-research-skills` ledger.

- [x] **Step 3: Update roadmap and commit**

Record the completed slice, exact verification output, review dispositions, and remaining item 11 follow-ups in `docs/online-multiplayer-plan.md`, mark this plan complete, then commit and push.

Result: roadmap updated. Commit/push handled after final diff hygiene.
