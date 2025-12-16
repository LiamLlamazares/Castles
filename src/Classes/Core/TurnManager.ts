import {
  Color,
  TurnPhase,
  PHASE_CYCLE_LENGTH,
  PLAYER_CYCLE_LENGTH,
  MOVEMENT_PHASE_END,
  ATTACK_PHASE_END,
} from "../../Constants";

export class TurnManager {
  /**
   * Determines the current turn phase based on the turn counter.
   * Each player's turn consists of 5 sub-turns: Movement(0,1), Attack(2,3), Castles(4)
   */
  public static getTurnPhase(turnCounter: number): TurnPhase {
    const phaseIndex = turnCounter % PHASE_CYCLE_LENGTH;
    if (phaseIndex < MOVEMENT_PHASE_END) return "Movement";
    if (phaseIndex < ATTACK_PHASE_END) return "Attack";
    return "Castles";
  }

  /**
   * Determines which player's turn it is based on the turn counter.
   * White plays turns 0-4, Black plays turns 5-9, then cycles.
   */
  public static getCurrentPlayer(turnCounter: number): Color {
    return turnCounter % PLAYER_CYCLE_LENGTH < PHASE_CYCLE_LENGTH ? "w" : "b";
  }

  /**
   * Calculates how many turn counter steps to advance based on available actions.
   *
   * The turn counter cycles through phases (0-4 per player):
   * - 0,1 = Movement (two sub-turns)
   * - 2,3 = Attack (two sub-turns)
   * - 4   = Castles (one sub-turn)
   *
   * @param turnCounter Current turn number
   * @param hasFutureAttacks Whether the current player has any valid attacks remaining
   * @param hasFutureControlledCastles Whether the current player can use any castles
   * @param areCastlesUsableInPhase Specific check if castles are usable in the current Castles phase
   * @returns Number of steps to increment (0-4)
   */
  public static getTurnCounterIncrement(
    turnCounter: number,
    hasFutureAttacks: boolean,
    hasFutureControlledCastles: boolean,
    areCastlesUsableInPhase: boolean
  ): number {
    const phase = this.getTurnPhase(turnCounter);
    const phasePosition = turnCounter % PHASE_CYCLE_LENGTH; // 0-4 within current player's turn

    // MOVEMENT PHASE: After first movement turn (position 1)
    // Position 0 is the first movement turn, simple +1 usually.
    // Position 1 is the last movement turn.
    if (phasePosition === 1) {
      if (!hasFutureAttacks && !hasFutureControlledCastles) {
        // Skip Attack (2 turns) + Castles (1 turn) = +4 to next player
        return 4;
      }
      if (!hasFutureAttacks && hasFutureControlledCastles) {
        // Skip Attack phase only = +3 to Castles
        return 3;
      }
    }

    // ATTACK PHASE: After first attack turn (position 2)
    if (phasePosition === 2) {
      if (!hasFutureAttacks && !hasFutureControlledCastles) {
        // Skip second attack + Castles = +3 to next player
        return 3;
      }
      if (!hasFutureAttacks && hasFutureControlledCastles) {
        // Skip second attack only = +2 to Castles
        return 2;
      }
    }

    // ATTACK PHASE: After second attack turn (position 3)
    if (phasePosition === 3 && !hasFutureControlledCastles) {
      // Skip Castles phase = +2 to next player
      return 2;
    }

    // CASTLES PHASE: Check if any controlled castles remain usable
    if (phase === "Castles") {
      if (!areCastlesUsableInPhase) {
        // All castles used or none controlled - advance to next player
        return 1;
      }
      // Still have castles to use - stay in Castles phase
      return 0;
    }

    // Default: advance one turn counter step
    return 1;
  }
}
