# Lobby Open Seeks Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Lichess-style public lobby slice: users can publish an open seek, other users can accept it into a real online game, creators can cancel or join after acceptance, and Watch/Archive remain separate.

**Architecture:** Open seeks are a separate pre-game lifecycle from private challenges and from game summaries. The lifecycle mirrors challenges with schema-versioned events and summaries; public listing mirrors the game directory with token-free bounded responses and opaque cursors. Accepting a seek atomically creates a normal online game and returns a private invite only in the accepting or creator-authenticated response.

**Tech Stack:** TypeScript, React, Express, PostgreSQL, Vitest, Playwright.

---

## Benchmark Notes

Lichess patterns to adopt:

- Put Lobby beside Watch and Archive as a dense online destination, not a marketing screen.
- Keep public rows token-free and fast to scan: clock, side preference, board/rules terms, and one clear action.
- Keep live board and clocks primary after a seek becomes a game.

Chess.com secondary patterns to adapt:

- Keep Start/Create and current open games close together.
- Avoid account/rating/chat UI until those contracts exist.

Castles-specific changes:

- Show board radius, clock, VP mode, sanctuary count, and side preference instead of chess ratings/time categories only.
- Keep private room, friend challenge, and open lobby seek as distinct play actions.
- Creator join/cancel uses a private creator token stored outside URLs; public seek listing never includes it.

## Files

- Create `src/online/seeks.ts`: open-seek event validation, summary projection, directory validation/cursors, lifecycle guards.
- Modify `src/online/server/OnlineGameStore.ts`: seek store contracts and accept result types.
- Modify `src/online/server/PostgresOnlineGameStore.ts`: seek tables, summary rebuild/list/load, creator credentials, transactional create/cancel/expire/accept.
- Modify `src/online/server/createOnlineHttpServer.ts`: seek memory fallback, HTTP routes, rate limits, expiry, game creation on accept.
- Modify `src/online/client.ts`: seek auth storage, client validators, create/list/fetch/cancel/accept helpers.
- Modify `src/components/OnlineGameBrowser.tsx`: add Lobby tab, open-seek rows, accept/cancel/create/refresh states.
- Modify `src/components/GameSetup.tsx`: add Create Lobby Seek play action.
- Modify `src/App.tsx`: own creator tokens, accept handoff, creator refresh/join, stale token cleanup.
- Modify CSS/tests/docs named below.

## Tasks

### Task 1: Seek Contract

- [x] Write failing `src/online/__tests__/seeks.test.ts` coverage for event validation, secret rejection, summary projection, seat binding, expiry, directory cursors, hidden token exclusion, and self-accept rejection.
- [x] Implement `src/online/seeks.ts` with schema constants, event factories, validators, projection, lifecycle guards, directory response validation, and cursor helpers.
- [x] Run `npm test -- src/online/__tests__/seeks.test.ts`.

### Task 2: Store and HTTP Contract

- [x] Write failing server tests in `src/online/server/__tests__/createOnlineHttpServer.test.ts` for seek create/list/fetch/cancel/accept, sensitive public query rejection, rate limiting, creator self-accept rejection, expiry, and double-accept conflict.
- [x] Write failing PostgreSQL store tests in `src/online/server/__tests__/PostgresOnlineGameStore.test.ts` for seek schema creation, credential hashing, public listing, transactional cancel, transactional accept creating exactly one game, and rollback on summary failure.
- [x] Extend `OnlineGameStore`, `PostgresOnlineGameStore`, and `createOnlineHttpServer`.
- [x] Run focused server/store tests.

### Task 3: Client and UI

- [x] Write failing client helper tests in `src/online/__tests__/client.test.ts` for seek storage, response validation, create/list/fetch/cancel/accept helpers, and token-stripped game handoff shape.
- [x] Write failing component/App tests in `src/components/__tests__/OnlineGameBrowser.test.tsx`, `src/components/__tests__/GameSetup.test.tsx`, and `src/__tests__/App.test.tsx` for Lobby tab, create seek, accept pending/error, creator cancel/refresh/join, token hygiene, stale-state cleanup, and mobile-safe long rows.
- [x] Implement client helpers and UI.
- [x] Run focused UI/client tests.

### Task 4: Review and Verification

- [x] Run backend/security reviewer on seek contracts, token exposure, race handling, and PostgreSQL transaction boundaries.
- [x] Run UI/UX/accessibility reviewer on Lobby tab placement, Lichess-inspired scan density, mobile layout, loading/error states, and focus/order.
- [x] Accept/fix/reject/defer findings explicitly.
- [x] Run `npm test`, `npm run build`, `npm run server:build`, `git diff --check`.
- [x] Run local online browser smoke and screenshot audit for desktop, tablet, 430 x 932, 390 x 844, and 360 x 640 Lobby/Watch/Archive states.
- [ ] Commit and push.

## Current Review Findings Incorporated

- Use a new seek model instead of extending private challenge visibility.
- Public seek directory must never include creator token, player token, credential hash, invite URL, or challenge data.
- Accept/cancel/expire races must produce exactly one terminal transition.
- Creator cannot accept their own seek in this anonymous/session v1.
- Accept must reuse the existing token-stripped `enterOnlineGameFromInvite` path.
- Watch remains live public games; Archive remains completed games; Lobby is open seeks.
- After this phase lands, start the full UI navigation and learning sweep: benchmark Lichess lobby/play/learn screens again, then fix the awkward sidebar/drawer shape, tutorial placement, return navigation, save/progress clarity, and any go-back/navigation overlap across desktop and mobile screenshots.
- Creator-owned seek state must survive same-session reload through an indexed `sessionStorage` record; creators need refresh/cancel/join controls after reloading, not just immediately after creation.
- Lobby needs a normal refresh action so accepting players can rescan open seeks without relying on tab changes or error retry.
- PostgreSQL public seek listing must filter expired open seeks before cursor/limit pagination so stale rows cannot hide live seeks behind the first page.

## Verification Notes

- `npm test`: 92 passed, 1 skipped; 872 tests passed, 3 skipped.
- `npm run build`: passed; Vite reported the existing large chunk warning.
- `npm run server:build`: passed.
- `git diff --check`: passed with line-ending warnings only.
- Browser online smoke passed against a temporary built-app server on `http://127.0.0.1:3225`.
- Screenshot/layout artifacts are in `artifacts/ui-audit/phase6h-after`; no horizontal overflow or overlapping interactive controls were detected in the audited states.
