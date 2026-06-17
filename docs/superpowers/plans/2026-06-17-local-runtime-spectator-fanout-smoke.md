# Local Runtime Spectator Fanout Smoke Plan

Goal: extend the local PostgreSQL two-node runtime smoke so it proves a real spectator connected to node B receives a player action snapshot produced on node A through the runtime event path, while shared spectator presence is visible from node A.

Scope:
- Advance item 11, Phase 8 multi-instance design and implementation.
- Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.
- Use the existing built-server local runtime-nodes smoke.
- Do not add public capacity claims, autoscaling, Redis, or production multi-instance enablement.

Required artifacts:
- Failing test first for smoke metrics/script expectations.
- Built-server smoke path that creates a public game on node A, spectates it on node B, verifies node A sees the shared spectator count, submits a node A action, and requires the node B spectator to receive version 1.
- Token-free metrics summary.
- Focused tests, live local PostgreSQL smoke, full verification, review disposition, roadmap update, commit, and push.

Success criteria:
- `scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` first fails because spectator fanout evidence is missing, then passes after implementation.
- `npm run online:smoke:local:runtime-nodes` prints `spectatorFanout=<node-a>-><node-b>@v1` without tokens, secrets, or database URLs.
- Full verification passes before commit.

Review checklist:
- Spectator count is read through node A after registering the spectator on node B.
- The broadcast assertion waits for the node B spectator snapshot after the node A player action.
- Metrics do not leak player tokens, bearer values, invite URLs, or database URLs.
- The slice does not enable multi-instance deployment mode.
- Cleanup closes live sockets and does not mask operation failures.

Status:
- [x] Failing test captured.
- [x] Implementation complete.
- [x] Focused and live smoke verification complete.
- [x] Review complete.
- [x] Roadmap updated.
- [ ] Commit and push complete.

Evidence:
- Red test: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "spectator|runtime-node"` first failed because `spectatorFanout` was absent from the summary and `verifyCrossNodeSpectatorFanout` was absent from the script.
- Review red test: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "terminal-cleans|spectator|runtime-node"` failed until the fanout game submitted a terminal cleanup resignation.
- Focused pass: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "terminal-cleans|spectator|runtime-node"` passed 12 tests.
- Script syntax: `node --check scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs` and `node --check scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs` passed.
- Full focused file: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` passed 12 tests.
- Live smoke: `$env:DATABASE_URL='postgresql://castles_local:castles_local_dev@localhost:5432/castles_local'; npm run online:smoke:local:runtime-nodes` passed with `rollingContinuation=local-runtime-smoke-a->local-runtime-smoke-b@v2 spectatorFanout=local-runtime-smoke-a->local-runtime-smoke-b@v1`.
- Full suite: `npx vitest run` passed 140 files with 1 skipped; 1686 tests passed with 3 skipped.
- Build/audit: `npm run build` passed with the existing Vite large-chunk warning, `npm run server:build` passed, and `npm run audit` reported 0 vulnerabilities.

Review disposition:
- Accepted and fixed: the new fanout rehearsal created a durable public game but did not terminal-clean it. A regression now requires `{ type: "RESIGN", baseVersion: 1 }` with `spectator-fanout-cleanup-resign`, and the smoke fails if that cleanup action fails.
- No findings for cross-node ordering, shared spectator count source, token-free metrics, inherited `CASTLES_DEPLOYMENT_MODE`, or WebSocket cleanup.
- Micro-reflection appended to `C:\Users\liaml\Documents\GitHub\Personal\codex-research-skills\cognitive_ledger.md`.
