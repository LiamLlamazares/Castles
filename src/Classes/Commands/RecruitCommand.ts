/**
 * @file RecruitCommand.ts
 * @description Command for recruiting a new piece from a castle.
 *
 * Encapsulates the logic for spawning a new piece adjacent to a controlled castle.
 * Uses GameEngine for state mutation.
 */

import { GameCommand, CommandResult, CommandType, CommandContext } from "./GameCommand";
import { GameState } from "../Core/GameEngine";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { NotationService } from "../Systems/NotationService";
import { PieceType } from "../../Constants";

/**
 * Command for recruiting a piece from a castle.
 * Recruited pieces are always Swordsmen.
 */
export class RecruitCommand implements GameCommand {
  readonly type = CommandType.Recruit;

  constructor(
    private readonly castle: Castle,
    private readonly spawnHex: Hex,
    private readonly context: CommandContext
  ) {}

  execute(state: GameState): CommandResult {
    try {
      const newState = this.context.gameEngine.recruitPiece(state, this.castle, this.spawnHex);
      const notation = NotationService.getRecruitNotation(
        this.castle,
        PieceType.Swordsman,
        this.spawnHex
      );
      return {
        newState,
        notation,
        success: true,
      };
    } catch (error) {
      return {
        newState: state,
        notation: this.getNotation(),
        success: false,
        error: error instanceof Error ? error.message : "Recruit failed",
      };
    }
  }

  getNotation(): string {
    return NotationService.getRecruitNotation(
      this.castle,
      PieceType.Swordsman,
      this.spawnHex
    );
  }
}
