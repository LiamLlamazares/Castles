# Notes on react ts and hoooks

## React
### Components (the function)
- Must use Upper case and inside `</>` like `<Hexagon />`
- Can be imported from another file
```typescript
import { Hexagon } from "./Hexagon";
```
Must be inside `<>...</>` (otherwise won't work with hooks and re-rendering)
```typescript
return <Hexagon />;
```
Becomes a child when used within another component
```typescript
const GameBoard: React.FC<GameBoardProps> = (inputs) => {
    // Calculations 
    const hexagons = ...;
    return (
        <HexGrid 
            hexagons={hexagons} 
        />
    )
}
```

### Props (the input)
Piece of data passed from parent to child component. Cannot be changed by component.  In example above `hexagons`.

### Hooks (the state and update functions)
A function that starts with "use". 
- `useState`: is a hook with output state and function to change it
```typescript
const [thing, f] = useState<typeof_thing>(x);
f(y) // Triggers a re-render and sets thing to y
```
- `useMemo`: hook that returns a memoized value. Only re-computes if [dependencies] change
```typescript
const memoizedValue = useMemo<typeof_value>(() => computeExpensiveValue(a, b), [a, b]);
```

- `useEffect`: hook that runs a function when dependencies change
```typescript
useEffect(() => {
    // do something
}, [dependencies]);
```

- Custom hooks: hooks that call other hooks
```typescript
export const useAnalysisMode = (state,setState) => {
    // Calculation logic
    return{a,b,c}
}

const {a,b,c} = useAnalysisMode(state,setState);
```

#### Where to call
- Always inside components (or custom hooks) so that they bind on to the component and re-render when the state changes
- Cannot be in ifs or loops


### Re-rendering
Occur whenever a hook function (e.g. `setState`) is called. Triggers a re-render of the component and all of its children. All of function finished before value is updated and re-rendered.
```typescript
const MyComponent = () => {
    const [x,f] = useState<typeof_x>(x);
    const g = () => {
        y = h(x)
        f(y) // Triggers a re-render and sets x to y
    console.log(x) // x is still x
    }
    g(); // prints x changes it to y and re-renders
}
```


## Typescript
- `const`: Thing that is not going to change `const x = 5` means x will always be 5
- `let`: Thing that is going to change
- <T extends ...>: T is something that includes ...
- `interface`: Blueprint for an object, tells JS object must contain certain properties
```typescript
export interface AnalysisModeActions {
  jumpToMove: (moveIndex: number | null) => void;
  stepHistory: (direction: -1 | 1) => void;
}
```
- `interface extends`:  Creates a new blueprint that contains all the properties of the old blueprint + some new ones 

```typescript
interface AnalysisModeState extends HistoryState {
    viewMoveIndex: number | null;
}
```
- **Destructuring**:
  - Use `[]` for ordered results (like `useState`).
  - Use `{}` for named results (like `useAnalysisMode`).


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

### 5. Hook Definition & Destructuring: `export const useX = ({ props }: Type) => ...`
This is a standard way to define hooks. It combines three things:
- **`export const`**: Makes the hook available to other files.
- **`({ props }: Type)`**: This is **Argument Destructuring**. Instead of passing a single `box` and saying `box.onPass`, we "unpack" the box immediately. The `: Type` part ensures the "box" has exactly what we expect.
- **`=>`**: The arrow that starts the function body.

Example from [useInputHandler.ts](file:///c:/Users/liaml/Documents/GitHub/Castles/src/hooks/useInputHandler.ts):
```typescript
export const useInputHandler = ({ onPass, ... }: UseInputHandlerProps) => { ... }
```
It's like saying: "Here is a hook that needs a suitcase (`UseInputHandlerProps`). Open the suitcase and give me the `onPass` function immediately."

---

# Command Pattern Architecture

The Command Pattern encapsulates game actions as objects. This enables:
- **Undo/Redo**: Commands can be stored and reversed
- **Action history**: Complete log for debugging
- **Testability**: Commands execute in isolation

## Command Interface

```typescript
// src/Classes/Commands/GameCommand.ts
interface GameCommand {
  readonly type: CommandType;
  execute(state: GameState): CommandResult;
  getNotation(): string;
}
```

## Available Commands

| Command | Type | Description |
|---------|------|-------------|
| `MoveCommand` | MOVE | Piece movement |
| `AttackCommand` | ATTACK | Piece combat |
| `CastleAttackCommand` | CASTLE_ATTACK | Castle capture |
| `PassCommand` | PASS | Skip phase |
| `RecruitCommand` | RECRUIT | Spawn piece |
| `PledgeCommand` | PLEDGE | Sanctuary pledging |
| `AbilityCommand` | ABILITY | Special abilities |

## Usage Example

```typescript
import { MoveCommand, CommandContext } from "../Classes/Commands";

const context: CommandContext = { gameEngine, board };
const command = new MoveCommand(piece, targetHex, context);
const { newState, notation, success } = command.execute(currentState);
```

---

# GameContext/GameProvider Architecture

> **Note**: As of January 2026, `useGameLogic` was refactored into a Context-based architecture.

The game now uses a `GameProvider` component that wraps the game UI. This replaces the previous "God Hook" pattern:

```
GameProvider.tsx (284 lines)
├── useCoreGame (state initialization)
├── useComputedGame (derived values: turn phase, legal moves)
├── useMoveExecution (action execution)
│   ├── handlePass
│   ├── handleHexClick
│   ├── pledge
│   └── triggerAbility
├── useGameAnalysisController (history navigation)
├── useGameInteraction (piece selection, click handling)
├── usePGN (import/export)
└── useSoundEffects (audio via event subscription)
```

## Context Split

| Context | Purpose | Usage |
|---------|---------|-------|
| `GameStateContext` | Read-only game state | `useGameState()` |
| `GameDispatchContext` | Action methods | `useGameActions()` |

**Benefit**: Components that only need actions won't re-render on state changes.

## Usage Example

```tsx
// In Game.tsx
import { GameProvider } from '../contexts/GameProvider';

<GameProvider config={config} rules={rules} mode={mode}>
  <HexGrid />
  <ControlPanel />
</GameProvider>

// In any child component
import { useGameState, useGameActions } from '../contexts/GameContext';

const { pieces, turnPhase } = useGameState();
const { handleHexClick, handlePass } = useGameActions();
```

---

# Event System Architecture

The Event System decouples state mutations from side effects using a pub/sub pattern.

## Event Types

| Event | When Emitted |
|-------|--------------|
| `MOVE_MADE` | After piece movement |
| `ATTACK_RESOLVED` | After combat |
| `CASTLE_CAPTURED` | Castle changes owner |
| `PIECE_RECRUITED` | New piece spawned |
| `TURN_CHANGED` | Phase/player changes |
| `PIECE_DESTROYED` | Combat death |
| `SANCTUARY_PLEDGED` | Pledge action |
| `ABILITY_ACTIVATED` | Special ability |
| `GAME_ENDED` | Game over |

## Usage

```typescript
import { gameEvents } from "../Classes/Events";

// Subscribe to specific events
const unsubscribe = gameEvents.on("MOVE_MADE", (event) => {
  playMoveSound(event.from, event.to);
  animatePiece(event.piece, event.from, event.to);
});

// Subscribe to all events (for logging)
gameEvents.onAll((event) => {
  console.log(`[${event.type}]`, event);
});

// Commands emit events automatically after execution
const command = new MoveCommand(piece, targetHex, context);
command.execute(state); // Emits MOVE_MADE event
```

---

# Analysis Mode Architecture

Analysis mode allows players to navigate through move history without affecting the live game.

## Key Concepts

| Concept | Value | Meaning |
|---------|-------|---------|
| `viewNodeId` | `null` | Viewing live game |
| `viewNodeId` | `"abc123"` | Viewing historical position |
| `isViewingHistory` | `viewNodeId !== null` | Derived, not stored |

## MoveTree Methods

```typescript
// Get snapshot for display
const snapshot = moveTree.getViewState(viewNodeId);

// Get the node object
const node = moveTree.getViewNode(viewNodeId);

// Check if at live position
const isLive = moveTree.isAtLivePosition(viewNodeId);
```

## Hook Composition

```typescript
// useAnalysisMode provides navigation + state retrieval
const { jumpToNode, stepHistory, analysisState } = useAnalysisMode(state, setState);
```

---

# Piece Factory Pattern

The PieceFactory centralizes piece creation with type-safe methods.

## Usage

```typescript
import { PieceFactory } from "../Classes/Entities/PieceFactory";

// Type-specific creation
const swordsman = PieceFactory.createSwordsman(hex, "w");

// Generic creation with enum
const piece = PieceFactory.fromType(PieceType.Archer, hex, "b");

// Special cases
const spent = PieceFactory.createSpent(PieceType.Knight, hex, "w"); // Can't act
const revived = PieceFactory.createRevived(PieceType.Wolf, hex, "b"); // Necromancer
```


# Strategy Registry Pattern & Piece Configuration

The Strategy Registry pattern decouples `Piece` class from specific movement/attack implementations.

## Centralized Piece Configuration

All piece metadata (strength, attack type, descriptions) is consolidated in **`PieceTypeConfig.ts`**, which provides a single source of truth for piece characteristics.

```typescript
// Example: Get piece configuration
import { getPieceConfig, getPieceStrength } from './Classes/Config/PieceTypeConfig';

const dragonConfig = getPieceConfig(PieceType.Dragon);
console.log(dragonConfig.strength);      // 3
console.log(dragonConfig.attackType);    // AttackType.Melee
console.log(dragonConfig.description);   // "Slides up to 3 hexes..."

// Convenience functions
const strength = getPieceStrength(PieceType.Archer); // 1
```

### Benefits
- **Single Source of Truth**: All piece data in one place
- **Easy to Extend**: Add new pieces by editing one file
- **Type-Safe**: Full TypeScript support
- **Self-Documenting**: Descriptions included in config

## Adding a New Piece Type

Only **4 files** need to change:

| File | What to Add |
|------|-------------|
| [`Constants.ts`](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Constants.ts) | Add to `PieceType` enum |
| [`PieceTypeConfig.ts`](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Classes/Config/PieceTypeConfig.ts) | Add config entry (strength, attackType, description) |
| [`MoveStrategyRegistry.ts`](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Classes/Strategies/MoveStrategyRegistry.ts) | Register movement strategy |
| [`AttackStrategyRegistry.ts`](file:///c:/Users/liaml/Documents/GitHub/Castles/src/Classes/Strategies/AttackStrategyRegistry.ts) | Register attack type and strategy |

**That's it!** No need to modify the core `Piece` class or scatter `switch` statements across the codebase.

## Example: Adding a "Champion" Piece

```typescript
// 1. Constants.ts - Add to enum
export enum PieceType {
  // ... existing types
  Champion = "Champion",
}

// 2. PieceTypeConfig.ts - Add configuration
export const PieceTypeConfig: Record<PieceType, PieceConfig> = {
  // ... existing configs
  [PieceType.Champion]: {
    strength: 2,
    attackType: AttackType.Melee,
    description: "Walks up to 2 hexes in any direction. Attacks adjacent hexes. Strength 2.",
  },
};

// 3. MoveStrategyRegistry.ts - Register movement
registerMoveStrategy(PieceType.Champion, (hex, blocked, valid, color, boardSize) => 
  getWalkingMoves(hex, blocked, valid, 2) // Walks 2 hexes
);

// 4. AttackStrategyRegistry.ts - Already registered!
// If using AttackType.Melee, meleeAttacks is already registered for all Melee types
```

## How It Works

- **PieceTypeConfig**: Stores static metadata (strength, attackType, description)
- **MoveStrategyRegistry**: Maps `PieceType` → movement function
- **AttackStrategyRegistry**: Maps `AttackType` → attack function
- **Piece.ts**: Delegates to registries via getters

This separation ensures that:
1. Metadata stays centralized and easy to find
2. Complex strategies can be implemented independently
3. Adding new pieces doesn't require modifying core class logic


**Key Benefit:** No changes needed to `Piece.ts`, `RuleEngine.ts`, or `StateMutator.ts`.
