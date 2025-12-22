# Analysis Mode & PGN Architecture

## Overview

This document describes how Analysis Mode, Variant Creation, and PGN Import/Export work together.

> [!WARNING]
> This document has been updated to reflect the *actual* current implementation, which contains several bugs and discrepancies from the original design. See "Known Issues" below.

---

## Key Concepts

### MoveTree
A tree data structure storing all moves with branches (variations).

```
Root (Start)
  └── G12G11 (Move 1 - Main Line)
        ├── H12H11 (Move 2 - Main Line)
        │     └── ...
        └── I11I10 (Move 2 - Variation)
              └── ...
```

Each node contains:
- `move`: The `MoveRecord` (notation, color, turn#, phase)
- `snapshot`: A `HistoryEntry` capturing game state at this position
- `children`: Array of child nodes
- `parent`: Reference to parent node
- `selectedChildIndex`: Index of the child that represents the "Main Line" from this node.

**Main Line Convention:**
- `children[selectedChildIndex]` is the main line / selected variation.
- Other children are alternative variations.
- To promote a variation to the main line, the `selectedChildIndex` is updated.

### Key Files

| File | Purpose |
|------|---------|
| `MoveTree.ts` | Tree data structure for move history |
| `useGameLogic.ts` | Central hook managing game state |
| `useAnalysisMode.ts` | History navigation controls |
| `usePGN.ts` | PGN import/export functionality |
| `PGNService.ts` | PGN parsing and generation |
| `StateMutator.ts` | Records moves to tree during gameplay |

---

## Modes

### Play Mode (`analysisEnabled = false`)
- Normal gameplay.
- **Move Blocking**: Moves are NOT strictly blocked in code when viewing history, but making a move will branch from that point and reset the view to "Live".
- Cannot explicitly "create variants" in the UI sense (no visual branching controls), but the underlying logic supports it.

### Analysis Mode (`analysisEnabled = true`)
- Enabled via "Analyze Game" button or PGN import.
- **Intended Behavior**: When viewing history, move indicators should be shown to allow creating variants.
- **Current Bug**: Move indicators are currently **HIDDEN** in Analysis Mode due to inverted logic in `useGameLogic.ts`.

---

## PGN Export Flow

```
getPGN() → PGNService.generatePGN() → renderRecursiveHistory(moveTree.rootNode) → PGN String
```

1. `getPGN()` is called from `usePGN.ts`
2. Calls `PGNService.generatePGN()` with the current `moveTree`
3. If `moveTree` exists, renders recursively from `rootNode`
4. Variations are wrapped in parentheses per PGN standard

---

## PGN Import Flow

```
User pastes PGN
    ↓
loadPGN() in usePGN.ts
    ↓
PGNService.parsePGN() → Extract moves array (Main Line ONLY)
    ↓
PGNService.replayMoveHistory()
    ↓
Creates fresh MoveTree + applies each move via GameEngine
    ↓
StateMutator.recordMoveInTree() adds each move to tree
    ↓
Return final state with tree
```

> [!IMPORTANT]
> **Variation Loss**: The current PGN Parser extracts a linear list of moves (`moves: string[]`) to replay. This means **all variations (branches) in the PGN are discarded** upon import. The `MoveTree` returned by the parser is not fully utilized during reconstruction.

---

## Variant Creation Flow

When a move is made while viewing history:

```
User viewing history → Clicks piece
    ↓
Show legal moves (Currently BUGGED in Analysis Mode) → User makes move
    ↓
getEffectiveState() uses snapshot from viewed node
    ↓
GameEngine.applyMove() → StateMutator.recordMoveInTree()
    ↓
tree.addMove() at current cursor position
    ↓
If move exists as child → Navigate to existing
If new move → Create new branch/variant
    ↓
commitBranch() → viewNodeId = null (go live)
```

---

## State Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `analysisEnabled` | Props from App.tsx | Controls variant creation permission |
| `viewNodeId` | State | Currently viewed node ID (null = live) |
| `isViewingHistory` | Computed | `viewNodeId !== null` |
| `isAnalysisMode` | useAnalysisMode | `analysisEnabled && isViewingHistory` |
| `legalMoveSet` | useGameLogic | **BUG**: Currently returns empty set if `isAnalysisMode` is true. |


## Known Issues & Discrepancies

1.  **PGN Helper Logic**:
    `PGNService.replayMoveHistory` replays moves linearly. It does not support replaying a tree structure, so imported games lose all variations.

2.  **Pledge Data Loss**:
    `PGNParser` or `replayMoveHistory` may treat Pledges (`P:...`) incorrectly or rely on `Pass` logic that doesn't fully reconstruct the `Pledge` notation in the new history, potentially leading to data loss on re-export.
