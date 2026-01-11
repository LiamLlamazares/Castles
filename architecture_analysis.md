# Castles Architecture Analysis

> **Version**: 5.1 (January 2026)
> **Purpose**: "Living Documentation" and Refactoring Roadmap.
> **Status**: Deep Audit Complete. Phase 3 Refactoring in Progress.

---

## 1. System Map & Control Flow

### A. High-Level Architecture
The system has migrated to a **Context-Based Provider** architecture. The React layer now injects dependencies via `GameProvider`, dissociating the View from the Logic instantiation.

```mermaid
graph TD
    Provider[GameProvider] -->|Injects| Ctx[GameContext]
    Ctx -->|State Information| GameState[IGameState]
    Ctx -->|Dispatch Actions| GameActions[IGameActions]
    
    User((User)) -->|Clicks Hex| UI[HexGrid / HexCell]
    UI -->|onClick| Hook[useClickHandler]
    Hook -->|Delegate| GameActions
    GameActions -->|Action| Facade[GameEngine (Facade)]
    Facade -->|Query| Rule[RuleEngine (Pure)]
    Facade -->|Mutate| State[StateMutator (Pure)]
    State -->|New State| Provider
    Provider -->|Updates| GameState
    GameState -->|Re-render| UI
```

### B. Control Flow Trace (Detailed)
**Scenario: Player Moves a Piece**
1.  **Input**: User clicks a `HexCell`. `HexGrid` passes the click to `useClickHandler`.
2.  **Discernment**: `useClickHandler` checks:
    *   Is an Ability active? (e.g., Fireball target selection).
    *   Is Pledging active? (Sanctuary logic).
    *   Else: Calls `handleHexClick` (from `GameDispatchContext`).
3.  **Coordination**: `useMoveExecution` (inside `GameProvider`):
    *   Checks `movingPiece` selection state.
    *   Calls `isLegalMove(targetHex)` (validated against `legalMoves`).
    *   Calls `gameEngine.applyMove(state, piece, targetHex)`.
4.  **Execution**: `GameEngine` delegates to `StateMutator.applyMove`:
    *   Clones state.
    *   Updates `pieceMap`.
    *   Records `MoveRecord`.
    *   Returns **New Immutable State**.
5.  **Render Cycle**:
    *   `GameProvider` updates internal state.
    *   `GameStateContext` emits new values.
    *   `InnerGame` re-renders `HexGrid` (board). `LegalMoveOverlay` updates via context.

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
| **useGameLogic.ts** | 🚧 **DEPRECATED** | Replaced by `GameProvider`. Logic has been decomposed into smaller hooks (`useCoreGame`, `useComputedGame`) composed by the Provider. |
| **GameEngine.ts** | ✅ **CLEAN** | Proper Facade. Delegates work effectively. Low cyclomatic complexity. |
| **HexGrid.tsx** | ✅ **CLEAN** | Refactored. Unused props removed. Sorting optimized to O(1) lookups. |
| **GameProvider.tsx** | ⚠️ **COMPLEX** | The new central composition root. While better than a monolith hook, it still has many dependencies (as expected for a root provider). |
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
*   **Correction**: `LegalMoveOverlay` handles dot rendering, separating concerns from `HexGrid`.
*   **Redundancy**: `useClickHandler` partially duplicates "can pledge" logic found in `SanctuaryService` (checking `isRiver`, `isCastle`).

### 2. Architecture & Modularity
*   **Strengths**: `GameEngine` is a textbook Facade. `Answer: GameProvider` successfully implements Dependency Injection, allowing for better testing and modularity.
*   **Weaknesses**: `useGameLogic` still exists as a ghost, heavily used in tests.

### 3. Efficiency & Data Structures
*   **Optimization**: `HexGrid` sorting now uses `Set` lookups (O(1)) instead of array searches, resolving the previous bottleneck.
*   **Computed State**: `useComputedGame` still runs heavy logic on every update.

### 4. Readability
*   **Naming**: Excellent. `WolfCovenant`, `StateMutator`, `PhoenixRecord` are evocative and clear.
*   **Complexity**: `useMoveExecution` is hard to follow—it handles too many "modes" (Pledge, Ability, Move, Attack).

### 5. Documentation
*   `PieceTypeConfig` is exemplary documentation-as-code.
*   `GameEngine` comments clearly explain the Facade pattern.

### 6. Refactoring
*   **Done**: Cleaned `HexGrid`. Implemented `GameProvider`.
*   **Long-term**: Clean up `useMoveExecution` state machine complexity.

---

## 5. Refactoring Roadmap (Phase 3)

### Milestone 1: Visual Correctness & Performance (COMPLETED)
*   **[x] Task 1.1**: Clean up `HexGrid` props (remove unused `legalMoveSet`).
*   **[x] Task 1.2**: Optimize `HexGrid` sorting. (Switched to Set-based lookups).

### Milestone 2: Deconstruct the God Hook (COMPLETED)
*   **[x] Task 2.1**: Implement `GameProvider` and Context API.
*   **[x] Task 2.2**: Decompose logic into `useCoreGame`, `useComputedGame`, etc. (Done via Provider).
*   **[ ] Task 2.3**: Clean up legacy `useGameLogic.ts` usage in tests.

### Milestone 3: Asset Pipeline (COMPLETED)
*   **[x] Task 3.1**: Create a dynamic `PieceAssetRegistry` to automate the `PieceImages.ts` manual mapping. (Implemented `AssetRegistry.ts` with `require.context`).

### Milestone 4: Code Cleanliness (In Progress)
*   **[x] Task 4.1**: Refactor `useMoveExecution` to use a Command Dispatcher pattern. (Reduced state machine complexity).
*   **[ ] Task 4.2**: Clean up legacy `useGameLogic.ts` usage in tests.

---

## 6. Official Rating

| Category | Score | Notes |
| :--- | :--- | :--- |
| **Correctness** | 4.5/5 | Logic is rigorous; Render bugs fixed. |
| **Architecture** | 4.5/5 | Facade + Provider Pattern is a very strong foundation. |
| **Maintainability** | 4/5 | Easy to add pieces; now easier to manage state flow via Context. |
| **Aesthetics** | ? | Cannot judge code, but themes system is robust. |
| **Overall** | **4.2/5** | **"Strong, Modern React Architecture"** |
