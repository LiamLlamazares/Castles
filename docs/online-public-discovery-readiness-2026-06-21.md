# Online Public Discovery Readiness - 2026-06-21

## Purpose

This document defines the current safety boundary for Castles public discovery. It is intentionally conservative: Castles should feel like a focused strategy game, not a social app.

## Current Public Surfaces

- Public profiles show display name, avatar, public rating summary/history, privacy-safe presence, and public games only.
- Player search returns sanitized public profiles and no raw account ids, session ids, tokens, private links, or hidden relationship state.
- Rating leaders show beta rating records with provisional `?` markers. They are not an official title, ranking season, or engagement loop.
- Public Watch and Archive show only public game summaries and replay handoffs. Private and unlisted games stay out of public discovery.
- Reports, blocks, follow privacy, challenge privacy, account sessions, password settings, and account deletion live in Profile/Settings or contextual player actions.

## Route Impact Checklist

| Surface | Public Data Allowed | Private Data Forbidden | Current Action |
| --- | --- | --- | --- |
| Public profile | Display name, avatar, public rating, public games, visibility-safe presence | Account ids, sessions, tokens, private games, hidden relationships | Keep |
| Player search | Bounded sanitized profile suggestions | Raw ids, exact block state, private presence | Keep bounded |
| Rating leaders | Display name, avatar, rating display, provisional marker, game count | Deviation, volatility, engine id, account ids | Keep beta-labeled |
| Watch/Archive | Public summaries, public replay analysis | Private/unlisted records, invite credentials | Keep |
| Challenges | Contextual challenge actions and accepted-game recovery | Broad notifications, inbox-style social pressure | Keep contextual |
| Reports | Reason/details to protected moderation queue | Public accusation labels or public report counts | Keep private |
| Blocks | Hide interactions both ways where implemented | Public block badges | Keep private |

## Moderation Operating Policy

- Reports are private operator records. Public profiles, leaderboards, and games must not show report counts or accusation labels.
- Report reasons stay limited and factual: abuse, cheating, spam, impersonation, and other.
- The protected admin report queue is the operating surface for review status and audit history.
- Blocking should remove or hide direct social interactions where possible: profile relationship actions, account challenges, following lists, and visible player discovery.
- A block must not rewrite historical public games. Public archives remain governed by game visibility.
- Deleted accounts lose login, ordinary social state, sessions, privacy settings, and account access. Historical game/report display-name snapshots remain unless a separate anonymization migration is designed.

## Sanction Readiness

Broader public discovery should wait until these account states are implemented and tested:

- `active`: normal account.
- `limited`: can sign in and play private/unlisted games, but cannot appear in broad public discovery.
- `report_locked`: can sign in and recover existing games, but cannot create public listings, challenges, reports, or profile actions.
- `closed`: cannot sign in; historical public records keep existing visibility rules.

Appeals should remain operator-handled in beta. Do not add public appeal feeds, public moderation notes, or notification loops.

## Rating And Leaderboard Policy

- New accounts start at `1500?` with `0 rated games`.
- Ratings are written only for completed rated games between two distinct registered accounts.
- Provisional ratings keep the `?` marker anywhere they are displayed.
- Current beta leaderboards exclude `0 rated games` accounts, but may show provisional players with at least one rated game. The UI must label the list as beta rating records.
- A future official leaderboard should require a documented minimum rated-game count, non-provisional status, and an inactivity rule before launch.
- Leaderboard payloads must continue to omit rating-engine internals, deviation, volatility, raw account ids, bearer tokens, and session ids.

## Explicit Non-Goals

- No sign-in nags, streaks, profile completion prompts, badges, direct messages, public walls, public comments, broad feeds, or social notifications.
- No public report badges, public sanction labels, or public moderation history.
- No title-like official leaderboard claims until eligibility rules are implemented.
