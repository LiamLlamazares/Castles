# Missing Warm Room Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and TDD. Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected until the full item 11 readiness gate is met.

**Goal:** Advance item 11 by making player join/rejoin, account snapshot, and spectator entry points hydrate missing local warm rooms from the durable store before returning not-found responses.

**Architecture:** Warm rooms are cache entries, not the source of truth. If a request or socket message targets a game that passes the relevant access checks but is missing from the local `OnlineGameService`, the server must load the authoritative `OnlineGameRoomRecord` via `loadGameRoomRecord(gameId)`, validate and install it, then continue through the existing timeout/auth/snapshot path. If no loader exists, the loader fails, the record is missing, mismatched, or invalid, the server must fail closed and must not invent local state. This slice reuses the room-loader contract from the remote snapshot hint slice.

**Source of truth:** `docs/superpowers/specs/2026-06-15-multi-instance-online-runtime-design.md`, Warm Room State: “Joining, rejoining, account snapshot, and spectating must hydrate a room from the store if it is missing locally.”

**Non-goals:**

- Do not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`.
- Do not wire production to the PostgreSQL runtime-event coordinator.
- Do not add `LISTEN/NOTIFY`, shared operation gates, drain behavior, startup maintenance ownership, rate-limit semantic changes, or two-instance readiness claims.
- Do not add legacy fallback paths. If durable hydration is required and unavailable, fail closed.
- Do not change action authorization for stale local rooms; store-backed accepted-action and timeout paths remain the authority for mutation freshness.

---

### Task 1: Server Hydration Contract

Status: done on 2026-06-16.

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Add failing HTTP join/spectate tests**

Add tests proving:

- `GET /api/online/games/:gameId` hydrates a missing local room from `loadGameRoomRecord`, authenticates the bearer token against the hydrated room, and returns the authoritative snapshot.
- `GET /api/online/games/:gameId/spectator` hydrates a missing local room only after spectator access succeeds and returns the authoritative snapshot.

- [x] **Step 2: Verify red**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "missing warm room"
```

Expected and observed: failed because the HTTP paths still returned not-found when the local room map was missing the game.

- [x] **Step 3: Implement minimal HTTP hydration helper**

Add a shared helper that:

- checks `service.getRoom(gameId)` first;
- requires `options.loadGameRoomRecord` only when the local room is missing;
- loads and validates `record.gameId === gameId`;
- installs the record with `service.replaceRoom(record)`;
- logs structured `online.room.hydrate` accepted/failed events without raw tokens;
- fails closed on missing loader, load failure, missing record, mismatched record, or invalid record.

Wire the helper into HTTP player snapshot and HTTP spectator snapshot paths before the current not-found responses.

### Task 2: Socket and Account Hydration

Status: done on 2026-06-16.

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Add failing socket/account tests**

Add tests proving:

- WebSocket `join` hydrates a missing local room, authenticates against the hydrated room, and sends `joined`.
- WebSocket `spectate` hydrates a missing local room after spectator access succeeds and sends `spectating`.
- `GET /api/online/account/games/:gameId/snapshot` hydrates a missing local room after account participant checks and returns the account snapshot.
- `POST /api/online/account/games/:gameId/rejoin` hydrates a missing local room before adding the fresh durable seat credential.

- [x] **Step 2: Verify red**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "missing warm room"
```

Expected and observed: failed on the newly added paths until the helper was wired everywhere.

- [x] **Step 3: Wire helper into socket/account paths**

Use the helper in:

- HTTP player snapshot;
- HTTP account snapshot;
- HTTP account rejoin;
- HTTP spectator snapshot;
- WebSocket `join`;
- WebSocket `spectate`.

Preserve existing rate limits, query guards, summary/access checks, timeout adjudication, credential pruning, and response shapes.

### Task 3: Review, Verification, Roadmap, Commit

Status: done on 2026-06-16.

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-16-missing-warm-room-hydration.md`

- [x] **Step 1: Review**

Run code review focused on:

- durable store authority before missing-warm-room not-found responses;
- access checks before spectator/account hydration;
- token/log hygiene;
- no legacy fallback behavior;
- no multi-instance readiness overclaiming;
- preserving existing single-node and in-memory behavior when rooms are already warm.

Classify findings before applying changes.

Review dispositions:

- Accepted and fixed: account rejoin hydration test used `toBeDefined()` even though `OnlineGameService.getRoom()` returns `null` for a miss; tightened to `not.toBeNull()`.
- Added guard coverage for loader failure, token-free hydrate logs, and no hydration before spectator/account access checks pass.
- Ledger: appended a micro-reflection to `codex-research-skills/cognitive_ledger.md` for weak invariant assertion strength.

- [x] **Step 2: Final verification**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

No browser screenshots are required unless UI-visible behavior changes beyond existing HTTP/WebSocket responses.

Observed verification:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "missing warm room"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

Results: all commands passed. `npm run build` retained the existing large-chunk warning, and `git diff --check` retained CRLF conversion warnings only.

- [x] **Step 3: Roadmap update**

Record this as a completed item 11 sub-slice only after review and verification pass, including exact commands and non-goals.

- [x] **Step 4: Commit and push**

Run during final handoff:

```bash
git status --short
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-missing-warm-room-hydration.md src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts
git commit -m "Hydrate missing online rooms from store"
git push origin HEAD:online-action-log
```
