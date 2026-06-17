# Local Runtime Visibility Propagation Smoke Plan

Goal: extend the local PostgreSQL two-node runtime smoke so it proves visibility changes made on node A are reflected in node B access decisions under the current public/unlisted policy.

Scope:
- Advance item 11, Phase 8 multi-instance design and implementation.
- Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.
- Use the existing built-server local runtime-nodes smoke.
- Prove public-to-unlisted propagation through durable PostgreSQL summaries, not by sharing process-local state.
- Do not add private visibility reauthorization, multi-instance enablement, Redis, or public capacity claims.

Required artifacts:
- Failing test first for smoke metrics/script expectations.
- Built-server smoke path that creates a public game on node A, verifies node B can read the public summary, changes visibility to unlisted on node A, verifies node B no longer exposes the public summary, verifies node B still serves the direct spectator snapshot, and terminal-cleans the disposable game.
- Token-free metrics summary.
- Focused tests, live local PostgreSQL smoke, full verification, review disposition, roadmap update, commit, and push.

Success criteria:
- `scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` first fails because visibility propagation evidence is missing, then passes after implementation.
- `npm run online:smoke:local:runtime-nodes` prints `visibilityPropagation=<node-a>-><node-b>@unlisted` without tokens, secrets, invite URLs, or database URLs.
- Full verification passes before commit.

Review checklist:
- Node B public summary is checked before and after node A changes visibility.
- The post-change node B summary check expects 404 while the direct spectator snapshot still succeeds.
- Metrics do not leak player tokens, bearer values, invite URLs, or database URLs.
- The slice does not enable multi-instance deployment mode.
- Cleanup submits a terminal action and cannot be silently swallowed.

Status:
- [x] Failing test captured.
- [x] Implementation complete.
- [x] Focused and live smoke verification complete.
- [x] Review complete.
- [x] Roadmap updated.
- [ ] Commit and push complete.

Evidence:
- Red test: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "visibility|runtime-node"` first failed because `visibilityPropagation` was absent from the summary and `verifyCrossNodeVisibilityPropagation` was absent from the script.
- Focused pass: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "visibility|runtime-node"` passed 13 tests after implementation.
- Script syntax: `node --check scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs` and `node --check scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs` passed.
- Full focused file: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` passed 13 tests.
- Live smoke: `$env:DATABASE_URL='postgresql://castles_local:castles_local_dev@localhost:5432/castles_local'; npm run online:smoke:local:runtime-nodes` passed with `rollingContinuation=local-runtime-smoke-a->local-runtime-smoke-b@v2 spectatorFanout=local-runtime-smoke-a->local-runtime-smoke-b@v1 visibilityPropagation=local-runtime-smoke-a->local-runtime-smoke-b@unlisted`.
- Full suite: `npx vitest run` passed 140 files with 1 skipped; 1687 tests passed with 3 skipped.
- Build/audit: `npm run build` passed with the existing Vite large-chunk warning, `npm run server:build` passed, and `npm run audit` reported 0 vulnerabilities.

Review disposition:
- No findings for node B before/after public summary checks, direct unlisted spectator snapshot access, terminal cleanup, token-free metrics, or deployment-mode guardrails.
- No micro-reflection required.
