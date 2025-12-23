/**
 * @file PassCommand.ts
 * @description Command for passing the current turn/phase.
 *
 * Encapsulates the logic for skipping to the next phase.
 * Uses GameEngine for state mutation.
 */

import { GameCommand, CommandResult, CommandType, CommandContext } from "./GameCommand";
import { GameState } from "../Core/GameEngine";

/**
 * Command for passing the current turn phase.
 */
export class PassCommand implements GameCommand {
  readonly type = CommandType.Pass;

  constructor(private readonly context: CommandContext) {}

  execute(state: GameState): CommandResult {
    try {
      const newState = this.context.gameEngine.passTurn(state);
      return {
        newState,
        notation: "pass",
        success: true,
      };
    } catch (error) {
      return {
        newState: state,
        notation: "pass",
        success: false,
        error: error instanceof Error ? error.message : "Pass failed",
      };
    }
  }

  getNotation(): string {
    return "pass";
  }
}
