/**
 * @file AIController.ts
 * @description Orchestrates AI turns by executing actions across all phases.
 *
 * The controller handles the full turn sequence:
 * - Movement phase (up to 2 actions)
 * - Attack phase (up to 2 actions)
 * - Recruitment phase (1 action per castle/sanctuary)
 *
 * It respects the game's phase system and automatically passes when
 * the AI has no valid actions.
 *
 * @see IAgent - The decision-making interface
 * @see GameEngine - Provides game state transitions
 */

import { IAgent } from "./IAgent";
import { GameState, GameEngine } from "../Core/GameEngine";
import { Board } from "../Core/Board";
import { TurnManager } from "../Core/TurnManager";
import { PassCommand } from "../Commands/PassCommand";
import { CommandContext } from "../Commands/GameCommand";
import { Color, TurnPhase, PHASE_CYCLE_LENGTH } from "../../Constants";

/**
 * Controls AI execution through a complete turn.
 *
 * Usage:
 * ```typescript
 * const controller = new AIController(agent, gameEngine, board);
 * const newState = await controller.playTurn(state, 'b');
 * ```
 */
export class AIController {
  private agent: IAgent;
  private gameEngine: GameEngine;
  private board: Board;
  private commandContext: CommandContext;

  constructor(agent: IAgent, gameEngine: GameEngine, board: Board) {
    this.agent = agent;
    this.gameEngine = gameEngine;
    this.board = board;
    this.commandContext = { gameEngine, board };
  }

  /**
   * Plays through all phases of a player's turn.
   *
   * @param state - Current game state
   * @param color - The AI's color
   * @returns The game state after all AI actions
   */
  async playTurn(state: GameState, color: Color): Promise<GameState> {
    let currentState = state;

    // Continue until it's no longer this player's turn
    while (this.isMyTurn(currentState, color)) {
      const action = await this.agent.getNextAction(
        currentState,
        this.board,
        color
      );

      if (action) {
        const result = action.execute(currentState);
        if (!result.success) {
          console.error(`[AIController] Action failed: ${result.error}`);
          // Pass on failure to avoid infinite loops
          currentState = this.pass(currentState);
        } else {
          currentState = result.newState;
        }
      } else {
        // No action available - pass this phase
        currentState = this.pass(currentState);
      }
    }

    return currentState;
  }

  /**
   * Plays a single action (for step-by-step debugging).
   *
   * @returns The new state and whether an action was taken
   */
  async playSingleAction(
    state: GameState,
    color: Color
  ): Promise<{ state: GameState; actionTaken: boolean }> {
    if (!this.isMyTurn(state, color)) {
      return { state, actionTaken: false };
    }

    const action = await this.agent.getNextAction(state, this.board, color);

    if (action) {
      const result = action.execute(state);
      if (result.success) {
        return { state: result.newState, actionTaken: true };
      } else {
        console.error(`[AIController] Action failed: ${result.error}`);
        return { state: this.pass(state), actionTaken: true };
      }
    } else {
      return { state: this.pass(state), actionTaken: true };
    }
  }

  /**
   * Checks if it's currently this player's turn.
   */
  private isMyTurn(state: GameState, color: Color): boolean {
    return TurnManager.getCurrentPlayer(state.turnCounter) === color;
  }

  /**
   * Gets the current phase.
   */
  private getPhase(state: GameState): TurnPhase {
    return TurnManager.getTurnPhase(state.turnCounter);
  }

  /**
   * Passes the current phase.
   */
  private pass(state: GameState): GameState {
    const passCommand = new PassCommand(this.commandContext);
    const result = passCommand.execute(state);
    return result.newState;
  }
}

/**
 * Utility: Run a complete AI vs AI game for testing.
 *
 * @param whiteAgent - Agent controlling white pieces
 * @param blackAgent - Agent controlling black pieces
 * @param gameEngine - Game engine instance
 * @param board - Board topology
 * @param initialState - Starting game state
 * @param maxTurns - Maximum turns before timeout (prevents infinite games)
 * @returns Final game state and statistics
 */
export async function runAIGame(
  whiteAgent: IAgent,
  blackAgent: IAgent,
  gameEngine: GameEngine,
  board: Board,
  initialState: GameState,
  maxTurns: number = 200
): Promise<{
  finalState: GameState;
  turnCount: number;
  winner: Color | null;
  timedOut: boolean;
}> {
  let state = initialState;
  let turnCount = 0;
  const whiteController = new AIController(whiteAgent, gameEngine, board);
  const blackController = new AIController(blackAgent, gameEngine, board);

  while (turnCount < maxTurns) {
    const currentPlayer = TurnManager.getCurrentPlayer(state.turnCounter);

    // Check for game end
    const winner = gameEngine.getWinner(state.pieces, state.castles, state.victoryPoints);
    if (winner) {
      return { finalState: state, turnCount, winner, timedOut: false };
    }

    // Play one full player turn
    if (currentPlayer === "w") {
      state = await whiteController.playTurn(state, "w");
    } else {
      state = await blackController.playTurn(state, "b");
    }

    // Increment turn count after both players have moved
    if (currentPlayer === "b") {
      turnCount++;
    }
  }

  // Timed out - check final winner
  const winner = gameEngine.getWinner(state.pieces, state.castles, state.victoryPoints);
  return { finalState: state, turnCount, winner, timedOut: true };
}
