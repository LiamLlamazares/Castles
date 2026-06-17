# Local Runtime Account Rejoin Smoke Plan

Goal: extend the local PostgreSQL two-node runtime smoke so it proves account-backed game snapshot and rejoin recovery work through a peer node after the game is created on another node.

Scope:
- Advance item 11, Phase 8 multi-instance design and implementation.
- Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.
- Use the existing built-server local runtime-nodes smoke.
- Create registered accounts and an account-backed challenge/game through node A, then use node B for account snapshot, account rejoin, and play with the fresh rejoin credential.
- Keep the smoke token-free in output and delete disposable accounts after the rehearsal.
- Do not add multi-instance enablement, new account product UI, or new account schema.

Required artifacts:
- Failing test first for smoke metrics/script expectations.
- Built-server smoke path that creates two accounts, creates/accepts an account challenge, fetches an account-authorized snapshot through the peer node, rejoins through the peer node, submits an action with the fresh rejoin token, and terminal-cleans the disposable game.
- Token-free metrics summary.
- Focused tests, live local PostgreSQL smoke, full verification, review disposition, roadmap update, commit, and push.

Success criteria:
- `scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` first fails because account rejoin evidence is missing, then passes after implementation.
- `npm run online:smoke:local:runtime-nodes` prints `accountRejoin=<node-a>-><node-b>@v1` without tokens, secrets, invite URLs, account session ids, or database URLs.
- Node B account snapshot returns the created game, node B account rejoin mints a fresh tokenless invite, and that fresh token submits a legal action.
- Full verification passes before commit.

Review checklist:
- Account session bearer tokens are never printed in metrics.
- Account snapshot/rejoin happens on the peer node, not the game-creating node.
- The fresh rejoin token is used to play, not merely returned.
- The disposable game is terminal-cleaned and disposable accounts are deleted.
- The slice does not enable multi-instance deployment mode.

Status:
- [x] Failing test captured.
- [x] Implementation complete.
- [x] Focused and live smoke verification complete.
- [x] Review complete.
- [x] Roadmap updated.
- [x] Commit and push complete.

Evidence:
- Red test: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "account|runtime-node"` failed because `accountRejoin` was absent from the summary/metrics and `verifyCrossNodeAccountRejoin` was absent from the smoke script.
- Focused pass: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs -t "account|runtime-node"` passed 15 tests after implementation.
- Script syntax: `node --check scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs` and `node --check scripts/deploy/local-postgres-runtime-nodes-smoke-lib.mjs` passed.
- Full focused file: `npx vitest run scripts/deploy/__tests__/local-postgres-runtime-nodes-smoke.test.mjs` passed 15 tests.
- Live smoke: `$env:DATABASE_URL='postgresql://castles_local:castles_local_dev@localhost:5432/castles_local'; npm run online:smoke:local:runtime-nodes` passed with `rollingContinuation=local-runtime-smoke-a->local-runtime-smoke-b@v2 accountRejoin=local-runtime-smoke-a->local-runtime-smoke-b@v1 spectatorFanout=local-runtime-smoke-a->local-runtime-smoke-b@v1 visibilityPropagation=local-runtime-smoke-a->local-runtime-smoke-b@unlisted timeoutFanout=local-runtime-smoke-a->local-runtime-smoke-b@timeout`.
- Full suite: `npx vitest run` passed 140 files with 1 skipped; 1689 tests passed with 3 skipped.
- Build/audit: `npm run build` passed with the existing Vite large-chunk warning, `npm run server:build` passed, `npm run audit` reported 0 vulnerabilities, and `git diff --check` reported only existing CRLF conversion warnings for touched smoke files.
- Commit/push: this slice was committed and pushed from `master`.

Review disposition:
- Accepted and fixed one minor guardrail finding: the metrics leakage assertion now explicitly rejects `account_session` text in addition to token, bearer, secret, and database URL patterns.
- No findings remain for peer-node account snapshot/rejoin ordering, fresh rejoin-token usage, disposable game cleanup, account cleanup, token-free metrics, or deployment-mode guardrails.
- Micro-reflection appended to `C:\Users\liaml\Documents\GitHub\Personal\codex-research-skills\cognitive_ledger.md`.
