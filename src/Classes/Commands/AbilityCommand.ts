/**
 * @file AbilityCommand.ts
 * @description Command for activating special piece abilities.
 *
 * Encapsulates ability activation (Fireball, Teleport, RaiseDead)
 * for Wizard and Necromancer pieces.
 *
 * @see GameCommand - Base command interface
 * @see GameEngine.activateAbility - Underlying ability logic
 */

import { GameCommand, CommandResult, CommandType, CommandContext } from "./GameCommand";
import { GameState } from "../Core/GameEngine";
import { Hex } from "../Entities/Hex";
import { Piece } from "../Entities/Piece";
import { AbilityType } from "../../Constants";

/**
 * Command for activating a special ability.
 * Supports Wizard (Fireball, Teleport) and Necromancer (RaiseDead) abilities.
 */
export class AbilityCommand implements GameCommand {
  readonly type = CommandType.Ability;

  constructor(
    private readonly caster: Piece,
    private readonly targetHex: Hex,
    private readonly ability: AbilityType,
    private readonly context: CommandContext
  ) {}

  execute(state: GameState): CommandResult {
    try {
      const newState = this.context.gameEngine.activateAbility(
        state,
        this.caster.hex,
        this.targetHex,
        this.ability
      );
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
        error: error instanceof Error ? error.message : "Ability failed",
      };
    }
  }

  getNotation(): string {
    return `${this.caster.type} ${this.ability} -> ${this.targetHex.toString()}`;
  }
}
