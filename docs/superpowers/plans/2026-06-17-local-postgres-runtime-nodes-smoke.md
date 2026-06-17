# Local PostgreSQL Runtime Nodes Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local two-node PostgreSQL smoke rehearsal that starts two built Castles server processes against the same disposable PostgreSQL database and verifies runtime-node registration, heartbeat/admin diagnostics, and drain readiness isolation without enabling multi-instance deployment mode.

**Architecture:** Reuse the existing local PostgreSQL smoke conventions: preflight checks, built `server-build/server/index.js`, loopback ports, local shutdown, no screenshots, and no secret-bearing output. Add a small helper library for option parsing, per-node environment construction, and metric formatting; the executable script starts two distinct runtime nodes with the same `DATABASE_URL`, checks `/api/health` and authenticated `/api/online/admin/runtime/status`, verifies both rows in `online_runtime_nodes`, drains node A, and confirms node B remains healthy.

**Tech Stack:** Node ESM scripts, Express built server, PostgreSQL `pg`, Vitest, existing `online-smoke-lib.mjs`, existing `local-postgres-prereqs.mjs`, and existing runtime-node admin routes.

---

### Task 1: Runtime-Nodes Smoke Helper Library

**Files:**
- Create: `scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs`
- Test: `scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs`

- [x] **Step 1: Write failing helper tests**

Add tests requiring:
- default options use two stable local smoke node ids and bounded request/startup timeouts;
- unsafe node-id prefixes are rejected;
- per-node server env includes `CASTLES_NODE_ID`, `ONLINE_STORE_BACKEND=postgres`, local shutdown, admin bearer token, and does not set `CASTLES_DEPLOYMENT_MODE`;
- summary/format output includes node and drain counts while excluding bearer tokens and database URLs.

Run:

```powershell
npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs
```

Expected: FAIL because the helper module does not exist.

Result: FAIL as expected. Vitest reported it could not resolve `../local-postgres-runtime-nodes-smoke-lib.mjs`.

- [x] **Step 2: Implement the minimal helper library**

Implement:
- `parseLocalPostgresRuntimeNodesSmokeOptions(env)`;
- `buildRuntimeNodeServerEnv({ baseEnv, port, baseUrl, repoRoot, nodeId, adminBearerToken, localShutdownToken })`;
- `summarizeLocalPostgresRuntimeNodesSmoke({ nodeStatuses, databaseRows, drainedNodeId, healthyNodeIds })`;
- `formatLocalPostgresRuntimeNodesSmokeMetrics(summary)`.

Implementation requirements:
- accept only node id prefixes matching `[A-Za-z0-9_-]{1,48}`;
- create exactly two node ids by default;
- keep `CASTLES_DEPLOYMENT_MODE` unset in child envs;
- never include `DATABASE_URL`, bearer tokens, or shutdown tokens in formatted metrics.

- [x] **Step 3: Verify helper tests pass**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs
```

Expected: PASS.

Result: PASS. `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` passed 5 tests.

### Task 2: Two-Node Built-Server Smoke Script

**Files:**
- Create: `scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs`
- Modify: `package.json`
- Test: `scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs`

- [x] **Step 1: Write failing script/export tests**

Extend the helper test file to require:
- `package.json` exposes `online:smoke:local:runtime-nodes`;
- the script source uses `CASTLES_NODE_ID`, `/api/online/admin/runtime/status`, `/api/online/admin/runtime/drain`, `online_runtime_nodes`, and local shutdown;
- the script does not set `CASTLES_DEPLOYMENT_MODE=multi-instance`.

Run:

```powershell
npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs
```

Expected: FAIL because the script and npm entry do not exist.

Result: FAIL as expected. The npm script was `undefined`, and the executable script file did not exist.

- [x] **Step 2: Implement the script and npm entry**

Script behavior:
- call `checkLocalPostgresPrereqs({ repoRoot })`;
- allocate two loopback ports;
- start two `server-build/server/index.js` processes with distinct `CASTLES_NODE_ID`s and the same `DATABASE_URL`;
- wait for both `/api/health` responses to report `ok: true`, PostgreSQL backend, event schema v2, and heartbeat readiness;
- call authenticated `GET /api/online/admin/runtime/status` on both nodes and verify each reports its own node id, non-draining state, sanitized heartbeat/poller diagnostics, and persisted node row;
- query `online_runtime_nodes` directly and verify both node rows exist;
- call authenticated `POST /api/online/admin/runtime/drain` on node A;
- verify node A `/api/health` becomes 503/draining while node B `/api/health` remains 200/healthy;
- shut both processes down through `/__local/shutdown`;
- print only sanitized aggregate metrics.

NPM entry:

```json
"online:smoke:local:runtime-nodes": "node scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs"
```

- [x] **Step 3: Verify focused script tests pass**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs
```

Expected: PASS.

Result: PASS. `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` passed 7 tests.

### Task 3: Roadmap, Verification, Review, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-17-local-postgres-runtime-nodes-smoke.md`

- [x] **Step 1: Run verification**

Run:

```powershell
npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs
npm run build
npm run server:build
npm run online:smoke:local:runtime-nodes
npm run audit
git diff --check
```

Expected: all commands exit 0. Existing Vite large-chunk warnings and CRLF conversion warnings are acceptable if unchanged. If local PostgreSQL prerequisites are unavailable, record the exact preflight failure and keep the smoke script itself verified by unit tests plus build checks.

Result: PASS on 2026-06-17:
- `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs`: 8 tests passed. The red runs first failed on the missing helper module, then on the missing npm script/executable, then on the missing cleanup-error selector.
- `npm run build`: passed with the existing Vite large-chunk warning.
- `npm run server:build`: passed.
- `DATABASE_URL=postgresql://castles_local:castles_local_dev@localhost:5432/castles_local npm run online:smoke:local:runtime-nodes`: passed with `nodes=2 dbRows=2 draining=1 heartbeatReady=2 persistedNodes=2 drainedNode=local-runtime-smoke-a healthyNodes=local-runtime-smoke-b`.
- Initial full `npx vitest run`: one `OnlineGameBrowser.test.tsx` cancellation assertion failed; the focused test and full `OnlineGameBrowser.test.tsx` file both passed afterward.
- Final full `npx vitest run`: passed with 139 files passed, 1 skipped; 1665 tests passed, 3 skipped.
- `npm run audit`: passed with 0 vulnerabilities.
- `git diff --check`: passed with the existing CRLF conversion warning for `package.json`.

- [x] **Step 2: Run code review and classify findings**

Review for:
- accidental `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement;
- script output leaking `DATABASE_URL`, admin bearer, shutdown token, invite token, or raw account/session ids;
- smoke checks accidentally proving only process-local state instead of PostgreSQL runtime-node rows;
- drain verification checking only node A and not node B readiness;
- child process cleanup gaps on failures.

Classify each finding as `accept`, `reject`, `investigate`, or `defer`; append a micro-reflection only for accepted/investigated reusable process mistakes.

Disposition:
- Accepted and fixed one minor portability finding: the helper test hard-coded a Windows-style `CASTLES_STATIC_DIR` expectation even though the helper uses `path.join()`. The test now derives the expected path through `path.join(path.resolve("test-repo"), "build")`, and a micro-reflection was appended to the tracked `codex-research-skills` ledger.
- No findings for accidental `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement, user-facing secret leakage, missing PostgreSQL row proof, drain isolation, or child-process cleanup after the operation-error preservation fix.

- [x] **Step 3: Update roadmap and commit**

Record the completed slice, exact verification output, and remaining item 11 follow-ups in `docs/online-multiplayer-plan.md`, mark this plan complete, then commit and push:

```powershell
git add package.json docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-local-postgres-runtime-nodes-smoke.md scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs
git commit -m "Add local runtime nodes smoke"
git push
```

Result: roadmap updated. Commit and push completed as the final handoff for this slice.
