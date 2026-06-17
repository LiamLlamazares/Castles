# Bounded Rolling Drain Socket Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production shutdown honor the rolling-drain contract by allowing existing WebSockets a bounded grace window, then sending a reconnectable service-unavailable protocol error before closing and force-terminating stragglers.

**Architecture:** Extract network listener shutdown into a tested `server/socketDrain.ts` helper. `server/index.ts` will start drain/readiness first, stop new HTTP accepts, wait the bounded WebSocket drain grace, send the existing versioned `error` frame shape, then close/terminate sockets under a second close timeout. Multi-instance mode remains rejected.

**Tech Stack:** TypeScript, Node HTTP server, `ws`, Vitest, Castles online protocol v1.

---

## Scope

- Add a small server-side helper for HTTP close and bounded WebSocket drain close.
- Keep new HTTP readiness/new WebSocket rejection on the existing runtime drain path.
- Preserve existing sockets during the grace window instead of closing immediately.
- Send a protocol-versioned `type: "error"` frame with `code: "service_unavailable"` and reconnect copy before closing sockets at the grace timeout.
- Force-terminate sockets that do not close after the close timeout.
- Wire production `server/index.ts` shutdown through the helper.
- Update roadmap and this slice plan with evidence.

## Non-Goals

- No multi-instance enablement.
- No `CASTLES_DEPLOYMENT_MODE=multi-instance` acceptance.
- No new client protocol version.
- No production deploy or live PostgreSQL rehearsal.
- No UI layout/screenshots.

## Files

- Create: `server/socketDrain.ts`
- Create: `server/__tests__/socket-drain.test.ts`
- Modify: `server/index.ts`
- Modify: `server/__tests__/server-index-runtime.test.ts`
- Modify: `docs/online-multiplayer-plan.md`
- Modify: this plan file

## Task 1: Socket Drain Helper

- [x] **Step 1: Add failing helper tests**

Create `server/__tests__/socket-drain.test.ts` with tests that prove:

- `closeWebSocketServerAfterDrain(...)` does not send or close sockets before `drainGraceMs`.
- At `drainGraceMs`, open clients receive a versioned `error` frame with `service_unavailable` and then receive `close(1001, "Server draining for deploy")`.
- At `drainGraceMs + closeTimeoutMs`, any still-open clients receive `terminate()`.
- Already closed clients are ignored.
- `closeHttpServer(...)` calls `closeAllConnections()` only after its timeout.

- [x] **Step 2: Run red helper tests**

Run:

```bash
npx vitest run server/__tests__/socket-drain.test.ts
```

Expected: fail because `server/socketDrain.ts` does not exist.

- [x] **Step 3: Implement helper**

Create `server/socketDrain.ts` with:

- `DRAIN_SOCKET_ERROR` containing `{ code: "service_unavailable", message: "This node is draining for a deploy. Reconnect shortly." }`.
- `closeHttpServer(server, { timeoutMs })`.
- `closeWebSocketServerAfterDrain(wss, { drainGraceMs, closeTimeoutMs })`.
- A local send helper that attaches `protocolVersion: ONLINE_PROTOCOL_VERSION` to the error frame.

- [x] **Step 4: Run helper tests green**

Run:

```bash
npx vitest run server/__tests__/socket-drain.test.ts
```

Expected: pass.

## Task 2: Production Wiring

- [x] **Step 1: Add failing server entrypoint assertions**

Update `server/__tests__/server-index-runtime.test.ts` to require:

- `server/index.ts` imports `closeHttpServer` and `closeWebSocketServerAfterDrain` from `./socketDrain`.
- shutdown calls `closeHttpServer(server, { timeoutMs: HTTP_SHUTDOWN_TIMEOUT_MS })`.
- shutdown calls `closeWebSocketServerAfterDrain(wss, { drainGraceMs: WEBSOCKET_DRAIN_GRACE_MS, closeTimeoutMs: WEBSOCKET_CLOSE_TIMEOUT_MS })`.
- `runtimeCoordinator?.startDrain({ reason })` still happens before both network close calls.

- [x] **Step 2: Run red wiring tests**

Run:

```bash
npx vitest run server/__tests__/server-index-runtime.test.ts -t "drain|network|WebSocket"
```

Expected: fail because `server/index.ts` still has inline close helpers and immediate socket close.

- [x] **Step 3: Wire production shutdown**

Modify `server/index.ts` to:

- Remove inline `resolveOnce`, `closeHttpServer`, and `closeWebSocketServer`.
- Import helper functions from `./socketDrain`.
- Add constants:
  - `HTTP_SHUTDOWN_TIMEOUT_MS = 5_000`
  - `WEBSOCKET_DRAIN_GRACE_MS = 30_000`
  - `WEBSOCKET_CLOSE_TIMEOUT_MS = 5_000`
- Call the helper functions in shutdown.

- [x] **Step 4: Run wiring tests green**

Run:

```bash
npx vitest run server/__tests__/server-index-runtime.test.ts -t "drain|network|WebSocket"
```

Expected: pass.

## Task 3: Verification, Review, Commit

- [x] **Step 1: Run focused verification**

Run:

```bash
npx vitest run server/__tests__/socket-drain.test.ts server/__tests__/server-index-runtime.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain|service unavailable|websocket|health"
npm run server:build
```

- [x] **Step 2: Run full verification**

Run:

```bash
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

- [x] **Step 3: Run code review and classify findings**

Review scope: rolling-drain semantics, reconnectable protocol error shape, shutdown ordering, timer cleanup, force-termination bounds, and no multi-instance enablement.

- [x] **Step 4: Update docs**

Update `docs/online-multiplayer-plan.md` item 11 notes with:

- What was implemented.
- TDD evidence.
- Verification commands.
- Reviewer dispositions.
- Remaining follow-ups.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add server/socketDrain.ts server/__tests__/socket-drain.test.ts server/index.ts server/__tests__/server-index-runtime.test.ts docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-bounded-rolling-drain-socket-close.md
git commit -m "Add bounded rolling drain socket close"
git push origin master
```

## Status

- Slice selected: item 11 bounded rolling-drain socket close.
- Implementation status: helper and production wiring implemented; review finding fixed; final verification complete; commit/push pending.
- TDD evidence:
  - `npx vitest run server/__tests__/socket-drain.test.ts` first failed because `server/socketDrain.ts` did not exist.
  - Helper tests then failed on the socket-open constant mismatch before passing after using `WebSocket.OPEN`.
  - `npx vitest run server/__tests__/server-index-runtime.test.ts -t "drain|network|WebSocket"` first failed because `server/index.ts` still used inline immediate socket close helpers.
  - A follow-up ordering regression first failed because the runtime event poller stopped before bounded network close; shutdown now stops polling after network close so existing sockets remain serviced during the drain grace.
- Verification evidence:
  - `npx vitest run server/__tests__/socket-drain.test.ts server/__tests__/server-index-runtime.test.ts -t "drain|network|WebSocket|socket drain"` passed: 2 files, 7 matching tests.
  - `npx vitest run server/__tests__/server-index-runtime.test.ts` passed: 8 tests.
  - `npx vitest run server/__tests__/socket-drain.test.ts server/__tests__/server-index-runtime.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain|service unavailable|websocket|health|WebSocket"` passed after the review fix: 3 files, 34 matching tests.
  - Full `npx vitest run` passed after the review fix: 137 files passed, 1 skipped; 1638 tests passed, 3 skipped.
  - `npm run build` passed with the existing Vite large-chunk warning.
  - `npm run server:build` passed.
  - `npm run audit` passed with 0 vulnerabilities.
  - `git diff --check` passed with CRLF conversion warnings only.
- Review status: reviewer dispatched for socket-drain semantics, timer cleanup, shutdown ordering, and protocol compatibility.
- Review finding: accepted a major finding that force-termination only checked `WebSocket.OPEN`, while real `ws.close(...)` moves sockets to `CLOSING`. The fake client now models `OPEN -> CLOSING`, the regression first failed, and the helper now terminates every client that is not already `WebSocket.CLOSED` at the hard timeout.
