# Local Runtime Timeout Fanout Smoke Plan

Goal: extend the local PostgreSQL two-node runtime smoke so it proves timeout adjudication triggered on one node propagates to a spectator socket connected to the other node.

Scope:
- Advance item 11, Phase 8 multi-instance design and implementation.
- Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.
- Use the existing built-server local runtime-nodes smoke.
- Prove timeout adjudication through PostgreSQL-backed room hydration, timeout persistence, runtime-event polling, and cross-node socket fanout.
- Avoid a minute-long smoke delay by aging only the disposable smoke game's persisted creation clock before the peer node hydrates it.
- Do not add multi-instance enablement, clock test endpoints, Redis, or production clock overrides.

Required artifacts:
- Failing test first for smoke metrics/script expectations.
- Built-server smoke path that creates a timed public game on node A, connects a spectator on node B, ages the disposable persisted creation clock, triggers timeout adjudication on node A, requires node B to receive the terminal timeout snapshot, and records a token-free metric.
- Token-free metrics summary.
- Focused tests, live local PostgreSQL smoke, full verification, review disposition, roadmap update, commit, and push.

Success criteria:
- `scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` first fails because timeout fanout evidence is missing, then passes after implementation.
- `npm run online:smoke:local:runtime-nodes` prints `timeoutFanout=<node-a>-><node-b>@timeout` without tokens, secrets, invite URLs, or database URLs.
- The smoke proves the timeout snapshot is terminal with `result.reason === "timeout"` and reaches the remote spectator socket.
- Full verification passes before commit.

Review checklist:
- The smoke ages only the created disposable game and only before the peer node hydrates it for this check.
- Timeout adjudication is triggered through public server behavior, not a test-only endpoint.
- The remote spectator socket receives the terminal snapshot through runtime-event propagation.
- Metrics do not leak player tokens, bearer values, invite URLs, or database URLs.
- The slice does not enable multi-instance deployment mode.
- No cleanup is needed after a terminal timeout, and open sockets are still closed.

Status:
- [x] Failing test captured.
- [x] Implementation complete.
- [x] Focused and live smoke verification complete.
- [x] Review complete.
- [x] Roadmap updated.
- [x] Commit and push complete.

Evidence:
- Red test: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "timeout|runtime-node"` failed because `timeoutFanout` was absent from the summary/metrics and `verifyCrossNodeTimeoutFanout` / `agePersistedCreationClockForTimeout` were absent from the smoke script.
- Focused pass: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "timeout|runtime-node"` passed 14 tests after implementation.
- Script syntax: `node --check scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs` and `node --check scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs` passed.
- Full focused file: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` passed 14 tests.
- Live smoke: `$env:DATABASE_URL='postgresql://castles_local:castles_local_dev@localhost:5432/castles_local'; npm run online:smoke:local:runtime-nodes` passed with `rollingContinuation=local-runtime-smoke-a->local-runtime-smoke-b@v2 spectatorFanout=local-runtime-smoke-a->local-runtime-smoke-b@v1 visibilityPropagation=local-runtime-smoke-a->local-runtime-smoke-b@unlisted timeoutFanout=local-runtime-smoke-a->local-runtime-smoke-b@timeout`.
- Full suite: first `npx vitest run` had one `OnlineProfileDashboard.test.tsx` rating assertion fail while still rendering the loading state; the focused profile-dashboard file then passed 3 tests, and the final full-suite rerun passed 140 files with 1 skipped; 1688 tests passed with 3 skipped.
- Build/audit: `npm run build` passed with the existing Vite large-chunk warning, `npm run server:build` passed, `npm run audit` reported 0 vulnerabilities, and `git diff --check` reported only existing CRLF conversion warnings for touched smoke files.
- Commit/push: this slice was committed and pushed from `master`.

Review disposition:
- No findings requiring code changes. Reviewed the deliberate test-side clock aging, node ordering, normal timeout trigger path, remote spectator assertion, token-free metrics, and deployment-mode guardrails.
- No micro-reflection required.
