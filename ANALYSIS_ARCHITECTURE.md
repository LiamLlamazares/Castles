# Analysis Mode & PGN Architecture

## Overview

This document describes how Analysis Mode, Variant Creation, and PGN Import/Export work together.

---

## Key Concepts

### MoveTree
A tree data structure storing all moves with branches (variants).

```
Root (Start)
  └── G12G11 (Move 1 - Main Line)
        ├── H12H11 (Move 2 - Main Line)
        │     └── ...
        └── I11I10 (Move 2 - Variant)
              └── ...
```

Each node contains:
- `move`: The `MoveRecord` (notation, color, turn#, phase)
- `snapshot`: A `HistoryEntry` capturing game state at this position
- `children`: Array of child nodes
- `parent`: Reference to parent node

**Main Line Convention:**
- `children[0]` is **always** the main line / selected variation.
- Additional children (`children[1]`, `children[2]`, etc.) are alternative variations.
- To promote a variation to the main line, simply move it to the front of the array.

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
- Normal gameplay
- When viewing history: **moves are blocked** (indicators hidden, input ignored)
- Cannot create variants

### Analysis Mode (`analysisEnabled = true`)
- Enabled via "Analyze Game" button or PGN import
- When viewing history: **moves are allowed** (create variants!)
- Can navigate and branch freely

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
PGNService.parsePGN() → Extract moves array
    ↓
PGNService.replayMoveHistory()
    ↓
Creates fresh MoveTree + applies each move via GameEngine
    ↓
StateMutator.recordMoveInTree() adds each move to tree
    ↓
Return final state with tree
    ↓
App.tsx handleLoadGame() sets analysisEnabled=true
    ↓
GameBoard remounts with imported state
```

**Key Points:**
- `replayMoveHistory` does NOT manually add moves to tree
- The `GameEngine.applyMove()` → `StateMutator` → `recordMoveInTree()` chain handles it
- This prevents duplicate move recording

---

## Analysis Mode Entry

### Via "Analyze Game" button (after resign/victory)

```
Click Analyze → handleEnterAnalysis() → Export PGN → Import PGN → onLoadGame(analysisEnabled=true)
```

This reuses the PGN flow, which:
- Handles edge cases (resign = monarch removed)
- Creates a clean tree with snapshots
- Ensures consistent state

### Via PGN Import
Sets `analysisEnabled: true` automatically in `App.tsx handleLoadGame()`

---

## Variant Creation Flow

When a move is made while viewing history (and `analysisEnabled = true`):

```
User viewing history → Clicks piece → shouldHideMoveIndicators = false
    ↓
Show legal moves → User makes move
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

**Key Logic in `useGameLogic.ts`:**
```typescript
// Only hide move indicators in Play Mode when viewing history
const shouldHideMoveIndicators = !allowVariantCreation && isViewingHistory;
```

---

## State Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `analysisEnabled` | Props from App.tsx | Controls variant creation permission |
| `allowVariantCreation` | useGameLogic param | Same as above, passed down |
| `viewNodeId` | State | Currently viewed node ID (null = live) |
| `isViewingHistory` | Computed | `viewNodeId !== null` |
| `isAnalysisMode` | useAnalysisMode | `analysisEnabled && isViewingHistory` |
| `shouldHideMoveIndicators` | useGameLogic | `!analysisEnabled && isViewingHistory` |
