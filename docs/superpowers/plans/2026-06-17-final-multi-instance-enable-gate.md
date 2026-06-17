# Final Multi-Instance Enablement Gate

## Objective

Close item 11's final gate by accepting `CASTLES_DEPLOYMENT_MODE=multi-instance` only when the server is configured with the complete PostgreSQL online runtime stack, and prove that support through config checks, health metadata, monitoring, production smoke guards, and the built-server local two-node PostgreSQL smoke.

## Status

Completed on 2026-06-17. RED tests first failed on parser rejection, missing multi-instance coordinator metadata, smoke env stripping, single-node-only production monitoring, and production smoke missing deployment checks. Review also found and fixed compiled `server:check-config` output drift. Final evidence:

- Focused affected suites: 8 files, 87 tests passed.
- Live local two-node PostgreSQL smoke: `deployment=multi-instance` plus rolling continuation, account rejoin, action race, spectator fanout, visibility propagation, and timeout fanout metrics.
- Compiled `server:check-config` against local PostgreSQL printed the multi-instance deployment block.
- Full suite: `npx vitest run` passed 140 files, 1699 tests, 3 skipped.
- `npm run build`, `npm run server:build`, `npm run audit`, deploy-script `node --check`, and `git diff --check` passed. `git diff --check` reported only CRLF conversion warnings.

## Scope

- Keep the default and explicit `single-node` behavior unchanged.
- Add a supported `multi-instance` deployment metadata shape:
  - `mode: "multi-instance"`
  - `multiInstanceReady: true`
  - `websocketFanout: "postgres-runtime-events"`
  - `spectatorPresence: "postgres-live-presence"`
  - `accountPresence: "session-store"`
  - `roomState: "store-authoritative-warm-cache"`
  - `queueGuards: "postgres-locks-and-store-transactions"`
  - `routing: "multi-node"`
- Require all PostgreSQL runtime stores before constructing a multi-instance coordinator:
  - runtime node store
  - spectator presence store
  - runtime event store
  - operation gate store
  - rate-limit store
  - startup maintenance store
- Run the local runtime-nodes smoke with child servers in actual `CASTLES_DEPLOYMENT_MODE=multi-instance` mode.
- Update production freshness, monitoring, and production smoke checks so they accept supported single-node or supported multi-instance metadata, and reject partial or overclaiming deployment metadata.

## Non-Goals

- No production deploy in this slice.
- No public autoscaling or capacity claim.
- No UI changes or screenshot gate unless a visible route changes unexpectedly.
- No compatibility path for legacy multi-instance guardrails; obsolete "unsupported multi-instance" copy should be removed or rewritten.

## Required Artifacts

- RED tests proving the new expected multi-instance behavior fails before implementation.
- GREEN focused tests for runtime config, configured coordinator, check-config, production freshness/monitoring, production smoke helper, and local runtime-nodes smoke helper/script expectations.
- Live local PostgreSQL runtime-nodes smoke with both child servers in `CASTLES_DEPLOYMENT_MODE=multi-instance`.
- Full verification: `npx vitest run`, `npm run build`, `npm run server:build`, `npm run audit`, `git diff --check`, and syntax checks for touched deployment scripts.
- Review disposition before claiming completion.
- Roadmap and deployment docs updated with exact evidence.
- Commit and push to `origin/master`.

## Success Criteria

- `parseServerRuntimeConfig` accepts `CASTLES_DEPLOYMENT_MODE=multi-instance` and reports the supported metadata above.
- `createConfiguredRuntimeCoordinator` rejects multi-instance unless every required PostgreSQL runtime primitive is supplied.
- With the full stack supplied, the configured coordinator reports `mode: "multi-instance"` and `websocketFanout: "postgres-runtime-events"` while preserving shared presence, gates, rate limits, startup maintenance, and runtime-node drain behavior.
- `/api/health`, `server:check-config`, production freshness, production monitoring, and production smoke checks do not overclaim support for partial/malformed deployment metadata.
- `npm run online:smoke:local:runtime-nodes` asserts the health payloads advertise supported multi-instance metadata and prints a token-free multi-instance metric.

## Review Checklist

- Default single-node health/config behavior is unchanged.
- Multi-instance support is impossible without the full PostgreSQL runtime stack.
- Health and monitoring metadata cannot silently accept unsafe mixed states.
- Runtime node ids, tokens, secrets, session material, and private store rows are not exposed through public health or smoke output.
- Docs say what is now supported without claiming public-scale autoscaling or production capacity.
