# Deep-Dive Code Review Audit

## 1. Correctness & Logic
*   **Game Rules**: The use of `GameEngine` as a facade delegating to `RuleEngine` suggests a strong separation of rules.
*   **State Validity**: `Piece.ts` uses immutable patterns (`public readonly`, `with()`), which reduces state corruption risks.
*   **PGN Data Loss**: Validated the user's concern. `PGNService.ts` / `PGNImporter` only extracts the main line (`moves: string[]`), dropping variations during import. This is a logic correctness issue for an analysis tool.
*   **Analysis Mode Bug**: `useGameLogic.ts` explicitly hides move indicators in analysis mode (`shouldHideMoveIndicators = !isAnalysisMode && isViewingHistory`). This seems inverted or misapplied if the goal is to allow variant creation.

## 2. Architecture & Modularity
*   **Coupling**: High coupling in `useGameLogic.ts`. It acts as a bridge between UI, Game State, and Analysis State. It imports *everything*.
*   **Separation of Concerns**:
    *   ✅ `Piece` logic is well-separated via `Strategies` and `Config`.
    *   ✅ `GameEngine` separates Queries (`RuleEngine`) from Actions (`StateMutator`).
    *   ❌ `Game.tsx` knows too much about logic (injecting `onNavigate`).
    *   ❌ `useGameLogic` mixes UI state (`showCoordinates`) with Critical Game State.
*   **Design Patterns**: 
    *   Facade (`GameEngine`, `PGNService`) - **Good**.
    *   Strategy (`MoveStrategyRegistry`) - **Good**.
    *   God Hook (`useGameLogic`) - **Bad**.

## 3. Efficiency & Data Structures
*   **Structure Usage**:
    *   `MoveTree` is a proper Tree structure.
    *   `PieceMap` is used for O(1) piece lookups (Excellent).
    *   `Set<string>` used for `legalMoveSet` / `blockedHexSet` checks (Excellent).
*   **Memory**: `useGameLogic` creates a new `GameEngine` instance only when `initialBoard` changes (using `useMemo`). However, `getEffectiveState` computes a new state object on every render during analysis, which might be expensive if the board is huge (cloning all pieces).

## 4. Readability & Cognitive Load
*   **Naming**: Generally clear (`isLegalMove`, `handleHexClick`).
*   **Complexity**: `useGameLogic.ts` has high cognitive load due to length and number of composed hooks. The return statement alone exports ~30 items.
*   **Directory Structure**: `src/Classes` is well organized. `src/hooks` contains the complexity.

## 5. System Documentation
*   **Theory-to-Code**: `ANALYSIS_ARCHITECTURE.md` is a good start. The code itself (`Piece.ts`, `GameEngine.ts`) has excellent TSDoc comments explaining *what* it does and *why* (e.g., explaining the Facade pattern).
*   **Self-Documenting**: `PieceTypeConfig` is a great example of self-documenting code.

## 6. Refactoring & Maintainability
*   **Refactoring Path**:
    1.  **Split `useGameLogic`**: Separate "Game Running State" from "UI/View State".
    2.  **Fix PGN**: Rewrite `PGNImporter` to support recursive tree parsing.
    3.  **Analysis Logic**: Fix the `legalMoveSet` logic in `useGameLogic` to allow moving in analysis mode.
*   **Dead Code**: None immediately obvious, but `PhoenixRecord` in `GameEngine` interface hints at features that might be complex to test.
