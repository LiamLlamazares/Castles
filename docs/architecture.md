# Castles Architecture

Last refreshed: 2026-05-25

This document is the canonical architecture reference for the current React/TypeScript app. Older architecture snapshots were removed because they mixed current design with obsolete `useGameLogic` and pre-library notes.

## Runtime Shape

Castles is a client-side React app with a TypeScript rules engine.

```text
App
  -> setup / menu / tutorial / rules / library screens
  -> Game
    -> GameProvider
      -> state hooks
      -> command execution hooks
      -> PGN, persistence, AI, input, sound hooks
    -> board, HUD, history, overlays, tooltips
```

The UI should ask questions and dispatch actions. It should not duplicate rule logic when a rule-system method already exists.

## Core Boundaries

| Area | Main source | Responsibility |
| --- | --- | --- |
| State model | `src/Classes/Core/GameState.ts` | Complete live position, history tree, setup data, pools, graveyard, timers, and transient selection state. |
| Board model | `src/Classes/Core/Board.ts`, `src/Classes/Entities/Hex.ts` | Hex topology, terrain, coordinate validity, and distance helpers. |
| Rules queries | `src/Classes/Systems/RuleEngine.ts` | Legal moves, legal attacks, recruitment hexes, turn advancement, blockers, and derived rules. |
| Mutations | `src/Classes/Systems/StateMutator.ts`, `src/Classes/Systems/Mutators/` | Immutable state transitions for move, attack, pass, recruit, pledge, promotion, ability, and upkeep actions. |
| Commands | `src/Classes/Commands/` | UI/AI-facing action objects that execute mutations and produce notation. |
| Config | `src/Constants.ts`, `src/Classes/Config/` | Piece, ability, sanctuary, phase, timing, and setup constants. |
| Serialization | `src/Classes/Services/PGN*.ts`, `src/Classes/Systems/PGNParser.ts` | PGN export/import, setup compression, move-tree parsing, and replay hydration. |
| Local storage | `src/Classes/Services/GameLibraryRepository.ts`, persistence hooks | IndexedDB game library plus separate autosave/share-url flows. |
| Rules text | `src/rules/rulesContent.ts` | Canonical player-facing rules content used by rules UI and tests. |

## State and Control Flow

1. UI events enter through board/HUD components and input hooks.
2. `GameProvider` composes state, derived rules, command execution, analysis navigation, PGN, persistence, AI, and sound hooks.
3. Click/input hooks resolve user intent but delegate legality to the engine and systems.
4. Commands execute against `GameState` and return a new state plus notation.
5. `StateMutator` and subsystem mutators apply the actual state changes.
6. `MoveTree` stores snapshots for replay, variation navigation, PGN export, and analysis mode.
7. React renders either the live state or a historical snapshot from the move tree.

## Source-of-Truth Rules

Use these sources before adding new rule logic:

| Rule area | Source |
| --- | --- |
| Piece stats and movement descriptions | `PieceTypeConfig.ts` |
| Piece movement algorithms | `MoveStrategies.ts` and registries |
| Attack type behavior | attack strategy registry and `RuleEngine` |
| Castle recruitment | `RuleEngine.getRecruitmentHexes` and recruitment mutators |
| Sanctuary pledging/cooldown | `SanctuaryService`, sanctuary mutators, and `SanctuaryConfig` |
| Ability legality and execution | `AbilityConfig`, `AbilitySystem`, ability mutators |
| Win conditions | `WinCondition.ts` |
| Player-facing wording | `src/rules/rulesContent.ts` |

Avoid adding one-off checks in UI components unless they only affect display. If the check decides whether an action is legal, it belongs in the rules/services layer.

## Extension Notes

To add a standard piece:

1. Add the enum value to `PieceType`.
2. Add its metadata to `PieceTypeConfig`.
3. Register or implement its movement strategy.
4. Use an existing attack type or register a new attack strategy.
5. Add `w<Type>.svg` and `b<Type>.svg` in the active piece theme folders.
6. Add tests for movement, attack legality, notation, PGN round-trip if needed, and tutorial/rules coverage.

To add a special ability:

1. Add the enum value to `AbilityType`.
2. Add metadata in `AbilityConfig`.
3. Add targeting/legality in `AbilitySystem` or `GameEngine` ability helpers.
4. Add execution in the ability mutation path.
5. Add notation/PGN coverage if the ability changes replay state.

To add a rules feature:

1. Add engine/system behavior first.
2. Add regression tests around legality and replay.
3. Update `rulesContent.ts`.
4. Update tutorial lessons only after the rule is stable.

## Current Cleanup Targets

These are known non-blocking issues that make future work harder:

| Target | Reason |
| --- | --- |
| ESLint unused imports and hook dependency warnings | Build succeeds, but real warnings are hard to see. |
| `GameProvider` composition size | It is the correct root boundary but still dense. |
| `useMoveExecution` / input flow complexity | It coordinates many action modes and is the main place bugs can hide. |
| PGN replay hydration | This remains high-risk because it reconstructs state and move-tree history from compact notation. |
| Rules text duplication in tutorials/tooltips | Keep `rulesContent.ts` canonical and reduce drift over time. |

