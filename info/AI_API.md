# AI Development API Reference

Quick reference for building AI agents for Castles.

---

## Core Imports

```typescript
import { IAgent, AIContext, AIContextBuilder } from '../Classes/AI';
import { GameEngine, GameState } from '../Classes/Core/GameEngine';
import { Board } from '../Classes/Core/Board';
import { RuleEngine } from '../Classes/Systems/RuleEngine';
import { TurnManager } from '../Classes/Core/TurnManager';
import { MoveCommand, AttackCommand, RecruitCommand, PledgeCommand, PassCommand } from '../Classes/Commands';
```

---

## IAgent Interface

All AI implementations must satisfy:

```typescript
interface IAgent {
  readonly name: string;  // Display name, e.g. "Random Bot v1.0"
  
  getNextAction(
    gameState: GameState,
    board: Board,
    myColor: Color
  ): Promise<GameCommand | null>;  // null = pass turn
}
```

---

## AIContextBuilder

Pre-computes all legal actions for AI:

```typescript
const context = AIContextBuilder.build(gameState, board, gameEngine, myColor);

// Access legal moves (Movement phase)
context.legalMoves.forEach((targetHexes, pieceHexKey) => { ... });

// Access legal attacks (Attack phase)
context.legalAttacks.forEach((targetHexes, pieceHexKey) => { ... });

// Access recruitment options (Recruitment phase)
context.recruitOptions; // { castleHex, spawnHexes, nextPieceType }[]

// Access pledge options
context.pledgeOptions; // { sanctuaryHex, spawnHexes, pieceType }[]

// Count total actions available
const count = AIContextBuilder.countActions(context);
```

---

## RuleEngine (Static Methods)

Query game rules without modifying state:

```typescript
// Get legal moves for a piece
const moves: Hex[] = RuleEngine.getLegalMoves(piece, gameState, board);

// Get legal attacks for a piece
const attacks: Hex[] = RuleEngine.getLegalAttacks(piece, gameState, board);

// Check if hex is defended
const defended: boolean = RuleEngine.isHexDefended(hex, byColor, gameState, board);

// Get occupied hexes
const occupied: Set<string> = RuleEngine.getOccupiedHexes(gameState.pieces);

// Get blocked hexes (rivers, etc.)
const blocked: Set<string> = RuleEngine.getBlockedHexes(board);
```

---

## TurnManager (Static Methods)

Query turn state:

```typescript
// Get current phase
const phase = TurnManager.getTurnPhase(turnCounter);  // "Movement" | "Attack" | "Recruitment"

// Get current player
const player = TurnManager.getCurrentPlayer(turnCounter);  // "w" | "b"
```

---

## Creating Commands

### MoveCommand
```typescript
const cmd = new MoveCommand(piece, targetHex, commandContext);
```

### AttackCommand
```typescript
const cmd = new AttackCommand(attacker, target, commandContext);
const castleCmd = new CastleAttackCommand(attacker, castle, commandContext);
```

### RecruitCommand
```typescript
const cmd = new RecruitCommand(castle, spawnHex, commandContext);
```

### PledgeCommand
```typescript
const sanctuary = gameState.sanctuaries.find(s => s.hex.equals(sanctuaryHex));
const cmd = new PledgeCommand(sanctuary, spawnHex, commandContext);
```

### PassCommand
```typescript
const cmd = new PassCommand(commandContext);
```

### CommandContext
```typescript
const commandContext = { gameEngine, board };
```

---

## Piece Properties

```typescript
piece.hex           // Hex position
piece.color         // 'w' | 'b'
piece.type          // PieceType enum
piece.canMove       // boolean - can still move this turn
piece.canAttack     // boolean - can still attack this turn
piece.strength      // number - combat strength
```

---

## Hex Utilities

```typescript
hex.toKey()            // "q,r,s" string for Map keys
Hex.fromKey(key)       // Parse back to Hex

hex.equals(other)      // Position equality
hex.cubeRing(1)        // Get 6 adjacent hexes
hex.distanceTo(other)  // Hex distance
```

---

## Board Access

```typescript
board.hexes          // All hex positions
board.castles        // All castles (initially neutral)
board.isRiver(hex)   // River terrain check
board.isHighGround(hex)
```

---

## Example: Minimal Random Agent

```typescript
class RandomAgent implements IAgent {
  readonly name = "Random";

  async getNextAction(state: GameState, board: Board, myColor: Color) {
    const ctx = AIContextBuilder.build(state, board, this.engine, myColor);
    
    // Collect all possible commands...
    const commands: GameCommand[] = [];
    
    // Movement phase
    ctx.legalMoves.forEach((hexes, pieceKey) => {
      const piece = state.pieces.find(p => p.hex.toKey() === pieceKey);
      hexes.forEach(h => commands.push(new MoveCommand(piece, h, this.cmdCtx)));
    });
    
    // Return random command or null
    return commands[Math.floor(Math.random() * commands.length)] ?? null;
  }
}
```

---

## Tips

1. **Always use `AIContextBuilder`** - Avoids redundant RuleEngine calls
2. **Return `null` to pass** - AI will auto-pass if no actions available
3. **Collections are readonly** - Don't try to mutate context data
4. **Use `commandContext`** - Required for all commands to access engine
