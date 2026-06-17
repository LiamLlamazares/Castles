# Local Runtime Action Race Smoke Plan

Goal: extend the local PostgreSQL two-node runtime smoke so it proves same-game action races across two built server processes serialize through PostgreSQL and surface one accepted action plus one stale-action rejection.

Scope:
- Advance item 11, Phase 8 multi-instance design and implementation.
- Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.
- Use the existing built-server local runtime-nodes smoke.
- Create one disposable game on node A, join the same white seat through node A and node B, submit two different same-base-version actions concurrently, assert exactly one accepted version-1 snapshot and one `stale_action` rejection, then terminal-clean the game.
- Do not add public capacity claims, load-test thresholds, multi-instance enablement, or new protocol shapes.

Required artifacts:
- Failing test first for smoke metrics/script expectations.
- Built-server smoke path proving cross-node same-game action race serialization.
- Token-free metrics summary.
- Focused tests, live local PostgreSQL smoke, full verification, review disposition, roadmap update, commit, and push.

Success criteria:
- `scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` first fails because action race evidence is missing, then passes after implementation.
- `npm run online:smoke:local:runtime-nodes` prints `actionRace=<node-a>+<node-b>@accepted1-rejected1` without tokens, secrets, invite URLs, account session ids, or database URLs.
- The accepted message is a version-1 `snapshot`, the rejected message is a `rejected` frame with `error.code === "stale_action"` and snapshot version 1, and cleanup resignation cannot be silently swallowed.
- Full verification passes before commit.

Review checklist:
- The two racing action messages are sent only after both node sockets are joined at version 0.
- The race uses different client action ids so this proves stale-version serialization, not duplicate retry behavior.
- The disposable game is terminal-cleaned after the race.
- Metrics do not leak player tokens, bearer values, invite URLs, account sessions, secrets, or database URLs.
- The slice does not enable multi-instance deployment mode.

Status:
- [x] Failing test captured.
- [x] Implementation complete.
- [x] Focused and live smoke verification complete.
- [x] Review complete.
- [x] Roadmap updated.
- [ ] Commit and push complete.

Evidence:
- RED: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "action race|runtime-node"` failed because `actionRace` was missing from the summary/metrics output and `verifyCrossNodeActionRace` was missing from `scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs`.
- GREEN focused: `node --check scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs`; `node --check scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs`; `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "action race|runtime-node"` passed 16 tests.
- Focused file: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` passed 16 tests.
- Live smoke: `$env:DATABASE_URL='postgresql://castles_local:castles_local_dev@localhost:5432/castles_local'; npm run online:smoke:local:runtime-nodes` passed and printed `actionRace=local-runtime-smoke-a+local-runtime-smoke-b@accepted1-rejected1` with no token-bearing fields.
- Full verification: `npx vitest run` passed 140 files / 1690 tests with 3 skipped and a post-success worker-termination warning for `OnlineProfileDashboard.test.tsx`; `npm run build` passed with the existing Vite large-chunk warning; `npm run server:build` passed; `npm run audit` found 0 vulnerabilities; `git diff --check` passed with CRLF conversion warnings for touched `.mjs` files.

Review disposition:
- Scope reviewed: action-race smoke helpers, runtime-nodes smoke metrics, script ordering, cleanup path, and deployment-mode guardrails.
- Mathematical source checked: not applicable; source of truth is the item 11 operational-readiness plan and stale-version protocol contract.
- Findings: none. No accepted/investigated findings; no cognitive-ledger entry required.
