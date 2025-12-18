# Deep Dive: The Left Arrow Key (Step-by-Step Architecture)

This document provides a technical "Trace" of exactly what happens when you press the **Left Arrow Key** on your keyboard.

---

## Stage 1: The Browser Event Listener
**File:** `src/hooks/useInputHandler.ts`

When the game loads, React sets up a "Global Listener" on your browser window. This is like a security guard waiting for a specific signal.

```typescript
// Line 63 in useInputHandler.ts
useEffect(() => {
  // We tell the browser: "Whenever a key is pressed (keydown), 
  // run the handleKeyDown function"
  window.addEventListener("keydown", handleKeyDown);
  
  // Cleanup (runs when you close the game)
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [handleKeyDown]);
```

---

## Stage 2: Catching the signal
**File:** `src/hooks/useInputHandler.ts`

The `handleKeyDown` function receives a "KeyboardEvent" from the browser. It check's the "code" property to see if it matches `ArrowLeft`.

```typescript
// Line 24 in useInputHandler.ts
const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case "ArrowLeft":
        // Here is the trigger!
        // It calls the function 'onNavigate' with a value of -1
        onNavigate(-1); 
        break;
    }
};
```

### Where is `onNavigate` defined? (The Notation)
Notice the top of the file:
```typescript
export const useInputHandler = ({ onNavigate, ... }: UseInputHandlerProps) => { ... }
```
`onNavigate` is **not defined** in this file. It is a "Prop" (Property). It is a blank slot that must be filled by whichever file uses (calls) this hook.

---

## Stage 3: The Mapping (The Bridge)
**File:** `src/components/Game.tsx`

This is where code from different files connects. In React, we use **Objects** (the `{}` curly braces) to pass lists of functions between files.

```tsx
// Line 169 in Game.tsx
useInputHandler({
  onPass: handlePass,
  onNavigate: stepHistory, // <--- THE MAPPING
});
```

**What this notation `({ onNavigate: stepHistory })` means:**
1.  We are calling the `useInputHandler` function.
2.  We are passing it one **Object** (the suitcase).
3.  Inside that suitcase, we have a label called `onNavigate`.
4.  Inside the `onNavigate` slot, we have placed the actual `stepHistory` function.

**RESULT:** When `useInputHandler` calls `onNavigate(-1)`, it is physically executing the `stepHistory` code.

---

## Stage 4: Moving the History Cursor
**File:** `src/hooks/useAnalysisMode.ts`

Now we are inside the `stepHistory` function. Its job is to calculate the new position in history.

```typescript
// Line 53 in useAnalysisMode.ts
const stepHistory = (direction: -1 | 1) => {
    setState(prev => {
      // 1. If currently "Live" (null), jump to the last move played
      if (prev.viewMoveIndex === null) {
        if (direction === -1 && prev.history.length > 0) {
           return { ...prev, viewMoveIndex: prev.history.length - 1 };
        }
      }

      // 2. Otherwise, move the index backwards by 1
      const newIndex = prev.viewMoveIndex + direction; // 10 + (-1) = 9
      
      // 3. Return the new state to React
      return { 
          ...prev,           // Keep everything else the same
          viewMoveIndex: newIndex // Update ONLY the index to 9
      };
    });
};
```

---

## Stage 5: React Re-calculates the Board
**File:** `src/hooks/useGameLogic.ts`

Because we called `setState`, React re-runs the game logic. It sees that `viewMoveIndex` is now `9`. It uses a **Memoized Selector** to pick the right pieces for the screen.

```typescript
// Line 173 in useGameLogic.ts
const viewState = useMemo(() => {
  // Are we in history mode? Yes, because viewMoveIndex is 9 (not null)
  if (isAnalysisMode) {
      // Look into the history library and grab the photo (snapshot) 
      // of the board at Turn 9.
      const snapshot = state.history[state.viewMoveIndex]; 
      
      return {
          ...state,        // Take current game settings
          pieces: snapshot.pieces, // OVERWRITE pieces with the 9th turn ones
          castles: snapshot.castles, // OVERWRITE castles
      };
  }
  return state; // If live, just return actual reality
}, [state, isAnalysisMode]);
```

---

## Notation Glossary for Non-React Devs

### 1. Destructuring: `const { x } = hook()`
It means "Extract". If a hook returns an object with 50 things in it, but you only want `pieces`, you write `const { pieces } = useGameLogic()`.

### 2. Arrow Functions: `(x) => { ... }`
The same as writing `function(x) { ... }`. It's just less typing.

### 3. State Setter: `setState(prev => { ... })`
In React, you cannot do `game.turn = 5`. You MUST call a setter.
*   `prev` is the **Current State** of the game.
*   The function must return a **Modified Copy** of the state.

### 4. Spread Operator: `...prev`
This means "Copy all properties from `prev`". It ensures that when you update the `turnNumber`, you don't accidentally delete the list of `pieces`.
