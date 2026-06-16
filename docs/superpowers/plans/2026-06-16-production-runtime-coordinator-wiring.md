# Production Runtime Coordinator Wiring - 2026-06-16

## Goal

Wire the existing PostgreSQL runtime primitives into the configured production runtime coordinator when PostgreSQL stores are available, while keeping the runtime in single-node mode and keeping `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.

## Scope

- Compose the configured runtime coordinator from the existing PostgreSQL-backed stores:
  - spectator live presence
  - runtime event outbox and explicit poll API
  - selected operation gates
  - shared fixed-window rate limits
  - startup maintenance ownership
- Extend the PostgreSQL store factory so production creates the required runtime stores from the same validated `DATABASE_URL` and pool cap.
- Pass those stores through `server/index.ts` and `server/check-config.ts`, including lifecycle cleanup.
- Preserve current safety metadata:
  - `mode: "single-node"`
  - `websocketFanout: "process-local"`
  - `CASTLES_DEPLOYMENT_MODE=multi-instance` still rejected
- Update `docs/online-multiplayer-plan.md` with verification and review evidence.

## Out Of Scope

- Enabling multi-instance deployment.
- Adding a runtime event poll scheduler.
- Adding two-instance integration/load tests.
- Adding authenticated operator drain controls or persistent drain rows.
- Changing user-facing UI or layout.

## TDD Checklist

1. Add failing server coordinator tests proving partial and full PostgreSQL coordinator composition.
2. Add failing store-factory tests proving all runtime stores are created with the configured PostgreSQL pool cap.
3. Add/update entrypoint source/lifecycle tests proving `server/index.ts` and `server/check-config.ts` pass and close the new stores.
4. Implement coordinator composition by layering the existing primitives instead of replacing one wrapper with another.
5. Run focused tests, full tests, build, server build, audit, and diff checks.
6. Run review, classify findings, fix accepted issues, and record slice closure in the roadmap.

## Acceptance Criteria

- The configured production coordinator uses all supplied PostgreSQL runtime stores together.
- Runtime events are recorded and can be polled through the coordinator, but no production polling scheduler is started in this slice.
- Missing optional stores fall back to process-local behavior for that capability.
- Store construction and shutdown do not leak the new pools.
- All health/deployment metadata remains conservative and does not claim multi-instance readiness.
- No browser screenshots are required unless code changes affect visible UI.

## Review Dispositions

| Finding | Severity | Disposition | Resolution |
| --- | --- | --- | --- |
| Production now wires the runtime event store but does not start a poll scheduler, so docs could overstate active cross-node event consumption. | Important | Accept | Clarified this slice as outbox plus explicit coordinator poll API only; production scheduler remains deferred. |
| Plan artifact was untracked during review. | Important | Accept | Keep this plan artifact in the final commit. |
| Operator docs and deployment metadata still described live spectator presence as process-local. | Important | Accept | `/api/health`, `server:check-config`, production freshness fixtures, runbooks, and the data contract now report PostgreSQL live spectator presence while preserving `multiInstanceReady: false`. |
| `server/index.ts` wiring tests are source-grep based rather than behavioral. | Important | Defer | Avoided a risky entrypoint refactor in this backend slice. Existing coverage verifies store construction, coordinator composition, config-check lifecycle cleanup, and source-order guards; a future operational-readiness slice should factor production startup into an injectable helper. |
| Two check-config tests passed timeout values to `runCheckConfig()` where they were ignored. | Minor | Accept | Removed the ignored arguments and kept timeout configuration on `it(...)`. |
| Store factory had an env fallback for runtime node id. | Minor | Accept | Factory now requires the already parsed `runtimeNodeId` option for PostgreSQL store construction. |
