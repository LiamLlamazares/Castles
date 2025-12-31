# Board Centering Bug Analysis

**Date**: 2025-12-31  
**Status**: ✅ RESOLVED

---

## Problem Statement

The game board was not vertically centered within its container. It appeared pushed toward the **top** of the available space, with excessive empty space at the **bottom**.

---

## Root Cause

`useInputHandler.ts` was calling `layout.updateDimensions(window.innerWidth - 300, window.innerHeight)` on every resize and on initial load. This:

1. Changed `pixelWidth/pixelHeight` from `VIRTUAL_CANVAS_SIZE (1000)` to actual window pixels (e.g., 1140x765)
2. Recalculated `size_hexes` to a smaller value (25.65 instead of 37.59)
3. **But** the `viewBox` was already calculated via `useMemo` using the original hexSize (37.59)
4. Result: Hexes rendered smaller than the viewBox expected → empty space at bottom/right

---

## The Fix

Removed the `updateDimensions()` calls from `useInputHandler.ts`. With viewBox-based scaling:
- All calculations stay at `VIRTUAL_CANVAS_SIZE = 1000`
- SVG `viewBox` + `preserveAspectRatio="xMidYMid meet"` handles all scaling automatically
- No need to manually resize the layout

### Files Changed:
- `useInputHandler.ts` - Removed `updateDimensions` calls and unused `layout` prop
- `LayoutService.ts` - Removed deprecated `updateDimensions` method and debug logs
- `Game.tsx` - Removed debug logs and unused `layout` prop from useInputHandler
- `HexGrid.tsx` - Removed debug logs
- `LayoutService.test.ts` - Updated tests for new behavior

---

## How ViewBox Scaling Works

```
┌─────────────────────────────────────────────┐
│  Virtual Canvas (1000x1000)                 │
│  ┌───────────────────────────────────────┐  │
│  │                                       │  │
│  │         Hexes at fixed coords         │  │
│  │         (calculated once)             │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  viewBox = bounding box + padding           │
└─────────────────────────────────────────────┘
                    ↓
         SVG viewBox attribute
                    ↓
┌─────────────────────────────────────────────┐
│  Actual Container (any size)                │
│                                             │
│    preserveAspectRatio="xMidYMid meet"      │
│    → Scales and centers automatically       │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Modularity

This approach works for **any board size**:

| Component | Status |
|-----------|--------|
| Game.tsx | ✅ Uses `calculateViewBox()` |
| GameSetup.tsx | ✅ Uses `calculateViewBox()` |
| BoardEditor.tsx | ✅ Uses `calculateViewBox()` |
| MapEditor.tsx | ✅ Uses `calculateViewBox()` |
| Tutorial | ✅ Uses same GameBoard component |

Any board radius (3, 5, 7, 13, etc.) will:
1. Calculate its own viewBox based on hex positions
2. Center automatically via `xMidYMid meet`
3. Scale to fit the container


