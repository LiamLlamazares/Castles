# Two-Instance Runtime Characterization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local two-server characterization coverage for the already implemented runtime coordinator/store seams while keeping `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.

**Architecture:** Create a small Vitest harness that starts two real `createOnlineHttpServer` instances with separate in-process warm-room services but shared test runtime stores. Use real HTTP/WebSocket traffic for join, spectate, player action, and live spectator count checks, and exercise remote runtime polling through the coordinator seam. Keep the harness test-only; do not add multi-instance production mode in this slice.

**Tech Stack:** TypeScript, Vitest, `ws`, existing `createOnlineHttpServer`, `OnlineGameService`, `createPostgresCompositeRuntimeCoordinator`, test-only in-memory runtime event and spectator-presence stores.

---

## Scope

- Add a two-server test harness under `src/online/server/__tests__/`.
- Prove a spectator connected to node B receives an authoritative snapshot after a player action on node A once node B polls the shared runtime event outbox.
- Prove spectator counts are shared across the two nodes through the shared spectator-presence store and disappear after the spectator socket closes.
- Keep all runtime metadata in single-node mode and do not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`.
- Update `docs/online-multiplayer-plan.md` with the new characterization evidence.

## Non-Goals

- No production `multi-instance` mode.
- No LISTEN/NOTIFY.
- No real PostgreSQL fixture in this slice; the harness uses deterministic in-memory stores to characterize the server/coordinator contract quickly.
- No UI or screenshot changes.
- No Quick Match/challenge/open-seek race tests in this slice; those remain follow-up two-instance cases.

## Files

- Create: `src/online/server/__tests__/twoInstanceRuntimeHarness.ts`
- Create: `src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts`
- Modify: `docs/online-multiplayer-plan.md`
- Modify: this plan file

## Task 1: Red Test For Two-Server Runtime Harness

- [x] **Step 1: Write the failing test shell**

Create `src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts` that imports `createTwoInstanceRuntimeHarness` from `./twoInstanceRuntimeHarness` and declares:

```ts
it("fans out player actions from one server to a spectator on another server after runtime polling", async () => {
  const harness = await createTwoInstanceRuntimeHarness({ gameId: "game_two_instance_action" });
  try {
    const game = await harness.createGameOnNodeA();
    const spectator = await harness.spectateOnNodeB(game.gameId);
    const player = await harness.joinWhiteOnNodeA(game);
    const spectatorCount = await harness.fetchPublicGameOnNodeA(game.gameId);

    expect(spectatorCount.livePreview?.spectatorCount).toBe(1);

    const broadcast = harness.nextSpectatorMessage(spectator, "cross-node action broadcast");
    await harness.sendWhiteAction(player, game, {
      type: "PASS",
      baseVersion: 0,
    });
    await harness.pollNodeBRuntimeEvents();

    await expect(broadcast).resolves.toMatchObject({
      type: "snapshot",
      snapshot: { gameId: game.gameId, version: 1 },
    });
  } finally {
    await harness.close();
  }
});
```

- [x] **Step 2: Run the red test**

Run:

```bash
npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts
```

Expected: fail because `./twoInstanceRuntimeHarness` does not exist.

Observed: failed because `./twoInstanceRuntimeHarness` did not exist.

## Task 2: Implement Test Harness

- [x] **Step 1: Create `twoInstanceRuntimeHarness.ts`**

Implement test-only helpers:

- `InMemoryRuntimeEventStore` implementing `OnlineRuntimeEventStore`.
- `InMemorySpectatorPresenceStore` implementing `OnlineRuntimeSpectatorPresenceStore`.
- `createTwoInstanceRuntimeHarness({ gameId })`.

The harness should:

- Build two `OnlineGameService` instances with distinct node labels and stable tokens.
- Build two `createPostgresCompositeRuntimeCoordinator(...)` instances sharing the same event/presence stores.
- Start two `createOnlineHttpServer(...)` servers on random local ports.
- Persist node A room records and summaries into a shared `Map` after creation and after store-backed actions.
- Supply node B `loadGameRoomRecord` and summary loaders from that shared map.
- Use real WebSocket `join`, `spectate`, and `action` messages with `ONLINE_PROTOCOL_VERSION`.
- Close all sockets and HTTP servers in `close()`.

- [x] **Step 2: Run the focused test**

Run:

```bash
npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts
```

Expected: pass after harness implementation.

Observed: after harness fixes for production-style hashed token verification and durable room recreation, `npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts` passed with the first test.

## Task 3: Add Presence Cleanup Characterization

- [x] **Step 1: Add a second red assertion/test**

Add a test proving node A sees node B's spectator count as `1`, then `0` after the spectator socket closes:

```ts
it("shares live spectator counts across server instances and removes them on close", async () => {
  const harness = await createTwoInstanceRuntimeHarness({ gameId: "game_two_instance_presence" });
  try {
    const game = await harness.createGameOnNodeA();
    const spectator = await harness.spectateOnNodeB(game.gameId);

    await expect(harness.fetchPublicGameOnNodeA(game.gameId)).resolves.toMatchObject({
      livePreview: { spectatorCount: 1 },
    });

    await harness.closeSocket(spectator);

    const afterClose = await harness.fetchPublicGameOnNodeA(game.gameId);
    expect(afterClose.livePreview?.spectatorCount).toBeUndefined();
  } finally {
    await harness.close();
  }
});
```

Run the test before any helper changes needed for socket-close waiting.

- [x] **Step 2: Implement missing close/wait helper if needed**

Add `closeSocket(socket)` to the harness if the red test exposes that socket removal is not awaited.

Observed: the second test failed with `spectatorCount` still `1` after the client-side close event. The harness close helper now waits until shared spectator presence drops before continuing.

- [x] **Step 3: Run focused tests**

Run:

```bash
npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts
```

Expected: both tests pass.

Observed: `npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts` passed with 2 tests.

## Task 4: Docs And Review

- [x] **Step 1: Update the roadmap**

Add an Item 11 sub-slice entry to `docs/online-multiplayer-plan.md`:

- two-server harness added;
- proves node A player action can reach node B spectator after node B polls runtime events;
- proves shared spectator presence appears in node A public summary and clears after node B socket close;
- still not multi-instance readiness, because Quick Match/challenge/open-seek race cases, rolling drain, production smoke, and real PostgreSQL two-process rehearsal remain.

Observed: added the Item 11 two-instance runtime characterization entry to `docs/online-multiplayer-plan.md`, with explicit follow-up gaps and no claim that multi-instance production mode is ready.

- [x] **Step 2: Run code review**

Request a reviewer focused on:

- whether the harness uses real HTTP/WebSocket server behavior rather than mocked internals;
- whether token/credential values leak into logs/docs;
- whether the test overclaims multi-instance readiness;
- whether close/cleanup is deterministic.

- [x] **Step 3: Record dispositions**

Classify review findings as accept/reject/investigate/defer in this plan file.

Review dispositions:

- Accept: the original architecture summary overstated the network boundary by listing runtime-event polling with HTTP/WebSocket traffic. Fixed the wording to say create/join/spectate/action/summary flows use real HTTP/WebSocket traffic while remote polling is exercised through `pollRemoteGameSnapshotChangedEvents(...)` on the coordinator seam.
- Defer: future multi-spectator characterization may need per-connection close waiting instead of the current total-count decrease helper. The current two tests each use one spectator, and the helper is deterministic for that scope.

## Task 5: Verification, Commit, Push

Run:

```bash
npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts
npm run server:build
npm run audit
git diff --check
```

Focused verification before review:

- `npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts` passed with 2 tests.
- `npm run server:build` passed.

Run broader checks if production code changes:

```bash
npx vitest run
npm run build
```

No browser screenshots are required because this slice is backend/runtime characterization only.

Final verification evidence:

- `npx vitest run src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts` passed with 2 tests.
- `npx vitest run` passed with 135 files passed, 1 skipped; 1608 tests passed, 3 skipped.
- `npm run build` passed with the existing large-chunk warning.
- `npm run server:build` passed.
- `npm run audit` passed with 0 vulnerabilities.
- `git diff --check` passed with only the existing CRLF conversion warning for `docs/online-multiplayer-plan.md`.
- Browser screenshots were not required because this slice is backend/runtime characterization only.

Commit and push:

```bash
git add docs src/online/server/__tests__/twoInstanceOnlineRuntime.test.ts src/online/server/__tests__/twoInstanceRuntimeHarness.ts
git commit -m "Add two-instance runtime characterization"
git push origin master
```
