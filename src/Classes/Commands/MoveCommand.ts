/**
 * @file MoveCommand.ts
 * @description Command for piece movement actions.
 *
 * Encapsulates the logic for moving a piece from one hex to another.
 * Uses GameEngine for state mutation and emits events after execution.
 */

import { GameCommand, CommandResult, CommandType, CommandContext } from "./GameCommand";
import { GameState } from "../Core/GameEngine";
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { NotationService } from "../Systems/NotationService";
import { gameEvents, MoveMadeEvent } from "../Events";

/**
 * Command for moving a piece to a new hex.
 */
export class MoveCommand implements GameCommand {
  readonly type = CommandType.Move;
  private notation: string;

  constructor(
    private readonly piece: Piece,
    private readonly targetHex: Hex,
    private readonly context: CommandContext
  ) {
    // Pre-compute notation for efficiency
    this.notation = NotationService.getMoveNotation(piece, targetHex);
  }

  execute(state: GameState): CommandResult {
    try {
      const fromHex = this.piece.hex;
      // Use GameEngine.applyMove which handles history and tree updates
      const newState = this.context.gameEngine.applyMove(state, this.piece, this.targetHex);
      
      // Emit event for UI effects (sounds, animations)
      const event: MoveMadeEvent = {
        type: "MOVE_MADE",
        piece: this.piece,
        from: fromHex,
        to: this.targetHex,
        timestamp: Date.now(),
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
      };
      gameEvents.emit(event);

      return {
        newState,
        notation: this.notation,
        success: true,
      };
    } catch (error) {
      return {
        newState: state,
        notation: this.notation,
        success: false,
        error: error instanceof Error ? error.message : "Move failed",
      };
    }
  }

  getNotation(): string {
    return this.notation;
  }
}

