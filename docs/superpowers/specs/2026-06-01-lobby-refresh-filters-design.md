# Lobby Refresh And Filters Design

## Goal

Make the open-seek Lobby feel alive and easier to scan without adding accounts, chat, ratings, or legacy compatibility.

## Scope

- Public open-seek directory filters: creator side, clock type, and victory-points mode.
- Filters apply on the server before cursor pagination so filtered results do not disappear behind the first unfiltered page.
- Filter semantics are exact: `creatorSeat` supports `w`, `b`, and `random`; `clock=timed` means `setup.timeControl` exists; `clock=casual` means `setup.timeControl` is missing; `vp=enabled` means `setup.gameRules.vpModeEnabled === true`; `vp=disabled` means `gameRules` is missing or `vpModeEnabled !== true`.
- The public seek directory remains token-free and rejects sensitive query keys or values.
- The Lobby shows when it was last checked and auto-refreshes every 30 seconds only while the Lobby tab is active and the document is visible.
- Creator-owned seeks also auto-refresh every 30 seconds while open, using the existing bearer-only owner endpoint so the creator can see when a seek is accepted without pressing Refresh.
- Auto-refresh backs off for at least 60 seconds after a rate-limit response and keeps the explicit manual Refresh button available.
- Mobile acceptance criteria: at 430 x 932, 390 x 844, and 360 x 640, Lobby tabs, Refresh/Create, three filters, Search, freshness text, rows, and owner panels must not horizontally overflow or overlap; buttons and select text must fit; rows must stay reachable by scrolling.

## Non-Goals

- No account presence, usernames, chat, ratings, matchmaking automation, or real heartbeat presence.
- No database migration for extra indexed columns yet; Phase 6J can filter PostgreSQL summaries through validated JSON payload fields.
- No side-selection setup UI yet. Existing seek creation may still default to random creator side.

## Architecture

Seek filters become part of `OpenSeekDirectoryListOptions` in `src/online/seeks.ts`, mirrored by `FetchOpenSeekDirectoryOptions` in `src/online/client.ts`, parsed by `GET /api/online/seeks`, and applied by both in-memory and PostgreSQL list paths before cursor and limit. PostgreSQL predicates must be parameterized JSONB predicates over `payload`; do not use `payload::text LIKE` or string-built SQL.

The React Lobby keeps its current row and owner-panel structure. It adds compact filter controls, filtered-empty copy, last-checked status text, and interval-based refresh guarded by active tab, document visibility, and in-flight request state.

Background refresh is non-disruptive. It must not clear the visible list during refresh or background failure, must not repeatedly announce `Loading...` through `aria-live`, must not start overlapping requests, and must run once when the document becomes visible again while the Lobby tab is active.

## Safety Rules

- Public directory responses must still validate through `validateOpenSeekDirectoryResponse`.
- Query parsing must continue rejecting duplicate params and secret-like query names/values.
- Allowed new query params must also reject secret-looking values, and unknown secret-looking params must return sanitized errors that do not echo secrets.
- Cancel/accept row pending state must not be cleared by background refresh.
- If a background refresh replaces or omits a row with a pending accept/cancel action, the pending disabled affordance must remain until that action resolves, and keyboard focus must not be forced to an unrelated control.
- Auto-refresh must not run while the browser tab is hidden.
- UI copy must describe this as checking/refreshing, not true player presence.
- Empty and filtered-empty copy must say the list was checked/refreshed, not that players are online, present, waiting, or ready in real time.
