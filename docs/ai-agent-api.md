# AI Agent API

Last refreshed: 2026-05-25

This is the current reference for local AI agents. The app currently includes a random AI opponent; stronger agents should use the same command and rules boundaries.

## Agent Contract

AI implementations satisfy `IAgent` in `src/Classes/AI/IAgent.ts`.

```ts
interface IAgent {
  readonly name: string;

  getNextAction(
    gameState: GameState,
    board: Board,
    myColor: Color
  ): Promise<GameCommand | null>;
}
```

Return a `GameCommand` to act. Return `null` to pass.

## Decision Context

Use `AIContextBuilder.build(gameState, board, gameEngine, myColor)` to collect legal actions for the active phase.

The context includes:

| Field | Meaning |
| --- | --- |
| `phase` | Current phase from `TurnManager`. |
| `legalMoves` | Map from piece hex key to legal movement targets. |
| `legalAttacks` | Map from piece hex key to legal attack targets. |
| `recruitOptions` | Castle recruitment options for the current Recruitment phase. |
| `pledgeOptions` | Sanctuary pledge/spawn options for the current Recruitment phase. |
| `abilityOptions` | Attack-phase ability targets for special pieces. |

Use `AIContextBuilder.countActions(context)` when deciding whether to pass.

## Command Boundary

Agents should choose commands, not mutate `GameState` directly.

Common commands:

| Command | Use |
| --- | --- |
| `MoveCommand` | Piece movement. |
| `AttackCommand` | Piece attacks. |
| `CastleAttackCommand` | Castle capture. |
| `RecruitCommand` | Castle recruitment. |
| `PledgeCommand` | Sanctuary pledging. |
| `AbilityCommand` | Wizard, Necromancer, and other ability actions. |
| `PassCommand` | Explicit phase/slot pass. |

Commands require a `CommandContext` with `gameEngine` and `board`.

## Implementation Guidance

- Query legality through `AIContextBuilder`, `RuleEngine`, or `GameEngine`; do not copy movement or attack rules into an agent.
- Treat `GameState` as immutable.
- Prefer scoring candidate commands from the context, then execute only the selected command through the normal game action path.
- Any search/minimax agent must account for phases: Movement, Attack, and Recruitment have different legal action sets.
- Add tests for no-action/pass behavior, phase-specific action choice, and at least one replay-safe action sequence.

