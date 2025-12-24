/**
 * @file PledgeCommand.ts
 * @description Command for pledging at a sanctuary.
 *
 * Encapsulates sanctuary pledging logic, spawning a new piece
 * in exchange for pledging at a sanctuary hex.
 *
 * @see GameCommand - Base command interface
 * @see SanctuaryService - Underlying pledge logic
 */

import { GameCommand, CommandResult, CommandType, CommandContext } from "./GameCommand";
import { GameState } from "../Core/GameEngine";
import { Hex } from "../Entities/Hex";
import { Sanctuary } from "../Entities/Sanctuary";
import { NotationService } from "../Systems/NotationService";

/**
 * Command for pledging at a sanctuary.
 * Spawns a piece of the sanctuary's type at the specified spawn hex.
 */
export class PledgeCommand implements GameCommand {
  readonly type = CommandType.Pledge;

  constructor(
    private readonly sanctuary: Sanctuary,
    private readonly spawnHex: Hex,
    private readonly context: CommandContext
  ) {}

  execute(state: GameState): CommandResult {
    try {
      const newState = this.context.gameEngine.pledge(state, this.sanctuary.hex, this.spawnHex);
      return {
        newState,
        notation: this.getNotation(),
        success: true,
      };
    } catch (error) {
      return {
        newState: state,
        notation: this.getNotation(),
        success: false,
        error: error instanceof Error ? error.message : "Pledge failed",
      };
    }
  }

  getNotation(): string {
    return NotationService.getPledgeNotation(this.sanctuary.pieceType, this.spawnHex);
  }
}
