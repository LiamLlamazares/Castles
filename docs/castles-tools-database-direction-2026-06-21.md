# Castles Tools And Database Direction - 2026-06-21

## Decision

Castles should keep Tools focused on analysis and replay for now. A public database can come later, but only after archive metadata and replay contracts are stable enough to support useful Castles-specific queries.

The goal is not to clone the Lichess opening explorer. Castles starts from generated positions and does not yet have a stable deterministic opening taxonomy.

## Current Product Boundary

- Local Library is personal browser storage for named local saves.
- Online Archive is public completed online games plus private signed-in account history where authorized.
- Profile Games is player-scoped public history.
- Analysis Replay is the correct destination for reviewing a saved or archived game.
- Tools should not become a cluttered menu of speculative features.

## Database V1 Shape

When ready, a Castles public database should expose:

- Player display names where public and registered.
- Rating mode, time control, setup summary, result, result reason, started/ended time, and replay length.
- Board/setup metadata that helps Castles players search positions without exposing private game state.
- Public replay launch and analysis handoff.

It should not expose:

- Private/unlisted games.
- Raw account ids, session ids, player tokens, challenge tokens, or invite credentials.
- Hidden relationship state, report state, private notes, or moderation state.
- A chess-style opening tree unless Castles later defines stable opening families.

## Future Query Examples

- Public rated games by player.
- Public games with a specific board radius, time control, or victory condition.
- Public games ending by resignation, monarch capture, castle control, victory points, or timeout.
- Recent high-rated public replays once rating policy is mature.

## Rejected Lichess Clone Scope

- Opening explorer as a top-level feature before Castles has openings.
- News/tournament/community density inside Tools.
- Public player feeds or profile-wall style activity.
- Any database page that encourages sign-in, streaks, or notifications.

## Next Implementation Gate

Do not add a top-level Database route until:

- Archive replay contracts stay reliable across public and account histories.
- Public archive queries are indexed and bounded.
- Rating leaderboard eligibility and inactive-account rules are implemented if ratings are used as a database filter.
- Moderation/sanction states exist for excluding limited accounts from broad public discovery.

Current server behavior enforces this boundary: `/api/online/database` returns the policy gate instead of a database payload, and rating leaderboard requests for official/database modes are rejected until eligibility, inactivity, archive-indexing, and moderation rules are implemented.
