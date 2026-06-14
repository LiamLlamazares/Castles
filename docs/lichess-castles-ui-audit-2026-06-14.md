# Lichess vs Castles UI Audit - 2026-06-14

Status: draft for Liam review/sign-off.

## Evidence

Primary screenshot set: `artifacts/lichess-castles-audit/2026-06-14/`

Important limitation: the tool-visible Castles browser remained signed out, but Liam provided a signed-in Edge screenshot. This report treats `castles-user-signed-in-game.png` as the signed-in evidence and uses direct browser/Playwright captures plus existing repo screenshots for other surfaces.

Current uncommitted implementation draft: `docs/online-multiplayer-plan.md`, `src/components/OnlineAccountControls.tsx`, and `src/components/OnlineGameBrowser.tsx` contain interrupted self-profile access edits from before this audit. Those edits are not treated as completed baseline.

Screenshots reviewed:

- `castles-user-signed-in-game.png` - Liam's signed-in Castles game-page screenshot.
- `castles-production-home-signed-out.png` - production first-run/game surface, signed out.
- `lichess-home.png` - Lichess home/play lobby benchmark.
- `lichess-profile-ruslanschandorf.png` - Lichess profile/dashboard benchmark.
- `lichess-tv.png` - Lichess watch/TV benchmark.
- `lichess-learn.png` - Lichess learn benchmark.
- `desktop-online-lobby-row-actions.png` - Castles online Lobby row/audit state.
- `game-row-profile-card-desktop.png` - Castles profile/following/social card state.
- `online-now-rail-desktop.png` - Castles followed-player online rail.
- `challenge-inbox-desktop-final-all.png` - Castles challenge inbox.
- `desktop-online-account-archive-history.png` and `archive-detail-desktop.png` - Castles account/archive history states.
- `desktop-online-account-chip.png`, `desktop-online-account-dialog.png`, `production-online-account-dialog-desktop.png` - Castles account entry states.
- `desktop-tutorial-overview.png`, `lichess-learn.png` - learning/progress comparison.

## Executive Findings

Castles has many of the backend and product ingredients for a Lichess-like account ecosystem: Google sign-in, account archive, follows, presence, profile cards, rating summaries, challenge inbox, public watch/archive, and lobby listings. The largest gap is not backend capability; it is information architecture. Lichess makes the signed-in user profile, ratings, activity, games, and social entry points obvious from persistent navigation. Castles currently hides account/profile value behind small chips, account dialogs, Online/People panels, and row-level actions.

The most important corrective direction is to add a clear account/profile/dashboard route and simplify the Online/People surface around that route. Avoid cloning Lichess' full feature set immediately; adopt the structure and discoverability, not every module.

## Comparison Matrix

| Area | Lichess Pattern | Castles Current Behavior | Finding | Proposed Decision | Priority |
|---|---|---|---|---|---|
| Signed-in profile access | Username/avatar is persistent in the top bar and opens a profile/dashboard. | Signed-in account appears as a small chip in the game sidebar; the account dialog mostly exposes sign-out/session controls. | Users can be signed in without knowing how to reach profile/account info. Liam hit this directly. | Accept: add an explicit "View Profile" / "My Profile" entry from account chip, game sidebar chip, and Online top strip. | P1 |
| Account dashboard | Profile has ratings, games, activity, teams, profile info, and actions in one place. | Account data is split across account dialog, People, Archive, Challenge inbox, and row actions. | Castles has profile primitives but no coherent "my account" destination. | Accept: create a v1 Account/Profile page using existing sanitized data: display name, rating summary, account games, active games, following, challenge shortcuts, privacy/session links. | P1 |
| Profile richness | Lichess profile shows rating categories, games, activity timeline, member info, teams, and tools. | Castles profile card shows display name, presence, relationship, rating badge, actions, and history/challenge shortcuts. | Castles profile is functional but reads as a contact card, not a player dashboard. | Accept partially: add structured profile sections; defer bios, avatars, public walls, teams, and freeform text. | P2 |
| Rating display | Ratings are first-class in side rail and profile. | Rating mode and beta rating summaries exist but are scattered in rows/leaders. | Existing rating work lacks a home that communicates player strength/provisional state. | Accept: add rating summary cards to profile/dashboard; keep detailed graphs deferred until rating volume exists. | P2 |
| Activity timeline | Lichess profile makes recent play/study activity obvious. | Castles account archive exists, but there is no timeline. | Missing route-level summary of "what have I done recently?" | Investigate: derive a bounded activity feed from existing account game/challenge events without exposing private data. | P2 |
| Game-page account signal | Lichess game pages keep global nav/profile available. | Castles game page focuses on board/sidebar; account chip is a small player identity button. | Account identity is present but not discoverable as a navigation affordance. | Accept: rename/tooltip signed-in chip as account/profile action and add same action in menu. | P1 |
| Top navigation density | Lichess top nav is compact and stable: Play, Puzzles, Learn, Watch, Community, Tools, profile. | Castles uses sidebar/drawer plus top strip variations; first-run game view has no persistent top-level account/profile dashboard signal. | Castles can feel like separate tools rather than one service. | Accept: define persistent service-level nav destinations: Play, Learn, Online, Library, Profile. | P1 |
| First-run onboarding | Lichess home immediately exposes play modes while learn is visible. | Castles first-run overlay strongly blocks the game and duplicates tips/modal layers. | Good educational intent, but visually heavy and competes with gameplay/account access. | Accept: make first-run overlay lighter and make "Set Up Game" / "Learn" / "Profile" paths more explicit after sign-in. | P2 |
| Play/lobby affordance | Lichess home has immediate quick pairing grid plus create lobby/challenge/computer actions. | Castles Play setup is richer but more configuration-heavy; Online lobby can require setup before actions. | Castles needs setup complexity, but should surface "play now" paths more clearly. | Accept: preserve setup controls but add a concise "Play online from this setup" path and clearer empty/setup-needed states. | P1 |
| Lobby density | Lichess separates quick pairing, lobby, and correspondence; lobby actions are compact. | Castles Lobby rows are now scannable, but filters/actions consume large vertical space. | Functionally good; denser hierarchy would reduce scrolling and cognitive load. | Accept: compact Lobby filters and action rows after current QA closure. | P2 |
| Watch/TV | Lichess TV has a main board, category rail, clocks, moves, and ranked variants. | Castles Watch is list/card based with current selection and public games. | Castles lacks a true TV-like focused spectator mode. | Defer: add only after stable spectator counts/activity/rating signal; current Watch is acceptable for beta. | P3 |
| Archive/history | Lichess profile and games integrate archive directly into player identity. | Castles Archive is powerful but separate from profile/dashboard. | Account archive should be a profile/dashboard tab, not only an Online tab. | Accept: expose "My Games" in Account/Profile, reusing account archive data. | P1 |
| People/social | Lichess community/profile flows are broad but simple from nav. | Castles People panel is feature-rich: follow, block, report, privacy, challenges, notes, online rail, leaders. | People panel is useful but risks becoming a dense command center. | Accept: split "People" into profile/dashboard subareas or tabs; keep report/block/privacy discoverable but not dominant. | P2 |
| Challenge inbox | Lichess notifications are global; challenge actions are not buried in one panel. | Castles challenge inbox is in People/Online context and count badges exist. | Challenge recovery is implemented but not globally obvious enough. | Accept: promote challenge badge/dropdown into persistent account/profile nav. | P1 |
| Learn | Lichess learn page has a clear course grid and progress sidebar. | Castles tutorial overview has progress and modules, but first-run/game route can obscure it. | Existing Learn work is aligned; needs final screenshot QA and placement polish. | Keep current item 5 QA plan; add dashboard link to tutorial progress later. | P2 |
| Library/save | Lichess profile exports/games are integrated into player history. | Castles local Library and Online Archive are distinct and correctly separated, but potentially confusing. | Distinction is necessary but should be explained from dashboard/profile. | Accept: dashboard should show "Local Library" vs "Online Archive" as separate concepts. | P2 |
| Visual clutter | Lichess is dense but grouped: persistent nav, large primary board/profile panel, secondary rails. | Castles game screenshot shows board, tip toast, first-run/help modal, sidebar controls, browser sidebar, and account chips at once. | The app UI itself can stack too many instructional overlays and controls. | Accept: limit simultaneous tutorial/tip overlays; make help available without blocking account/navigation paths. | P1 |
| Mobile risk | Lichess mobile patterns collapse nav/profile but keep account access reachable. | Castles has many audited mobile states, but People/Profile/Challenge density remains high. | Mobile profile/dashboard should be designed before adding more People-panel actions. | Accept: include dashboard mobile screenshots in future UI audit gate. | P1 |
| Privacy | Lichess public profiles expose lots of social data by default. | Castles correctly avoids broad public text, raw ids, and unreviewed moderation/social features. | Castles should not copy everything Lichess exposes until privacy policy is stronger. | Reject/Defer: no bios, public walls, teams, or broad activity sharing in beta. | P2/P3 |
| Existing placeholders | Castles account dialog is a sign-in/session modal, but users expect it to be profile/dashboard access. | The modal is technically correct but product-clunky after sign-in. | "Online account" dialog should not be the only signed-in account surface. | Accept: keep dialog for settings/session controls; add a separate profile/dashboard route. | P1 |

## Proposed Roadmap Changes

Do not update the living roadmap until Liam signs off. Proposed changes after sign-off:

1. Insert a new item before the remaining item 5 QA closure: "Account/profile dashboard discoverability."
2. Define v1 dashboard scope:
   - Persistent "Profile" or "Account" entry from signed-in game chip, Online chip, and main menu.
   - Profile/dashboard page showing display name, beta rating summary, active account games, completed account games, challenge inbox summary, following/online-now summary, and account settings links.
   - Explicit split between "Local Library" and "Online Archive."
   - No bios, avatars, public walls, teams, messages, broad activity feed, or profile comments in v1.
3. Keep the existing first-run/tutorial and long-status item 5 QA slices, but run them after the dashboard entry point is designed because account/profile access changes the same navigation shell.
4. Add a screenshot gate for dashboard/profile at desktop, mobile, short-mobile, signed-in game page, and Online page.

## Review Panel

| Pass | Scope | Finding | Severity | Proposed Action | Decision |
|---|---|---|---|---|---|
| UX/navigation | Signed-in discoverability and route hierarchy | Account/profile data exists but there is no obvious signed-in dashboard path. | major | Add persistent Profile/My Account entry and dashboard route. | pending Liam |
| UX/navigation | Online People density | People panel mixes lookup, privacy, challenges, following, leaders, notes, and profile card. | major | Split profile/dashboard from social management; keep People compact. | pending Liam |
| Accessibility/mobile | Game page overlays | First-run modal plus tip toast plus sidebar can obscure the primary game/account context. | major | Reduce simultaneous overlays; ensure profile/menu access remains reachable. | pending Liam |
| Accessibility/mobile | Dashboard future gate | Any dashboard/profile work must be mobile-audited before more social actions are added. | minor | Add desktop/mobile/short-mobile screenshots to the audit script. | pending Liam |
| Product/privacy | Lichess feature copying | Rich Lichess profile features imply public social data Castles has not policy-reviewed. | major | Adopt structure, defer bios/walls/teams/messages/activity sharing. | pending Liam |
| Product/privacy | Rating/profile display | Rating summaries are safe if they stay sanitized and provisional. | minor | Surface current public rating summaries, not engine internals or experimental metrics. | pending Liam |

## Recommended Decisions For Sign-Off

Accept:

- Add obvious self-profile/dashboard access from signed-in account surfaces.
- Create a v1 profile/dashboard using existing sanitized account, rating, game, challenge, following, and privacy/session data.
- Promote active games, account archive, challenge inbox, and following summaries into that dashboard.
- Keep account settings/session management separate from the public-facing profile/dashboard.
- Add dashboard/profile screenshot coverage before item 5 closure.

Reject for now:

- Do not copy Lichess teams, studies, forums, blogs, profile completion, public walls, public comments, or profile bios.
- Do not expose raw account ids, private rating internals, broad presence, or hidden social state.
- Do not add a true TV/featured ranking until there is a durable ratings/follows/activity signal.

Investigate:

- Whether a bounded private "recent activity" feed can be derived from account games/challenges without leaking private rows.
- Whether a public profile route should be shareable in beta or remain an in-app profile card until privacy/moderation policy is stronger.
- Whether dashboard should live as a new top-level destination or as an Online sub-route with persistent global access.

Defer:

- Rating charts/history graphs until rated-game volume and rating policy stabilize.
- Teams/clubs, messages, inboxes, profile text, and social feeds until moderation and abuse handling mature.
- Engine-like insights/tutor comparisons until there is a separate analytics/math review.

## Immediate Next Slice If Accepted

Implement "self-profile/dashboard access v1":

- Convert the interrupted self-profile draft into a tested slice or replace it with a cleaner route-level approach.
- Add a visible signed-in "Profile" action from game account chip, Online account chip/dialog, and main menu/drawer.
- Reuse existing profile/account archive/challenge/following loaders; do not add backend schema unless the route needs one small aggregator endpoint.
- Add tests for signed-in access, signed-out fallback, no token leakage in URLs, and mobile reachability.
- Run screenshot audit at desktop/mobile/short-mobile.

## Open Questions For Liam

1. Should the first implementation be a lightweight "My Profile" card using existing People/Profile UI, or a fuller separate dashboard page from the start?
2. Should public profile pages be shareable by URL in the beta, or should profiles stay visible only inside the signed-in Online/People UI for now?
3. Should the dashboard become a top-level nav item, or should it be reachable through the account chip/menu while Online remains the main online destination?
