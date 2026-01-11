# Castles Architecture Analysis

> **Version**: 4.1 (January 2026)
> **Purpose**: Technical reference and mental map for the Castles codebase.

---

## 1. System Overview

Castles is a fantasy-themed hexagonal chess variant built with React and TypeScript. The architecture follows a layered design:

```
┌─────────────────────────────────────────────────┐
│                  UI Layer                       │
│   (Game.tsx, HexGrid.tsx, PieceRenderer.tsx)    │
│            [Visuals & User Input]               │
├─────────────────────────────────────────────────┤
│                 Hook Layer                      │
│   (useGameLogic, useMoveExecution, usePGN)      │
│      [State Management & Controller Logic]      │
├─────────────────────────────────────────────────┤
│               Command Layer                     │
│   (MoveCommand, AttackCommand, PledgeCommand)   │
│         [Encapsulated User Actions]             │
├─────────────────────────────────────────────────┤
│                Core Logic                       │
│   GameEngine (Facade) ──► RuleEngine (Pure)     │
│       │                 ► StateMutator (Pure)   │
│       └──────────────── ► SanctuaryService      │
├─────────────────────────────────────────────────┤
│               Domain Entities                   │
│   (Piece, Hex, Castle, Sanctuary, Board)        │
│          [Data Structures & Models]             │
└─────────────────────────────────────────────────┘
```

### The "God Object" Check
*   **GameEngine**: Is **NOT** a God Object. It acts as a clean Facade (approx. 200 lines), delegating actual logic to specialized systems (`RuleEngine`, `StateMutator`, `SanctuaryService`).
*   **Game.tsx**: Large (~600 lines) but typical for a main orchestration component. However, it does leak some logic (direct calls to `RuleEngine` for tooltips).
*   **Recommendation**: Move tooltip logic into `GameEngine` or a specialized hook.

---

## 2. Control Flow Mapping

### Trace: User Logic Flow
**Example: Player Clicks a Hex**

1.  **Input Layer**: User clicks a hex on `HexGrid`.
2.  **Handler Layer**: `useClickHandler.ts` receives the click.
    *   Determines context: Is it a move? An ability target? A sanctuary pledge?
3.  **Controller Layer**: `useMoveExecution.ts` prepares the action.
    *   Example: Creates a `MoveCommand` or calls `pledge`.
4.  **Core Logic**:
    *   `GameEngine` validates the action via `RuleEngine` (e.g., `getLegalMoves`).
    *   `GameEngine` executes the action via `StateMutator` or `SanctuaryService`.
5.  **State Update**:
    *   A **new** immutable `GameState` is created.
    *   React `setState` is called.
6.  **Render**:
    *   `Game.tsx` re-renders with new state.
    *   `useComputedGame` recalculates derived values (e.g., new legal moves).

### Trace: Sanctuary Pledge (Specific)
1.  **User**: Clicks a Sanctuary hex.
2.  **SanctuaryService**: `canPledge` checks:
    *   Is sanctuary ready (cooldown/phase)?
    *   Is insufficient strength?
3.  **Action**: User confirms pledge target.
4.  **SanctuaryService**: `pledge` executed.
    *   Spawns new piece.
    *   **Evolves** sanctuary to next tier (or deactivates).
    *   Updates `sanctuaries` array immutably.
    *   Records move in `MoveTree` (for PGN).

---

## 3. Data Serialization (PGN)

The game uses a custom PGN format to support standard moves + specific "Fantasy" setup data.

### Export Flow
`Game State` -> `PGNService` -> `PGNGenerator` -> **PGN String**

### Import Flow
**PGN String** -> `PGNParser` -> `PGNImporter` -> `Game State` (Hydrated)

### Custom Setup Format (JSON)
The `[CustomSetup "..."]` tag compresses the board state.

```json
{
  "pieces": [ ... ],
  "sanctuaries": [ 
    {
      "q": -2, "r": 0, "s": 2, 
      "type": "Wolf", 
      "territorySide": "w", 
      "cooldown": 2,           // Turns until ready
      "hasPledgedThisGame": 0  // 0 = false, 1 = true
    }
  ],
  "gameSettings": [10, 5]      // [Unlock Turn, Recharge Time]
}
```

---

## 4. Extension Test (Adding a New Piece)

How easy is it to add a "Gryphon"?

1.  **Define**: Add `Gryphon` to `PieceType` enum in `Constants.ts`.
2.  **Configure**: Add entry to `PieceTypeConfig.ts`.
    *   Define stats: `Strength: 2`.
    *   Define behavior: `moveStrategy: eagleMoves` (reuse existing or write new).
3.  **Assets**: Add SVG to public folder.
4.  **Done**: No changes needed in `Piece.ts`, `GameEngine`, or `RuleEngine`.

**Status**: The system passes the Extension Test with high marks for modularity.

---

## 5. Architectural Findings (Preliminary Audit)

### Strengths
*   **Facade Pattern**: `GameEngine` hides complexity well.
*   **Immutability**: `StateMutator` ensures predictable state changes.
*   **Config-Driven**: `PieceTypeConfig` makes balancing and extension easy.

### Weaknesses (Refactoring Targets)
*   **UI Logic Leak**: `Game.tsx` calls `RuleEngine.isHexDefended` directly during render. This causes unnecessary recalculation.
*   **Logic Leak**: `useGameLogic` contains business logic for "unlocking" sanctuary pools inside `handlePieceClick`.
*   **Performance**: `createPieceMap` (O(N)) is called inside render loops in some places (`PieceTooltip`).

---

## 6. Implementation Plan Recommendation (Preview)
1.  **Refactor UI Leaks**: Move `isHexDefended` behind a memoized hook or `GameEngine` method.
2.  **Centralize Logic**: Move "Unlocking" logic from `useGameLogic` to `SanctuaryService`.
3.  **Optimize Render**: Ensure `pieceMap` is passed down, not recreated in children.
