# Production Runtime Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand production monitoring so runtime event-poller and runtime-node heartbeat degradation from `/api/health` becomes machine-readable operator alerts without leaking scheduler error text.

**Architecture:** Keep the existing `production-freshness.mjs` health/freshness pipeline. Add a response-specific runtime-health projection that copies only safe scheduler fields, wire it into `checkProductionFreshness()`, classify degraded/not-ready runtime schedulers in `classifyProductionFreshnessAlerts()`, and include the projected runtime status in monitoring snapshots and text output.

**Tech Stack:** Node ESM deploy scripts, Vitest, existing `check-production-monitoring.mjs`, existing `/api/health` runtime fields.

---

### Task 1: Runtime Health Projection and Alerts

**Files:**
- Modify: `scripts/deploy/production-freshness.mjs`
- Test: `scripts/deploy/__tests__/production-freshness.test.mjs`
- Test: `scripts/deploy/__tests__/production-monitoring-script.test.mjs`

- [x] **Step 1: Write failing runtime monitoring tests**

Add tests requiring:
- `checkProductionFreshness()` includes a `health.runtime` projection with `readiness`, `eventPolling`, and `nodeHeartbeat`.
- The projection excludes `lastError` text, database URLs, table names, bearer tokens, and account/session-looking strings.
- `classifyProductionFreshnessAlerts()` returns warning alerts for scheduler `consecutiveFailures > 0` while `ready === true`.
- `classifyProductionFreshnessAlerts()` returns critical alerts for `ready === false`.
- `createProductionMonitoringSnapshot()` includes the sanitized runtime projection.
- `runProductionMonitoringCommand()` prints the sanitized runtime projection and does not print raw scheduler error text.

Run:

```powershell
npx vitest run scripts/deploy/__tests__/production-freshness.test.mjs scripts/deploy/__tests__/production-monitoring-script.test.mjs -t "runtime|monitoring"
```

Expected: FAIL because production freshness does not project runtime scheduler status or classify runtime scheduler alerts.

Result: FAIL as expected. The focused tests reported missing `health.runtime`, missing runtime alert codes, and a healthy monitoring exit despite scheduler degradation.

- [x] **Step 2: Implement the runtime projection and alert rules**

Implement a small projection helper in `production-freshness.mjs`:
- copy `readiness.ok` and `readiness.error`;
- copy scheduler `running`, `ready`, `consecutiveFailures`, `lastPollAt`, `lastHeartbeatAt`, `lastSuccessAt`, `lastFailureAt`, and `lastResult` where present;
- exclude `lastError` from monitoring output;
- leave missing runtime fields as `undefined`.

Add alert rules:
- `runtime_event_polling_not_ready` critical when `eventPolling.ready === false`;
- `runtime_node_heartbeat_not_ready` critical when `nodeHeartbeat.ready === false`;
- `runtime_event_polling_degraded` warning when `eventPolling.ready === true` and `consecutiveFailures > 0`;
- `runtime_node_heartbeat_degraded` warning when `nodeHeartbeat.ready === true` and `consecutiveFailures > 0`.

- [x] **Step 3: Verify focused tests pass**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/production-freshness.test.mjs scripts/deploy/__tests__/production-monitoring-script.test.mjs -t "runtime|monitoring"
```

Expected: PASS.

Result: PASS. `npx vitest run scripts/deploy/__tests__/production-freshness.test.mjs scripts/deploy/__tests__/production-monitoring-script.test.mjs -t "runtime|monitoring"` passed 12 matching tests.

### Task 2: Roadmap, Verification, Review, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-17-production-runtime-monitoring.md`

- [x] **Step 1: Run verification**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/production-freshness.test.mjs scripts/deploy/__tests__/production-monitoring-script.test.mjs
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all commands exit 0. Existing Vite large-chunk warnings and CRLF conversion warnings are acceptable if unchanged.

Result: PASS on 2026-06-17:
- `npx vitest run scripts/deploy/__tests__/production-freshness.test.mjs scripts/deploy/__tests__/production-monitoring-script.test.mjs`: 24 tests passed.
- Initial full `npx vitest run`: one `OnlineGameBrowser.test.tsx` accepted-challenge assertion failed; the exact focused test and full `OnlineGameBrowser.test.tsx` file both passed afterward.
- Final full `npx vitest run`: 139 files passed, 1 skipped; 1670 tests passed, 3 skipped.
- `npm run build`: passed with the existing Vite large-chunk warning.
- `npm run server:build`: passed.
- `npm run audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed with CRLF conversion warnings for touched files.

- [x] **Step 2: Run code review and classify findings**

Review for:
- scheduler `lastError` or secret-bearing health text leaking into monitoring JSON or formatted text;
- warning/critical alert severity matching readiness semantics;
- false positives on missing runtime fields from older health payloads;
- accidental `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement;
- production smoke/deploy script behavior changes outside monitoring.

Classify each finding as `accept`, `reject`, `investigate`, or `defer`; append a micro-reflection only for accepted/investigated reusable process mistakes.

Disposition:
- Accepted and fixed one major projection-boundary finding: `createProductionMonitoringSnapshot()` could leak a malformed raw runtime object containing only `lastError` because the sanitized projection returned `undefined` and the original `runtime` field survived the object spread. The fix removes raw `runtime` before conditionally adding the sanitized projection, and a regression covers the no-safe-fields case.
- No findings for scheduler `lastError` leakage after the fix, alert severity, false positives on missing runtime fields, deploy-script scope creep, or accidental `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement.
- A micro-reflection was appended to the tracked `codex-research-skills` ledger.

- [x] **Step 3: Update roadmap and commit**

Record the completed slice, exact verification output, review dispositions, and remaining item 11 follow-ups in `docs/online-multiplayer-plan.md`, mark this plan complete, then commit and push:

```powershell
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-production-runtime-monitoring.md scripts/deploy/production-freshness.mjs scripts/deploy/__tests__/production-freshness.test.mjs scripts/deploy/__tests__/production-monitoring-script.test.mjs
git commit -m "Add production runtime monitoring alerts"
git push
```
