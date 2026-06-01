# UI Shell Second Pass Design

## Goal

Make Castles feel easier to move around, closer to the Lichess pattern of stable top destinations plus contextual game controls, while keeping Castles board-first and not adding unsupported public-service features.

## Accepted Review Findings

- Use one shared app navigation treatment for setup, tutorial, library, and watch pages.
- Keep the game side panel contextual: clocks, history, turn controls, saving/review, and online links. General page navigation belongs in the drawer or shared page header.
- Guard destructive new-game navigation with an explicit confirmation before clearing local autosave, online session state, or URL state.
- Improve tutorial placement by treating it as the Learn destination, with progress and previous/next controls visible near the top on mobile.
- Improve save feedback with a visible saved/error status instead of relying on browser alerts.
- Clean up mobile drawer icon labels, bottom safe-area scrolling, and drawer overlap with the game panel.
- Align Watch and Library page headers with the same navigation grammar while keeping Online Archive distinct from local Library.

## Design

Add a reusable `AppShellNav` component. It renders an optional back button, a stable destination row, and compact page title metadata. Setup uses it as the Play destination; Tutorial uses it as Learn; Watch and Library use it as their respective destinations. Destination buttons call the existing app-state handlers, so no router is introduced.

The game side panel loses Tutorial and Watch buttons. The hamburger drawer remains the game screen's app navigation. The side panel keeps New Game as a contextual play action, but New Game is guarded inside `Game.tsx` by a custom dialog for active local games and active online games.

Save-to-library changes from `alert()` feedback to a game status toast. The app-level save callback returns whether a save actually happened, so cancelling the save prompt does not announce a false success.

Tutorial keeps the existing lesson board flow, but the top area becomes: shared app nav, title, then a sticky progress row containing Previous, progress, Restart, and Next. That keeps lesson navigation visible on small screens without requiring nested-scroll discovery.

Watch and Library adopt the shared app header. Library moves PGN import behind a collapsed import section so saved games and load actions dominate the first viewport.

## Deferred

A full Learn landing page with grouped curriculum modules is valuable, but it is a larger P1 feature. This pass leaves a documented path for it after the shell/navigation defects are fixed.
