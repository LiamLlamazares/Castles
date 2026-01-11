# Castles Architecture Analysis

> **Version**: 5.0 (January 2026)
> **Purpose**: "Living Documentation" and Refactoring Roadmap.
> **Status**: Deep Audit Complete.

---

## 1. System Map & Control Flow

### A. High-Level Architecture
The system uses a **React Host + Logic Core** architecture. The React layer acts as a "View Controller" that subscribes to a mostly pure "Game Core".

```mermaid
graph TD
    User((User)) -->|Clicks Hex| UI[HexGrid / HexCell]
    UI -->|onClick| Hook[useClickHandler]
    Hook -->|Delegate| Logic[useGameLogic (God Hook)]
    Logic -->|Action| Facade[GameEngine (Facade)]
    Facade -->|Query| Rule[RuleEngine (Pure)]
    Facade -->|Mutate| State[StateMutator (Pure)]
    Facade -->|Service| Sanc[SanctuaryService]
    State -->|New State| Store[React State]
    Store -->|Render| UI
```

### B. Control Flow Trace (Detailed)
**Scenario: Player Moves a Piece**
1.  **Input**: User clicks a `HexCell`. `HexGrid` passes the click to `useClickHandler`.
2.  **Discernment**: `useClickHandler` checks:
    *   Is an Ability active? (e.g., Fireball target selection).
    *   Is Pledging active? (Sanctuary logic).
    *   Else: Calls `onEngineHexClick`.
3.  **Coordination**: `useMoveExecution` (inside `useGameLogic`):
    *   Checks `movingPiece` selection state.
    *   Calls `isLegalMove(targetHex)` (validated against `legalMoves`).
    *   Calls `gameEngine.applyMove(state, piece, targetHex)`.
4.  **Execution**: `GameEngine` delegates to `StateMutator.applyMove`:
    *   Clones state.
    *   Updates `pieceMap`.
    *   Records `MoveRecord`.
    *   Returns **New Immutable State**.
5.  **Render Cycle**:
    *   `useCoreGame` updates internal state.
    *   `useComputedGame` recalculates `legalMoves`.
    *   `Game` renders `HexGrid` (board) and `LegalMoveOverlay` (dots).

### C. Data Serialization
*   **PGN Format**: Custom format mixing standard chess notation with Fantasy headers.
    *   `[SanctuarySettings "10|5"]`
    *   `[CustomSetup "...compressed_json..."]`
*   **State <-> PGN**: Handled by `PGNService` (Generator) and `PGNParser` (Importer).
*   **Risk**: Sanctuary setup data is complex and relies on perfect JSON reconstruction in the `CustomSetup` tag.

---

## 2. The "God Object" Check

| Component | Status | Analysis |
| :--- | :--- | :--- |
| **useGameLogic.ts** | 🚨 **GOD OBJECT** | Combines State Management, View Logic, Analysis Controller, PGN handling, and Sound. It is the tangled knot of the application. |
| **GameEngine.ts** | ✅ **CLEAN** | Proper Facade. Delegates work effectively. Low cyclomatic complexity. |
| **HexGrid.tsx** | ⚠️ **MINOR** | Receives `legalMoveSet` but ignores it (dead prop). Render logic is efficient, but prop interface is misleading. |
| **PieceTypeConfig.ts**| ✅ **CLEAN** | Single Source of Truth for piece definitions. |

---

## 3. The "Extension Test"
**Scenario**: Adding a new piece "Gryphon".

1.  **Constants.ts**: Add `PieceType.Gryphon`.
2.  **PieceTypeConfig.ts**: Add stats, move/attack strategies.
3.  **PieceImages.ts**: Import SVG and add to `themeImages` map.
4.  **Assets**: Add SVGs.

**Verdict**: **Pass (B+)**. The logic is decoupled, but Asset management requires manual wiring in `PieceImages.ts`. No core logic shifts required.

---

## 4. Deep-Deep Code Review (6 Dimensions)

### 1. Correctness & Logic
*   **Logic**: Generally solid. RuleEngine uses pure functions effectively.
*   **Correction**: Originally flagged `HexGrid` for ignoring `legalMoveSet`. Further investigation reveals this is intentional; `LegalMoveOverlay` handles the dots. This is a good Separation of Concerns.
*   **Redundancy**: `useClickHandler` partially duplicates "can pledge" logic found in `SanctuaryService` (checking `isRiver`, `isCastle`).

### 2. Architecture & Modularity
*   **Strengths**: `GameEngine` is a textbook Facade. `AbilitySystem` is well isolated. `LegalMoveOverlay` successfully decouples move visualization from board rendering.
*   **Weaknesses**: `useGameLogic` is a leaky abstraction. It exposes internal helpers like `isHexDefended` to the UI, bypassing the ViewModel.

### 3. Efficiency & Data Structures
*   **Bottleneck**: `HexGrid.tsx` lines 76-85 sorts the entire board (91 hexes) every render to handle Z-indexing.
*   **Optimization**: This sorting should be computed only when the board layout changes, or handled via CSS `z-index`.
*   **Computed State**: `useComputedGame` runs heavy logic (legal moves for ALL pieces) on every state update.

### 4. Readability
*   **Naming**: Excellent. `WolfCovenant`, `StateMutator`, `PhoenixRecord` are evocative and clear.
*   **Complexity**: `useMoveExecution` is hard to follow—it handles too many "modes" (Pledge, Ability, Move, Attack).

### 5. Documentation
*   `PieceTypeConfig` is exemplary documentation-as-code.
*   `GameEngine` comments clearly explain the Facade pattern.

### 6. Refactoring
*   **Immediate Fix**: Remove unused `legalMoveSet` prop from `HexGrid` to avoid confusion.
*   **Long-term**: Break apart `useGameLogic` into `useGameCore` (State), `useGameController` (Actions), and `useGameViewModel` (Derived Data).

---

## 5. Refactoring Roadmap (Phase 3)

### Milestone 1: Visual Correctness & Performance (The "Quick Wins")
*   **Task 1.1**: Clean up `HexGrid` props (remove unused `legalMoveSet`).
*   **Task 1.2**: Optimize `HexGrid` sorting. Memoize the sorted list or use CSS.

### Milestone 2: Deconstruct the God Hook
*   **Task 2.1**: Extract `SanctuaryLogic` out of `useGameLogic` and `useClickHandler` into a pure logic hook.
*   **Task 2.2**: Split `useGameLogic` into `useGameModel` (State only) and `useGameController` (Callbacks).

### Milestone 3: Asset Pipeline
*   **Task 3.1**: Create a dynamic `PieceAssetRegistry` to automate the `PieceImages.ts` manual mapping.

---

## 6. Official Rating

| Category | Score | Notes |
| :--- | :--- | :--- |
| **Correctness** | 4/5 | Logic is rigorous; Render bug is the only major deduce. |
| **Architecture** | 3/5 | Facade is great; Hooks are messy. |
| **Maintainability** | 4/5 | Easy to add pieces; Hard to change core state flow. |
| **Aesthetics** | ? | Cannot judge code, but themes system is robust. |
| **Overall** | **3.5/5** | **"Solid Core, Messy Wiring"** |
