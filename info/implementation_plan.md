# Renaming "Castles" Phase to "Recruitment"

## Goal Description
The "Castles" phase (End of Turn) handles recruitment from Castles. "Sanctuary Pledging" (another form of recruitment) is currently a free action allowed at any time. This causes confusion.
We will:
1.  **Rename** the phase "Castles" to "**Recruitment**" to encompass both activities.
2.  **Restrict** Sanctuary Pledging so it is only allowed during this **Recruitment Phase**.
3.  **Ensure** the game engine does not auto-skip the Recruitment phase if a Sanctuary action is available (even if no Castles are available).
4.  **Prioritize** Sanctuary recruitment logic before Castle recruitment logic if relevant (though both are user-driven actions in the same phase).

## User Review Required
> [!IMPORTANT]
> This changes the timing of Sanctuary Pledging. Previously, you could Pledge at any time (e.g., Move -> Attack -> Pledge, or Pledge -> Move). Now, Pledging is strictly an End-of-Turn action (Move -> Attack -> Recruit). This aligns with the "secure then exploit" theme the user requested.

## Proposed Changes

### Constants & Types
#### [MODIFY] [Constants.ts](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Constants.ts)
- Update `TurnPhase` type: Replace `"Castles"` with `"Recruitment"`.
- Update `PHASE_CYCLE_LENGTH` related logic if needed (indices remain same, just name changes).

### Game Logic
#### [MODIFY] [TurnManager.ts](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Classes/Core/TurnManager.ts)
- Update `getTurnPhase` to return `"Recruitment"` for index 4.
- Update `getTurnCounterIncrement` to handle checking for *both* Castles and Sanctuaries before skipping phase 4.

#### [MODIFY] [SanctuaryService.ts](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Classes/Services/SanctuaryService.ts)
- Update `canPledge`: Add check `TurnManager.getTurnPhase(gameState.turnCounter) === "Recruitment"`.

#### [MODIFY] [RuleEngine.ts](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Classes/Systems/RuleEngine.ts)
- Update `getTurnCounterIncrement`:
    - Add logic to check `SanctuaryService.canPledge` (or `hasUsableSanctuaries`) to determine if the Recruitment phase is "usable".
    - Currently it only checks `hasUsableCastles`. I need to add `hasUsableSanctuaries`.

#### [MODIFY] [GameEngine.ts](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Classes/Core/GameEngine.ts)
- Update delegated methods to pass sanctuary status to `RuleEngine` if needed.

### UI Components
#### [MODIFY] [Turn_banner.tsx](file:///c:/Users/liaml/Documents/GitHub/Castles/src/components/Turn_banner.tsx)
- Update check `phase === "Castles"` to `phase === "Recruitment"`.
- Update icon logic (Castle icon is still appropriate for Recruitment phase).

#### [MODIFY] [ControlPanel.tsx](file:///c:/Users/liaml/Documents/GitHub/Castles/src/components/ControlPanel.tsx)
- No critical logic changes, but ensure types match.

#### [MODIFY] [PlayerHUD.tsx](file:///c:/Users/liaml/Documents/GitHub/Castles/src/components/PlayerHUD.tsx)
- Types match update.

## Verification Plan

### Automated Tests
- Run `npm test` to ensure no regressions.
- Specifically test `TurnManager` and `SanctuaryService` tests (I may need to update tests that expect "Castles").

### Manual Verification
1.  Start a game.
2.  Verify the phase banner says "Recruitment" instead of "Castles" at the end of the turn.
3.  Attempt to Pledge a Sanctuary during Movement/Attack (should be blocked).
4.  Wait for Recruitment phase.
5.  Verify I can Pledge.
6.  Verify that if I have a Sanctuary ready but NO Castles, the game does *not* skip the Recruitment phase.
