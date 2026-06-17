# Operator Runtime Drain Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance item 11 by adding the authenticated operator route promised by the rolling WebSocket drain design.

**Architecture:** Reuse the existing hidden admin bearer-token pattern in `createOnlineHttpServer.ts`. Add a narrow `POST /api/online/admin/runtime/drain` endpoint that rate-limits as `admin_read`, returns 404 unless `adminBearerToken` is configured and matched, calls `runtimeCoordinator.startDrain({ reason: "operator" })`, and returns sanitized drain state. Existing health/readiness and WebSocket drain gates then do the actual traffic behavior.

**Tech Stack:** TypeScript, Express, Vitest, existing `OnlineRuntimeCoordinator`, existing admin bearer-token helpers, `docs/online-multiplayer-plan.md`.

---

## Scope

- Add `POST /api/online/admin/runtime/drain`.
- Keep the route hidden as 404 when the admin bearer token is absent, missing, or wrong.
- Reuse existing `admin_read` fixed-window rate limiting.
- Return `protocolVersion`, `runtime.draining`, `runtime.drainStartedAt`, and runtime capability metadata to the authorized operator.
- Do not echo the internal drain reason in public health or the admin response.
- Prove that an authorized operator drain makes `/api/health` readiness fail and keeps existing WebSocket drain rejection behavior covered by the existing tests.
- Update `docs/online-multiplayer-plan.md` with verification and remaining item 11 follow-ups.

## Non-Goals

- No `online_runtime_nodes` persistent node-state table.
- No bounded forced socket-close timer.
- No production deploy.
- No UI/browser screenshots.
- No `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement.

## Files

- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`
- Modify: `docs/online-multiplayer-plan.md`
- Modify: this plan file

## Task 1: Red Tests

- [x] **Step 1: Add the hidden-admin-route regression**

Add this test near the existing admin report queue tests in `src/online/server/__tests__/createOnlineHttpServer.test.ts`:

```ts
it("keeps the operator runtime drain route hidden unless an admin bearer token is configured", async () => {
  const { server } = createOnlineHttpServer({
    publicBaseUrl: "https://castles.example/play",
  });
  servers.push(server);
  const port = await listen(server);

  const response = await fetch(`http://127.0.0.1:${port}/api/online/admin/runtime/drain`, {
    method: "POST",
    headers: bearer("admin-token-with-enough-length"),
  });
  const body = await response.json();

  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toContain("Authorization");
  expect(body).toEqual({
    error: {
      code: "not_found",
      message: "No online admin resource was found.",
    },
  });
});
```

- [x] **Step 2: Add the authorized-drain behavior test**

Add this test immediately after the hidden-route regression:

```ts
it("lets the operator runtime drain route start drain and readiness failure without exposing the reason", async () => {
  const runtimeCoordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
  const startDrain = vi.spyOn(runtimeCoordinator, "startDrain");
  const { server } = createOnlineHttpServer({
    publicBaseUrl: "https://castles.example/play",
    runtimeCoordinator,
    adminBearerToken: "admin-token-with-enough-length",
    health: {
      checkStoreReady: async () => true,
      storeBackend: "postgres",
    },
  });
  servers.push(server);
  const port = await listen(server);

  const missingAuthResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/runtime/drain`, {
    method: "POST",
  });
  const wrongAuthResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/runtime/drain`, {
    method: "POST",
    headers: bearer("wrong-token-with-enough-length"),
  });
  const drainResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/runtime/drain`, {
    method: "POST",
    headers: bearer("admin-token-with-enough-length"),
  });
  const drainBody = await drainResponse.json();
  const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
  const healthBody = await healthResponse.json();

  expect(missingAuthResponse.status).toBe(404);
  expect(wrongAuthResponse.status).toBe(404);
  expect(drainResponse.status).toBe(200);
  expect(drainResponse.headers.get("cache-control")).toBe("no-store");
  expect(drainResponse.headers.get("vary")).toContain("Authorization");
  expect(startDrain).toHaveBeenCalledWith({ reason: "operator" });
  expect(drainBody).toMatchObject({
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    runtime: {
      draining: true,
      drainStartedAt: expect.any(String),
      nodeId: "node-a",
      capabilities: runtimeCoordinator.capabilities,
    },
  });
  expect(JSON.stringify(drainBody)).not.toContain("operator");
  expect(healthResponse.status).toBe(503);
  expect(healthBody).toMatchObject({
    ok: false,
    online: {
      runtime: {
        draining: true,
        drainStartedAt: drainBody.runtime.drainStartedAt,
      },
    },
  });
  expect(JSON.stringify(healthBody)).not.toContain("operator");
});
```

- [x] **Step 3: Run red tests**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "operator runtime drain|drain route"
```

Expected: fail because `POST /api/online/admin/runtime/drain` currently returns 404 for the authorized case.

Observed: failed before implementation because the missing route returned Express' default HTML 404, proving the new hidden-route test also needed the route-specific admin 404 JSON behavior.

## Task 2: Route Implementation

- [x] **Step 1: Add the route**

Add this route near the other `/api/online/admin/...` routes in `src/online/server/createOnlineHttpServer.ts`:

```ts
  app.post("/api/online/admin/runtime/drain", async (req, res) => {
    setOnlineNoStoreHeaders(res);
    const authorized = resolveAdminBearer(req);
    const rateLimitAllowed = await consumeRequestRateLimit("admin_read", req);
    if (!authorized) {
      log({
        event: "online.admin.runtime.drain",
        status: "rejected",
        reason: rateLimitAllowed ? "not_found" : "rate_limited_not_found",
      });
      res.status(404).json({ error: adminNotFoundError() });
      return;
    }
    if (!rateLimitAllowed) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many admin requests were sent too quickly." },
      });
      return;
    }
    try {
      const drainState = await runtimeCoordinator.startDrain({ reason: "operator" });
      log({ event: "online.admin.runtime.drain", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        runtime: {
          draining: drainState.draining,
          drainStartedAt: drainState.startedAt,
          nodeId: runtimeCoordinator.nodeId,
          capabilities: runtimeCoordinator.capabilities,
        },
      });
    } catch {
      console.error("Failed to start online runtime drain.");
      log({ event: "online.admin.runtime.drain", status: "failed", reason: "runtime_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Runtime drain could not be started." },
      });
    }
  });
```

- [x] **Step 2: Run green tests**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "operator runtime drain|drain route|reports drain health"
```

Expected: pass.

Observed: passed with the expanded focused set:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "operator runtime drain|drain route|reports drain health|rejects websocket player joins while draining|rejects websocket spectators while draining|routes HTTP fixed-window rate limits"
```

Result: 7 passed, 193 skipped.

- [x] **Step 3: Add and pass sanitized failure regression**

Added a regression that mocks `runtimeCoordinator.startDrain(...)` throwing a credentialed PostgreSQL URL and verifies the operator route returns:

```ts
{
  error: { code: "persistence_failed", message: "Runtime drain could not be started." },
}
```

Observed red: `response.json()` failed on Express' default HTML error response.

Observed green:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "sanitized failure"
```

Result: 1 passed, 199 skipped.

- [x] **Step 4: Add and pass review-driven hidden-auth rate-limit regression**

Review found that `consumeRequestRateLimit("admin_read", req)` was awaited before the hidden 404 path. Added a regression that forces `runtimeCoordinator.consumeRateLimit(...)` to throw a credentialed PostgreSQL URL, then verifies:

- missing auth returns hidden JSON 404
- wrong auth returns hidden JSON 404
- matched auth returns sanitized JSON 503
- `runtimeCoordinator.startDrain(...)` is not called
- response bodies do not contain the PostgreSQL URL, secret, or table name

Observed red:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "rate-limit storage fails before auth"
```

Result: failed on `response.json()` because Express returned its default HTML error response for the missing-auth case.

Observed green:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "rate-limit storage fails before auth"
```

Result: 1 passed, 200 skipped.

## Task 3: Roadmap, Review, Verification

- [x] **Step 1: Update roadmap evidence**

Add a new item 11 sub-slice paragraph to `docs/online-multiplayer-plan.md` after runtime startup cleanup ownership. Include: route path, hidden admin-token behavior, readiness effect, no reason exposure, tests run, reviewer dispositions, and remaining follow-ups.

- [x] **Step 2: Run focused and broad verification**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "operator runtime drain|drain route|reports drain health|rejects websocket player joins while draining|rejects websocket spectators while draining"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts server/__tests__/server-index-runtime.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all pass, with only the known Vite large-chunk warning or CRLF diff-check warnings if they already appear elsewhere.

Observed final verification:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "operator runtime drain|drain route|reports drain health|rejects websocket player joins while draining|rejects websocket spectators while draining|routes HTTP fixed-window rate limits"
```

Result: 8 passed, 193 skipped.

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts server/__tests__/server-index-runtime.test.ts
```

Result: 206 passed.

```bash
npx vitest run
```

Result: 135 files passed, 1 skipped; 1620 tests passed, 3 skipped.

```bash
npm run build
npm run server:build
npm run audit
git diff --check
```

Result: passed. `npm run build` emitted the existing Vite large-chunk warning. `git diff --check` emitted CRLF conversion warnings only.

- [x] **Step 3: Run code review and classify findings**

Review scope: route auth/hiding, rate limiting, reason/secret exposure, readiness side effect, existing WebSocket drain coverage, and roadmap accuracy.

Review dispositions:

- Accept: hidden 404 could be bypassed if rate-limit storage failed before auth rejection. Fixed by catching limiter failures, preserving hidden JSON 404 for missing/wrong auth, returning sanitized JSON 503 only after matched auth, and adding the regression above.
- Accept: re-review reported no remaining issues in the focused diff.
- Defer: live PostgreSQL failure rehearsal and persistent `online_runtime_nodes` drain rows remain future item 11 slices.

Ledger: appended a micro-reflection to `../codex-research-skills/cognitive_ledger.md` for the accepted auth-boundary ordering issue.

- [x] **Step 4: Commit and push**

Run:

```bash
git status --short
git add src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-operator-runtime-drain-route.md
git commit -m "Add operator runtime drain route"
git push
```

Observed: committed on `master` with message `Add operator runtime drain route` and pushed to `origin/master`.

## Status

- Slice selected: item 11 persistent/operator drain follow-up.
- Implementation status: route implemented, review findings fixed, final verification passed, committed and pushed.
