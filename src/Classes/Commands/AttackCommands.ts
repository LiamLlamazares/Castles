/**
 * @file AttackCommands.ts
 * @description Command for attack actions (piece and castle attacks).
 *
 * Encapsulates the logic for attacking enemy pieces or castles.
 * Uses GameEngine for state mutation and emits events after execution.
 */

import { GameCommand, CommandResult, CommandType, CommandContext } from "./GameCommand";
import { GameState } from "../Core/GameEngine";
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { NotationService } from "../Systems/NotationService";
import { gameEvents, AttackResolvedEvent } from "../Events";

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
      // Find defender before state change
      const defender = state.pieces.find((p) => p.hex.equals(this.targetHex)) || null;
      
      const newState = this.context.gameEngine.applyAttack(state, this.attacker, this.targetHex);
      
      // Determine result by checking if defender was captured
      const defenderStillExists = defender && newState.pieces.some(
        (p) => p.hex.equals(defender.hex) && p.color === defender.color
      );
      const result = defenderStillExists ? "damage" : "capture";

      // Emit event
      const event: AttackResolvedEvent = {
        type: "ATTACK_RESOLVED",
        attacker: this.attacker,
        defender,
        targetHex: this.targetHex,
        result,
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

      // Emit event (castle attack)
      const event: AttackResolvedEvent = {
        type: "ATTACK_RESOLVED",
        attacker: this.attacker,
        defender: null,
        targetHex: this.targetHex,
        result: "capture",
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
        error: error instanceof Error ? error.message : "Castle attack failed",
      };
    }
  }

  getNotation(): string {
    return this.notation;
  }
}
