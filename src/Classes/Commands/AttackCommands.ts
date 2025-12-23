/**
 * @file AttackCommand.ts
 * @description Command for attack actions (piece and castle attacks).
 *
 * Encapsulates the logic for attacking enemy pieces or castles.
 * Uses GameEngine for state mutation (which includes history/tree updates).
 */

import { GameCommand, CommandResult, CommandType, CommandContext } from "./GameCommand";
import { GameState } from "../Core/GameEngine";
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { NotationService } from "../Systems/NotationService";

/**
 * Command for attacking an enemy piece.
 */
export class AttackCommand implements GameCommand {
  readonly type = CommandType.Attack;
  private notation: string;

  constructor(
    private readonly attacker: Piece,
    private readonly targetHex: Hex,
    private readonly context: CommandContext
  ) {
    this.notation = NotationService.getAttackNotation(attacker, targetHex);
  }

  execute(state: GameState): CommandResult {
    try {
      const newState = this.context.gameEngine.applyAttack(state, this.attacker, this.targetHex);
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
        error: error instanceof Error ? error.message : "Attack failed",
      };
    }
  }

  getNotation(): string {
    return this.notation;
  }
}

/**
 * Command for attacking an enemy castle.
 */
export class CastleAttackCommand implements GameCommand {
  readonly type = CommandType.CastleAttack;
  private notation: string;

  constructor(
    private readonly attacker: Piece,
    private readonly targetHex: Hex,
    private readonly context: CommandContext
  ) {
    this.notation = NotationService.getAttackNotation(attacker, targetHex);
  }

  execute(state: GameState): CommandResult {
    try {
      const newState = this.context.gameEngine.applyCastleAttack(state, this.attacker, this.targetHex);
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
        error: error instanceof Error ? error.message : "Castle attack failed",
      };
    }
  }

  getNotation(): string {
    return this.notation;
  }
}
