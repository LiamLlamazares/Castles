# Board Centering Bug Analysis

**Date**: 2025-12-31  
**Status**: 🔴 Not Resolved

---

## Problem Statement

The game board is not vertically centered within its container. It appears pushed toward the **top** of the available space, with excessive empty space at the **bottom**.

---

## Key Observations

### 1. ViewBox vs Rendered Content Mismatch

| Mode | ViewBox Height | Actual Content Height | Empty Space at Bottom |
|------|---------------|----------------------|----------------------|
| **Setup Preview** | ~1008 units | ~988 units | ~20 units ✅ (correct) |
| **Game Mode** | ~1008 units | ~755 units | ~250 units ❌ (wrong) |

**The viewBox is calculated once but the content is rendered at different sizes in different modes.**

### 2. Hex Size Discrepancy

| Mode | Hex Size (calculated from rendered polygons) |
|------|---------------------------------------------|
| Setup Preview | ~43.8 units (matches calculated viewBox) |
| Game Mode | ~33.5 units (smaller than viewBox expects) |

**The hexes are rendered at different sizes, but the viewBox doesn't adapt.**

### 3. Reflection Issue (Partially Fixed)

- `HexGrid.tsx` uses `hex.reflect().getKey(!isBoardRotated)` to get polygon points
- `calculateViewBox()` was using `polygonCorners(hex)` without reflection
- **Fix Applied**: Changed to `polygonCorners(hex, true)` 
- **Result**: ViewBox values changed but problem persists

---

## Root Cause Hypotheses (Priority Order)

### 🔴 **Priority 1: Different LayoutService Instances**

**Hypothesis**: The `calculateViewBox()` is being called on a LayoutService with different parameters than the one used by HexGrid for rendering.

**Evidence**: 
- Hex size in Setup: 43.8, Hex size in Game: 33.5
- The LayoutService might be created with different container dimensions

**How to Verify**:
```typescript
// Add to LayoutService.calculateViewBox()
console.log('[ViewBox] hexSize:', this.size_hexes, 'origin:', this.origin);

// Add to HexGrid.tsx getPolygonPoints
console.log('[HexGrid] Using layout hexSize:', layout.size_hexes);
```

**Solution**: Ensure the same LayoutService instance (with same parameters) is used for both `calculateViewBox()` and rendering.

---

### 🟠 **Priority 2: Board Rotation State Mismatch**

**Hypothesis**: The `isBoardRotated` parameter used during `calculateViewBox()` might differ from what's used during rendering.

**Evidence**:
- HexGrid uses `hex.reflect().getKey(!isBoardRotated)` - the `!isBoardRotated` is key
- `polygonCorners(hex, isReflected)` uses `isReflected` directly
- If these don't match, bounds will be wrong

**How to Verify**:
```typescript
// Add to calculateViewBox()
console.log('[ViewBox] isReflected: true (hardcoded)');

// Add to Game.tsx where viewBox is calculated
console.log('[Game] isBoardRotated state:', isBoardRotated);
```

**Solution**: Pass `isBoardRotated` to `calculateViewBox()` and use `!isBoardRotated` for the reflection parameter.

---

### 🟡 **Priority 3: Game.tsx Uses Different Layout Than HexGrid**

**Hypothesis**: In Game.tsx, the `viewBox` is calculated using `useMemo` with `layout` as dependency, but the `layout` passed to HexGrid might be different.

**Evidence**: Need to verify by logging

**How to Verify**:
```typescript
// Add to Game.tsx near viewBox calculation
console.log('[Game] viewBox layout instance:', layout);
console.log('[Game] viewBox result:', viewBox);

// Add to HexGrid
console.log('[HexGrid] received layout:', layout);
```

**Solution**: Ensure consistent layout instance usage.

---

### 🟢 **Priority 4: Orientation (Flat-top vs Pointy-top)**

**Hypothesis**: The board orientation might be different between viewBox calculation and rendering.

**Evidence**: Both modes show flat-top orientation (hex width > height), so this is likely NOT the issue.

---

## Quick Diagnostic Code

Add this to `LayoutService.ts` in `calculateViewBox()`:

```typescript
public calculateViewBox(padding: number = 10): string {
  console.group('[LayoutService.calculateViewBox]');
  console.log('hexSize:', this.size_hexes);
  console.log('origin:', this.origin);
  console.log('hexCount:', this.board.hexes.length);
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  this.board.hexes.forEach(hex => {
    const corners = this.layout.polygonCorners(hex, true);
    corners.forEach(corner => {
      if (corner.x < minX) minX = corner.x;
      if (corner.x > maxX) maxX = corner.x;
      if (corner.y < minY) minY = corner.y;
      if (corner.y > maxY) maxY = corner.y;
    });
  });

  const width = maxX - minX;
  const height = maxY - minY;

  console.log('bounds:', { minX, maxX, minY, maxY });
  console.log('size:', { width, height });
  console.groupEnd();
  
  return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
}
```

Add this to `HexGrid.tsx` top:

```typescript
// Add inside the HexGrid component, at the start
console.log('[HexGrid] layout.size_hexes:', layout.size_hexes, 'hexCount:', hexagons.length);
```

---

## Next Steps

1. **Add console logging** to both `calculateViewBox()` and `HexGrid.tsx`
2. **You check the console** in Setup mode and Game mode
3. **Compare the values** - specifically `hexSize` and `origin`
4. If they differ, we know the LayoutService instances are different
5. Fix by ensuring consistent LayoutService usage

---

## Files Involved

| File | Role |
|------|------|
| `LayoutService.ts` | Calculates viewBox, contains hex sizing logic |
| `Game.tsx` | Creates viewBox useMemo, passes layout to HexGrid |
| `HexGrid.tsx` | Renders polygons using layout |
| `GameSetup.tsx` | Setup preview, similar viewBox+layout pattern |

