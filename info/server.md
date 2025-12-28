# Info for putting castles online

## How It Works

### The Core Concept

The way Lichess works is: three copies of the game run simultaneously:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│   ┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│   │   PLAYER A   │              │    SERVER    │              │   PLAYER B   │
│   │   (Browser)  │              │  (Node.js)   │              │   (Browser)  │
│   │              │              │              │              │              │
│   │  Full game   │    Move      │  Full game   │    Move      │  Full game   │
│   │  running     │───────────►  │  running     │ ───────────► │  running     │
│   │  locally     │    JSON      │  (validation)│    JSON      │  locally     │
│   │              │              │              │              │              │
│   └──────────────┘              └──────────────┘              └──────────────┘
│                                                                            │
│   Same React app                Same TypeScript                Same React app
│   from `npm start`              game logic runs                opponent sees
│                                 on server too                               
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

Basically two local copies of the game (like running `npm start` twice) with the server passing moves between them. The server also runs its own copy to validate moves are legal.



### Server Validation

The server runs the same TypeScript game logic I already wrote. Node.js executes TypeScript, so we just import the same files:

```
Existing codebase (runs on both client and server):
├── RuleEngine.ts
├── StateMutator.ts
├── GameEngine.ts
├── Board.ts, Hex.ts
└── MoveTree.ts
```

Both client and server validate moves. Client validates for instant feedback, server validates just in case.

---

## What Gets Sent to Server

### Action Messages (not raw clicks)

When a player clicks, the client figures out what action they're taking (using the useClickHandler hook in src/hooks/useClickHandler.ts) and sends a structured command to the server. The client doesn't send pixel coordinates or the whole game state. Just the command.

| Action | Message Format |
|--------|----------------|
| Move | `{ action: "MOVE", pieceId: "w_knight_1", to: { q: 2, r: -1, s: -1 } }` |
| Attack | `{ action: "ATTACK", pieceId: "w_knight_1", target: { q: 3, r: 0, s: -3 } }` |
| Recruit | `{ action: "RECRUIT", castle: { q: 0, r: 0, s: 0 }, pieceType: "Knight", hex: {...} }` |
| Pass | `{ action: "PASS" }` |
| Pledge | `{ action: "PLEDGE", sanctuary: {...}, pieceType: "Wizard", hex: {...} }` |
| Ability | `{ action: "ABILITY", ability: "Teleport", sourceId: "w_wizard_1", target: {...} }` |

### Move Flow

```mermaid
sequenceDiagram
    participant A as My Browser
    participant S as Server
    participant B as Opponent's Browser
    
    Stuff that happens in A:
    I click to move Knight to (2,-1,-1)
    A->>A: Client validates locally (instant feedback)
    A->>S: { action: "MOVE", pieceId: "w_knight_1", to: {q:2,r:-1,s:-1} }
    
    Stuff that happens in S:
    S: Server validates with RuleEngine
    S->>S: RuleEngine.getLegalMoves() check
    S->>S: StateMutator.applyMove()
    
    S->>A: MOVE_CONFIRMED
    S->>B: MOVE_MADE (same data)
    
    Stuff that happens in B:
    B: Opponent's client applies the move
```

---

## Implementation Plan

### Phase 0: Relay Only (Test connection)

No validation. Server just passes moves between players to test WebSocket connection.

| Task | Details |
|------|---------|
| Create `server/index.ts` | Express + socket.io, ~40 lines |
| Modify `useGameLogic.ts` | Add socket connect, emit after moves, listen for opponent |
| Modify `App.tsx` | Add text input for game ID |
| Test | Two browser tabs, share game ID, make moves |

**Success = moves sync between tabs.**

---

### Phase 1: Add Server Validation

Server validates moves before broadcasting. Rejects illegal moves.

| Task | Details |
|------|---------|
| Import game logic to server | `RuleEngine.ts`, `StateMutator.ts`, etc. |
| Add validation in `server/index.ts` | Check turn, check piece ownership, check legal moves |
| Handle validation errors | Send error back to client if move invalid |

---

### Phase 2: Game Lobby

Players can create/join games through UI instead of typing IDs.

| Task | Details |
|------|---------|
| Create `server/lobbyHandler.ts` | Manage open games list |
| Create `Lobby.tsx` component | Show open games, create/join buttons |
| Add game ID generation | Random IDs instead of manual entry |

---

### Phase 3+: Polish (Future)

See "Future Stuff" section below for:
- Disconnect/timeout handling
- User accounts
- Friends list
- ELO ratings

---

## Detailed Code Examples

### Phase 0: Server Code

```typescript
// server/index.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const games = new Map<string, { players: string[] }>();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinGame', (gameId: string) => {
    if (!games.has(gameId)) {
      games.set(gameId, { players: [] });
    }
    games.get(gameId)!.players.push(socket.id);
    socket.join(gameId);
    
    const playerNumber = games.get(gameId)!.players.length;
    socket.emit('joined', { gameId, color: playerNumber === 1 ? 'White' : 'Black' });
    
    if (playerNumber === 2) {
      io.to(gameId).emit('gameStart');
    }
  });

  // Relay action to opponent (NO VALIDATION)
  socket.on('action', (data: { gameId: string; action: any }) => {
    socket.to(data.gameId).emit('opponentAction', data.action);
  });
});

httpServer.listen(3001, () => console.log('Server on :3001'));
```

### Phase 0: Client Changes

**1. Add socket emit after each move (in `useMoveExecution.ts`):**

*So the server knows what move we made and can relay it to our opponent.*

```typescript
// BEFORE (local only)
const command = new MoveCommand(piece, targetHex, commandContext);
const result = command.execute(stateWithHistory);
if (result.success) {
  setState(...);
}

// AFTER (also sends to server)
const command = new MoveCommand(piece, targetHex, commandContext);
const result = command.execute(stateWithHistory);
if (result.success) {
  setState(...);
  
  // ADD THIS: Send to server
  socket.emit('action', {
    gameId,
    action: { type: 'MOVE', pieceId: piece.id, to: { q: targetHex.q, r: targetHex.r, s: targetHex.s } }
  });
}
```

**2. Listen for opponent moves (in `useGameLogic.ts`):**

*When opponent makes a move, we need to apply it to our local game state so the board updates.*

```typescript
// ADD this useEffect
useEffect(() => {
  socket.on('opponentAction', (action) => {
    if (action.type === 'MOVE') {
      const piece = state.pieces.find(p => p.id === action.pieceId);
      const targetHex = new Hex(action.to.q, action.to.r, action.to.s);
      // Execute the same command locally
      const cmd = new MoveCommand(piece, targetHex, commandContext);
      const result = cmd.execute(getEffectiveState());
      if (result.success) setState(prev => ({ ...prev, ...result.newState }));
    }
    // Handle ATTACK, RECRUIT, PASS, PLEDGE, ABILITY similarly
  });
  
  return () => socket.off('opponentAction');
}, [state.pieces]);
```

**3. Add game ID input (in `App.tsx`):**

*Players need a way to join the same game room. They share this ID with each other (e.g. via WhatsApp).*

```tsx
const [gameId, setGameId] = useState('');
const [joined, setJoined] = useState(false);

if (!joined) {
  return (
    <div>
      <input value={gameId} onChange={e => setGameId(e.target.value)} placeholder="Game ID" />
      <button onClick={() => { socket.emit('joinGame', gameId); setJoined(true); }}>Join</button>
    </div>
  );
}

return <GameBoard ... />;
```

### Phase 0: Test Flow

1. `npm install socket.io socket.io-client express`
2. `npx ts-node server/index.ts`
3. Open `localhost:3000` in two browser tabs
4. Enter same game ID in both (e.g. "test123")
5. Make a move in tab 1 → should appear in tab 2

---

### Phase 1: Server Validation Code

```typescript
// Add to server/index.ts (replace the simple relay)
import { RuleEngine } from '../src/Classes/Systems/RuleEngine';
import { StateMutator } from '../src/Classes/Systems/StateMutator';

socket.on('action', (data: { gameId: string; action: any }) => {
  const game = games.get(data.gameId);
  
  // Validate turn
  const currentPlayer = RuleEngine.getCurrentPlayer(game.state.turnCounter);
  if (game.players[currentPlayer] !== socket.id) {
    socket.emit('error', { message: 'Not your turn' });
    return;
  }
  
  // Validate move legality
  const piece = game.state.pieces.find(p => p.id === data.action.pieceId);
  const legalMoves = RuleEngine.getLegalMoves(game.state, piece, game.board);
  const target = new Hex(data.action.to.q, data.action.to.r, data.action.to.s);
  
  if (!legalMoves.some(h => h.equals(target))) {
    socket.emit('error', { message: 'Illegal move' });
    return;
  }
  
  // Apply and broadcast
  game.state = StateMutator.applyMove(game.state, piece, target, game.board);
  io.to(data.gameId).emit('opponentAction', data.action);
});
```

---

## Server Validation Code

The server imports existing game logic and validates every action:

```typescript
// server/gameHandler.ts
import { RuleEngine } from '../src/Classes/Systems/RuleEngine';
import { StateMutator } from '../src/Classes/Systems/StateMutator';

function handleMove(gameId: string, playerId: string, action: MoveAction) {
  const game = games.get(gameId);
  
  // Is it their turn?
  const currentPlayer = RuleEngine.getCurrentPlayer(game.state.turnCounter);
  if (game.players[currentPlayer] !== playerId) {
    return { error: "Not your turn" };
  }
  
  // Is the piece theirs?
  const piece = game.state.pieces.find(p => p.id === action.pieceId);
  if (!piece || piece.color !== currentPlayer) {
    return { error: "Cannot move opponent's piece" };
  }
  
  // Is the move legal? (SAME CODE AS CLIENT)
  const legalMoves = RuleEngine.getLegalMoves(game.state, piece, game.board);
  if (!legalMoves.some(h => h.equals(action.to))) {
    return { error: "Illegal move" };
  }
  
  // Apply and broadcast
  game.state = StateMutator.applyMove(game.state, piece, action.to, game.board);
  broadcast(gameId, { event: "MOVE_MADE", data: action });
}
```

---



# FUTURE STUFF

## Disconnect & Timeout Policy


| Scenario | Behavior |
|----------|----------|
| Player disconnects | Clock keeps ticking |
| 30s without a move | Player loses on time |
| Game starts, no move in 30s | Game aborted (no rating change) |
| Player reconnects | Game continues normally |

```typescript
// Server tracks time per player
interface GameSession {
  whiteTime: number;      // ms remaining
  blackTime: number;
  lastMoveAt: number;     // timestamp
  currentPlayer: 'white' | 'black';
}

// Clock ticks on server
setInterval(() => {
  for (const game of activeGames.values()) {
    const elapsed = Date.now() - game.lastMoveAt;
    if (game.currentPlayer === 'white') {
      game.whiteTime -= elapsed;
      if (game.whiteTime <= 0) endGame(game, 'black', 'timeout');
    } else {
      game.blackTime -= elapsed;
      if (game.blackTime <= 0) endGame(game, 'white', 'timeout');
    }
    game.lastMoveAt = Date.now();
  }
}, 1000);
```

---

## Social Features

### Difficulty Estimates

| Feature | Difficulty | Notes |
|---------|------------|-------|
| Game Lobby | Easy | Create/join games, list open games |
| User Accounts | Medium | Login, profile, game history |
| Friends List | Medium | Online status, challenges |
| ELO Rating | Easy | Simple math |

### Lobby

```
POST   /api/games              → Create new game
GET    /api/games              → List open games
POST   /api/games/:id/join     → Join a game
DELETE /api/games/:id          → Cancel/abort
```

### ELO Formula

Same as chess:

```
New Rating = Old Rating + K × (Actual - Expected)
Expected = 1 / (1 + 10^((OpponentRating - MyRating) / 400))

K = 32 for new players, 16 for established
Actual = 1 (win), 0.5 (draw), 0 (loss)
```

---

## Implementation Plan

### Phase 1: Static Hosting
1. `npm run build`
2. Upload `build/` to server
3. Configure nginx to serve `index.html`

### Phase 2: Lobby + Matchmaking
1. Node.js + Express + socket.io
2. Create/join game endpoints
3. Frontend lobby UI

### Phase 3: Real-Time Multiplayer
1. WebSocket events: MOVE, ATTACK, RECRUIT, PASS, PLEDGE, ABILITY
2. Server imports existing game logic
3. Clients send actions, receive broadcasts

### Phase 4: Polish
1. Database (Redis for active games, PostgreSQL for history)
2. Reconnection support
3. Spectator mode
4. PGN export

### Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React (existing) |
| WebSocket | socket.io |
| Server | Node.js + Express |
| Validation | Existing TypeScript code |
| Database | Redis + PostgreSQL |

---

## Questions for Server Setup

Infrastructure:
1. Server OS? (Linux distro, Windows?)
2. Node.js installed? Version?
3. Domain name or just IP?
4. HTTPS available?

Technical:
5. WebSocket preference? (socket.io vs raw)
6. Database preference? (SQLite, PostgreSQL, Redis?)
7. Authentication method? (Anonymous, accounts, OAuth?)

---