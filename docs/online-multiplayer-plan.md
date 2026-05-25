# Online Multiplayer Plan

Last refreshed: 2026-05-25

Online multiplayer is not implemented. This document records the recommended architecture when it becomes a priority.

## Recommended Model

Use an authoritative server that validates action messages using the same TypeScript rules engine.

```text
Player A client
  -> sends action DTO
Server
  -> validates turn, ownership, legality
  -> applies action to server game state
  -> broadcasts accepted action/result
Player B client
  -> applies accepted action or reloads server snapshot
```

The client can validate locally for responsiveness, but the server decides truth.

## Action Messages

Send structured action DTOs, not raw clicks and not full React state.

Examples:

```ts
type OnlineAction =
  | { type: "MOVE"; pieceId: string; to: HexDTO }
  | { type: "ATTACK"; pieceId: string; target: HexDTO }
  | { type: "CASTLE_ATTACK"; pieceId: string; castle: HexDTO }
  | { type: "RECRUIT"; castle: HexDTO; spawn: HexDTO }
  | { type: "PLEDGE"; sanctuary: HexDTO; spawn: HexDTO }
  | { type: "ABILITY"; pieceId: string; ability: string; target: HexDTO }
  | { type: "PASS" };

type HexDTO = { q: number; r: number; s: number };
```

Map DTOs to existing command objects on the server.

## Client Integration Point

Do not revive old `useGameLogic` examples. The current client integration point is the `GameProvider`/command execution path:

- collect the accepted local action after command execution,
- send it to the server for online games,
- listen for remote accepted actions,
- apply them through the same command/mutation layer or load a server snapshot.

## Server Responsibilities

Minimum server responsibilities:

- create/join game rooms,
- assign colors,
- keep authoritative `GameState` and `Board`,
- validate active player and legal action,
- reject stale or illegal actions,
- broadcast accepted actions,
- persist completed PGN or game records.

Likely stack for first prototype:

| Layer | Suggested tool |
| --- | --- |
| HTTP API | Node.js + Express |
| Realtime | WebSocket or socket.io |
| Active games | In-memory map first; Redis later |
| Game history | Existing PGN export first; database later |

## Later Concerns

- reconnect and resync from server snapshots,
- clocks/timeouts on the server,
- spectator mode,
- accounts and ratings,
- anti-cheat and request signing,
- database schema for saved games and profiles.

