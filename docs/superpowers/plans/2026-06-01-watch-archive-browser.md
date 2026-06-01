# Phase 6B: Watch and Online Archive Browser

Status: implemented

Goal: add the first public discovery surface on top of existing online read models: a Watch/Online Archive browser that lists only public token-free summaries and hands off to the existing spectator flow.

Non-goals:

- Do not list private or unlisted games.
- Do not add public game creation, open seeks, matchmaking, accounts, ratings, chat, or moderation UI.
- Do not add mutable visibility changes until a durable visibility lifecycle event exists.
- Do not merge the online archive with the local saved-game library.

Reviewer input:

- Data/API reviewer recommended a small `Watch/Archive read-model browser with spectator handoff` using existing `/api/online/games`, `fetchOnlineGameSummaries`, `buildSpectatorUrl`, and App spectator parsing.
- UX reviewer recommended top-level Watch/Archive destinations, dense Lichess-inspired rows, real buttons/links, public/private language, and matchmaking explicitly deferred.

Implementation checklist:

- [x] Add component tests for empty, loading/error, active game rows, archived result rows, filters/search, and spectator handoff.
- [x] Add App navigation tests for opening Watch/Archive and clicking Spectate to enter `?onlineGame=<id>&view=spectator`.
- [x] Implement `OnlineGameBrowser` with Watch and Online Archive tabs, public-summary-only messaging, accessible row actions, and mobile-safe layout.
- [x] Add App view state, handlers, and navigation entries from setup/game drawer and relevant shell points.
- [x] Keep spectator handoff token-free and clear any stale player/challenge state.
- [x] Update docs roadmap and UI benchmark checklist with Phase 6B status.
- [x] Run focused tests.
- [x] Run code/UX review and fix Critical/Important findings.
- [x] Run full verification: `npm test`, `npm run build`, `npm run server:build`, `git diff --check`, and browser smoke/manual viewport checks.
- [x] Commit and push.

Acceptance:

- Users can open Watch/Online Archive from app navigation.
- Active public games appear under Watch, completed public games appear under Online Archive.
- Empty states are honest when no public games exist.
- Clicking Spectate opens the existing read-only spectator flow without any player token.
- Keyboard users can operate tabs, search, and row actions.
- Existing online create/join/spectate/resign smoke still passes.
