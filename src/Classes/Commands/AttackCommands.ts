/**
 * @file AttackCommands.ts
 * @description Command for attack actions (piece and castle attacks).
 *
 * Encapsulates the logic for attacking enemy pieces or castles.
 * Uses GameEngine for state mutation and emits events after execution.
 */

import { GameCommand, CommandContext, CommandResult, CommandType } from "./GameCommand";
import { GameState } from "../Core/GameState";
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { NotationService } from "../Systems/NotationService";
import { gameEvents, AttackResolvedEvent, CastleCapturedEvent } from "../Events";

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
      // Capture state before mutation for event data
      const castle = state.castles.find(c => c.hex.equals(this.targetHex));
      const previousOwner = castle?.owner || null;

      const newState = this.context.gameEngine.applyCastleAttack(state, this.attacker, this.targetHex);

      const timestamp = Date.now();
      const turnNumber = Math.floor(state.turnCounter / 10) + 1;

      // Emit generic attack event
      const event: AttackResolvedEvent = {
        type: "ATTACK_RESOLVED",
        attacker: this.attacker,
        defender: null,
        targetHex: this.targetHex,
        result: "capture",
        timestamp,
        turnNumber,
      };
      gameEvents.emit(event);

      // Emit specific castle capture event
      if (castle) {
          const captureEvent: CastleCapturedEvent = {
              type: "CASTLE_CAPTURED",
              castle,
              capturedBy: this.attacker.color,
              previousOwner,
              timestamp,
              turnNumber
          };
          gameEvents.emit(captureEvent);
      }


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
