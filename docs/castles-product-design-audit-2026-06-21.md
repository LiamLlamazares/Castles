# Castles Product Design Audit - 2026-06-21

Status: design document for Liam review and roadmap conversion.

## Objective

This audit compares the current Castles production experience with Lichess-style account, play, profile, learning, watch, and tools patterns, then turns the useful parts into Castles-specific recommendations.

The goal is not to clone Lichess. Castles should remain a focused, clean strategy game: board-first, low-noise, and free from generic app-style retention mechanics. Notifications, messages, sign-in nags, streaks, profile completion prompts, and broad social feeds are treated as explicit non-goals unless Liam reopens them.

## Evidence

Fresh screenshot packet:

- `artifacts/product-design-audit/2026-06-21/manifest.json`
- `artifacts/product-design-audit/2026-06-21/castles-production-game-clean-desktop.png`
- `artifacts/product-design-audit/2026-06-21/castles-production-online-clean-desktop.png`
- `artifacts/product-design-audit/2026-06-21/castles-production-public-profile-desktop.png`
- `artifacts/product-design-audit/2026-06-21/castles-production-menu-clean-mobile.png`
- `artifacts/product-design-audit/2026-06-21/castles-production-online-clean-mobile.png`
- `artifacts/product-design-audit/2026-06-21/lichess-current-home-desktop.png`
- `artifacts/product-design-audit/2026-06-21/lichess-current-profile-desktop.png`
- `artifacts/product-design-audit/2026-06-21/lichess-current-tv-desktop.png`
- `artifacts/product-design-audit/2026-06-21/lichess-current-learn-desktop.png`
- `artifacts/product-design-audit/2026-06-21/lichess-current-analysis-desktop.png`

Existing baseline:

- `docs/lichess-castles-ui-audit-2026-06-14.md`
- `docs/online-multiplayer-plan.md`, especially item 13 and the 2026-06-20 profile, recovery, rating graph, avatar upload, and rollout notes.
- Existing item 13 evidence under `artifacts/profile-recovery-slice/2026-06-20/`, `artifacts/profile-public-rating-graph/2026-06-20/`, and `artifacts/profile-polish/2026-06-20/`.

## Current Assessment

Castles is much closer to the desired account/profile baseline than the first Lichess comparison showed. The profile/dashboard slice, public profile URLs, player search, rating graphs, avatar upload, profile-owned privacy/security settings, password guidance, and safe recovery copy have resolved the main "I signed in but where is my account?" blocker.

The next product problem is information architecture, not missing backend primitives. Online is still carrying lobby, watch, archive, setup recovery, search/discovery, and account-adjacent workflows. That makes it feel more like a command center than a clear play surface. Lichess is useful here because its major destinations are obvious, but its full social/news/tournament density is too much for Castles' intended feel.

## Design Principles

1. Board-first: the primary experience is playing and understanding Castles, not managing a social account.
2. Quiet service layer: account, profile, ratings, history, challenges, and recovery should exist, but they should stay calm and contextual.
3. Lichess for structure, not scope: copy clear navigation patterns, not forums, teams, blogs, walls, public feeds, or notification loops.
4. Direct next actions: empty states should offer concrete actions such as configure setup, create lobby, continue game, challenge player, review game, or learn next rule.
5. Privacy before discovery: broad public discovery should wait for clear moderation, blocking, reporting, retention, and data exposure rules.
6. No ambient pressure: do not add sign-in nags, daily prompts, streaks, achievements, profile completion, push/email notifications, or generic engagement copy.

## Council Findings

| Reviewer Lens | Strong Findings | Main Risks | Disposition |
| --- | --- | --- | --- |
| Lichess-pattern product review | Profile/dashboard blocker is closed; persistent Profile destination is right; Lichess route clarity is useful. | Copying Lichess social density would overload Castles and increase policy/moderation needs. | Accept structure; reject broad clone. |
| Engineering/architecture review | Existing account, ratings, games, search, and archive primitives are enough for the next UI slices. | Public profile games currently lean on broad archive search; avatar/search payloads and deletion policy need tighter contracts before scale. | Accept as architecture follow-ups. |
| UI/engagement review | Board-first play, Profile Settings ownership, Learn, and rating graph direction are strong. | Online remains too broad; empty states and profile CTAs could better lead to play. | Accept as next product slice candidates. |
| Quiet-retention review | Challenge recovery, rematch, continue game, archive replay, and next tutorial are acceptable when contextual. | Noisy notifications, profile completion, streaks, DMs, feeds, and sign-in nags would damage the intended feel. | Accept quiet contract; reject noisy mechanics. |

## Confidently Good

- First-class Profile route and shareable public profile pages.
- Profile Settings owning privacy, avatar, password/security, sessions, and delete-account controls.
- Sanitized public profile/search/rating payloads with no raw account ids, tokens, session ids, private links, or rating-engine internals.
- Rating graph and rating history as factual game records, including provisional `1500?` and low-game states.
- Bounded avatar upload with file type and size limits.
- Safe password recovery copy: Google-linked accounts use Google sign-in; password-only accounts do not get unauthenticated resets until a verified recovery channel exists.
- Public profile wording such as `Presence private`, which explains privacy without implying a broken status.
- Local Library and Online Archive remaining distinct.
- Learn/Tutorial as a real destination with progress, not just a one-time modal.
- Count-only challenge recovery and account badges when tied to real pending/accepted game actions.
- No private messages, public walls, public comments, teams, forums, blogs, or profile bios in the current beta scope.

## Main Gaps

### P1: Route Ownership And IA

Online still owns too many concepts. Recommended ownership:

| Destination | Owns | Should Not Own |
| --- | --- | --- |
| Play | Board setup, local play, AI/bot play, "play online from this setup" handoff. | Account privacy/security settings. |
| Online | Lobby listings, public live games, public archive, online recovery. | People/account management as a dense control panel. |
| Profile | Self dashboard, public player pages, ratings, games, avatar, settings, security, sessions. | Public feed or social wall. |
| Community/People, optional future route | Player search, following, challenge actions, leaderboards, reports. | Privacy/security controls, profile identity settings. |
| Library | Local saved games and local exports/imports. | Public database/archive semantics. |
| Tools, optional future route | Analysis/replay tools and possibly Castles-specific database exploration. | Chess-like opening explorer unless Castles has a stable opening/domain model. |

The current top-level `Play`, `Tutorial`, `Online`, `Profile`, and `Library` set is understandable. The next IA improvement is not more tabs; it is clearer separation inside Online and Profile, with People/search either owned by Profile or promoted only when it is small and useful.

### P1: Online Should Become Less Of A Command Center

The clean production Online screenshot is functional, but it still combines Lobby, Watch, Archive, setup recovery, filters, search, empty states, and account affordances. The right next step is not to add more cards; it is to make each Online mode more decisive.

Recommended changes:

- Keep the Lobby/Watch/Archive tabs, but make their primary action clear and visible.
- Add "Play online from current setup" from Play into Lobby so setup and online entry feel connected.
- Keep setup-needed states, but make them smaller and action-led.
- Keep filters collapsed or secondary when there is no data.
- Keep archive search factual; profile-owned player history should feel like player history, not the entire public database.
- Keep challenge and account security out of Online when they are not directly part of an online action.

### P1: Public Profiles Need Play-Centered Actions

Public profiles now show identity, games, rating graph, and privacy-safe presence. That is a good baseline. The missing Lichess-like value is contextual action near the header.

Add only actions that help play or review:

- Challenge player, if viewer is signed in and allowed.
- Follow/unfollow, if signed in and allowed.
- Watch live game, if the player is currently in a public visible game.
- Analyze recent public game.
- Rematch, only from a shared completed game and only when authorized.

Do not add:

- Wall posts.
- Bios/status messages.
- Direct messages.
- Public activity feed.
- Profile completion.
- Online-now social pressure outside the relevant panel.

### P1: Empty States Should Convert To Useful Actions

Many empty states are clear but passive. Prefer direct actions over explanatory copy.

Examples:

- No lobby listings: offer configure setup or create listing from current setup.
- No public games: offer watch archive or start a public game.
- No rated games: offer create rated lobby, challenge a player, or learn rating basics.
- No profile games: offer start a rated game or view public archive.
- No followed players: offer search players, not "grow your network" style copy.

This preserves a quiet feel while making the app easier to use.

### P1/P2: First-Run And Learning Flow

The clean screenshots show the board-first experience is strong once prompts are dismissed. The risk is stacking too much onboarding at first run.

Recommended shape:

- One contextual first-run prompt at a time.
- Direct entry points: Play a guided setup, Learn the rules, Open Profile if signed in.
- Suppress onboarding on direct challenge, spectator, archive, and profile links.
- Consider a guided mini-match or first objective that creates one satisfying decision quickly.
- Do not add recurring sign-in prompts, tutorial nagging, streaks, or daily tasks.

### P1/P2: Data And Contract Follow-Ups

These are not visible UI features, but they reduce future product risk.

- Add a dedicated public profile games endpoint instead of relying on broad public archive substring search.
- Define avatar payload budgets for public profile, search, and leaderboard surfaces.
- Tighten search semantics before broader discovery: bounded prefix/fuzzy search, pagination, and scale-aware indexes.
- Make deletion/tombstone policy explicit in the user-facing account area and operator docs.
- Define rating policy for leaderboards: provisional display, minimum games, inactive accounts, and future rating pools.
- Keep archive replay repair, but document that it is replay/analysis, not a full Lichess-style move tree yet.

### P2: Moderation And Public Discovery

Broader public discovery should not expand much further until a minimal moderation policy exists.

Needed before more public/social reach:

- Public abuse policy.
- Report queue operating procedure.
- Account sanction states and appeal policy, even if simple.
- Blocking/reporting behavior defined for public profiles, games, search, challenges, and leaderboards.
- Clear decision on whether deleted accounts leave historical display-name snapshots.

### P2/P3: Watch, Tools, And Database

Castles should eventually have stronger Watch and Tools surfaces, but not by cloning Lichess too early.

Watch next step:

- Better focused spectator browsing for live public games.
- Friend/followed-player filters only if they are functional and quiet.
- Defer TV-like ranking/category rails until there is enough public game volume.

Tools/database next step:

- Keep analysis/replay strong.
- Build a Castles-specific public game database only when archive queries and replay metadata are stable.
- Do not add a chess-style opening explorer unless Castles has a deterministic opening/position taxonomy worth exploring.

### P2: Mobile Polish

The mobile menu is clear, but Online becomes vertically dense quickly.

Recommended:

- Keep mobile top actions compact and icon-led.
- Avoid search controls in cramped top-right profile layouts; move them below the profile header or into a drawer.
- Ensure Settings and password/security controls remain reachable without hidden overflow.
- Keep tabs touch-sized but avoid consuming the whole first viewport with filters.

## Explicit Non-Goals

Do not build these without a separate product decision:

- Sign-in nags or general "create an account" prompts outside features that genuinely require an account.
- Push notifications, email notifications, desktop notifications, or mobile-app style reminders.
- Daily rewards, streaks, XP, achievements, profile completion, badges, or "level up" language.
- Direct messages, chat, inbox-style social notifications, public feeds, public walls, profile comments, bios, teams, clubs, forums, blogs, or studies.
- Broad presence surfaces that make users feel watched.
- Opponent-identifying alerts outside the relevant game/challenge/profile panel.
- News/tournament/content density copied from Lichess home.
- Opening explorer clone before a Castles-specific database model exists.

## Candidate Implementation Slices

| Order | Slice | Outcome | Evidence Gate |
| --- | --- | --- | --- |
| 1 | Online IA cleanup | Lobby/Watch/Archive each has one clear primary action; setup recovery is smaller; account/security stays in Profile. | Desktop/mobile screenshots, focused UI tests, review dispositions. |
| 2 | Public profile actions | Challenge/follow/watch/analyze/rematch CTAs appear only when authorized and useful. | Public/self/signed-out screenshots, privacy tests, link tests. |
| 3 | Profile games contract | Public profile Games tab uses a dedicated endpoint instead of broad archive text search. | API tests, no-leak tests, public profile screenshot. |
| 4 | Quiet first-run flow | First-run prompt is contextual, non-stacked, and suppresses on direct links. | Browser screenshots for first-run, direct challenge, profile, archive, mobile. |
| 5 | Empty-state action pass | Empty states offer direct actions without motivational or noisy copy. | Screenshot review across Online/Profile/Library/Learn. |
| 6 | Moderation readiness doc | Minimal abuse/report/block/sanction/deletion policy exists before broader discovery. | Policy doc, route impact checklist, reviewer pass. |
| 7 | Rating/leaderboard policy | Provisional/minimum-games/inactive display rules are explicit and tested. | Unit/API tests, leaderboard screenshots. |
| 8 | Tools/database discovery design | Decide whether Castles needs a public game database and what metadata it should expose. | Design doc with examples and rejected Lichess-clone scope. |

## Open Decisions For Liam

1. Should People become a small top-level Community/People route, or stay split between Online and Profile until there is more player volume?
2. What is the minimum rated-game count for leaderboard eligibility?
3. Should deleted accounts retain historical display names in public game records forever, or should a future anonymization migration exist?
4. Should first-run include a guided mini-match, or is the current Tutorial destination enough once prompt stacking is reduced?
5. Should public profile Games be prioritized before more public profile CTAs?
6. Should Castles ever have public bios/walls/teams/messages, or should those remain out of scope permanently?

## Recommended Roadmap Update

Add a new roadmap item after item 13:

> Product design and IA refinement: keep the completed profile/dashboard/account foundation, then reduce Online density, add quiet play-centered profile actions, tighten public profile game contracts, improve first-run and empty states without app-like notifications, and define moderation/rating/public-discovery policies before expanding social surfaces.

Acceptance criteria:

- No new noisy notification or engagement mechanism is added.
- Online is easier to scan on desktop and mobile.
- Profile pages lead to play/review actions without becoming social feeds.
- Empty states point to direct next actions.
- Public discovery contracts remain sanitized and scale-aware.
- Review findings are classified as accept/reject/investigate/defer.

## Review Dispositions

Accepted:

- Castles should copy Lichess' route clarity, profile discoverability, and public profile usefulness.
- Castles should keep the profile/dashboard/account foundation and use it as the owner of settings/security/privacy.
- Online should be simplified around Lobby, Watch, and Archive rather than absorbing more account/social controls.
- Retention should be limited to contextual play recovery and learning continuation.
- Public profiles should get authorized play/review CTAs, not social-feed features.

Rejected:

- Copying Lichess teams, studies, forums, blogs, public walls, bios, DMs, profile completion, news density, or broad activity feed.
- Adding sign-in nags, push/email notifications, streaks, daily tasks, achievements, or generic engagement loops.
- Exposing broad presence or private social state outside relevant, authorized panels.

Investigate:

- Whether People deserves a separate top-level destination.
- Whether a guided mini-match would improve first-run without feeling like onboarding clutter.
- What a Castles-specific public game database should mean.
- Leaderboard eligibility and rating-pool policy.

Deferred:

- Full TV-style spectator mode.
- Opening/database tooling.
- Public social/community features.
- Verified email/password recovery until a durable recovery channel is added.
