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
   * Each player's turn consists of 5 sub-turns: Movement(0,1), Attack(2,3), Recruitment(4)
   */
  public static getTurnPhase(turnCounter: number): TurnPhase {
    const phaseIndex = turnCounter % PHASE_CYCLE_LENGTH;
    if (phaseIndex < MOVEMENT_PHASE_END) return "Movement";
    if (phaseIndex < ATTACK_PHASE_END) return "Attack";
    return "Recruitment";
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
   * - 4   = Recruitment (one sub-turn)
   *
   * @param turnCounter Current turn number
   * @param hasFutureMoves Whether the current player has any valid moves remaining (Movement sub-phase)
   * @param hasFutureAttacks Whether the current player has any valid attacks remaining
   * @param hasFutureControlledCastles Whether the current player can use any castles
   * @param areCastlesUsableInPhase Specific check if castles are usable in the current Castles phase
   * @returns Number of steps to increment (0-4)
   */
  public static getTurnCounterIncrement(
    turnCounter: number,
    hasFutureMoves: boolean,
    hasFutureAttacks: boolean,
    hasFutureControlledCastles: boolean,
    areCastlesUsableInPhase: boolean
  ): number {
    const phase = this.getTurnPhase(turnCounter);
    const phasePosition = turnCounter % PHASE_CYCLE_LENGTH; // 0-4 within current player's turn

    // MOVEMENT PHASE (Positions 0, 1)
    if (phase === "Movement") {
        if (!hasFutureMoves) {
            // Cannot move any piece (or finished moving last piece)
            // Skip remaining movement turns and jump to Attack phase?
            // Wait, logic check:
            // Pos 0: First movement. If no moves, jump to 2 (Attack).
            // Pos 1: Second movement. If no moves, jump to 2 (Attack).
            // Distance: (2 - currentPos)
            // PLUS: If no attacks either, we have to skip those too.
            // Simplified: Treat "No Moves" as "Phase Complete".
            
            // Calculate distance to end of Movement Phase (which ends at index 1, jumps to 2)
            const stepsToAttack = (MOVEMENT_PHASE_END - phasePosition); 
            
            // Now, we must ALSO check Attack availability if we are arriving at Attack phase.
            // But getTurnCounterIncrement is called recursively or we handle it here.
            // Let's handle it by cascading.
            
            if (stepsToAttack > 0) {
                // If we skip to Attack, check if we need to skip Attack too?
                // The current signature receives flags for CURRENT state.
                // Assuming hasFutureAttacks is valid even if we are currently in Movement.
                
                if (!hasFutureAttacks && !hasFutureControlledCastles) {
                    // Skip Moves -> Skip Attack -> Skip Recruit -> Next Player
                    // Steps: ToAttack + 2(Attack) + 1(Recruit) = ToAttack + 3
                    return stepsToAttack + 3; 
                }
                
                if (!hasFutureAttacks && hasFutureControlledCastles) {
                     // Skip Moves -> Skip Attack -> Recruit
                     // Steps: ToAttack + 2(Attack) = ToAttack + 2
                     return stepsToAttack + 2;
                }
                
                // Just skip to Attack
                return stepsToAttack;
            }
        }
    }

    // MOVEMENT PHASE: After first movement turn (position 1) - Natural progression
    // (This block handles the case where hasFutureMoves might be TRUE but we passed?)
    // Wait, if isPassing=true, getTurnCounterIncrement only cares about "can I do more?"
    // If we passed, hasFutureMoves irrelevant?
    // Usually passing implies "I am done with this phase".
    // So if isPassing, we treat as !hasFutureMoves? Yes.
    // RuleEngine passes booleans to us.
    
    // Legacy logic for position 1 transition
    // MOVEMENT PHASE: After first movement turn (position 1)
    if (phasePosition === 1) {
      if (!hasFutureAttacks && !hasFutureControlledCastles) {
        // Skip Attack (2 turns) + Recruitment (1 turn) = +4 to next player
        return 4;
      }
      if (!hasFutureAttacks && hasFutureControlledCastles) {
        // Skip Attack phase only = +3 to Recruitment
        return 3;
      }
    }

    // ATTACK PHASE: After first attack turn (position 2)
    if (phasePosition === 2) {
      if (!hasFutureAttacks && !hasFutureControlledCastles) {
        // Skip second attack + Recruitment = +3 to next player
        return 3;
      }
      if (!hasFutureAttacks && hasFutureControlledCastles) {
        // Skip second attack only = +2 to Recruitment
        return 2;
      }
    }

    // ATTACK PHASE: After second attack turn (position 3)
    if (phasePosition === 3 && !hasFutureControlledCastles) {
      // Skip Recruitment phase = +2 to next player
      return 2;
    }

    // RECRUITMENT PHASE: Check if any controlled castles remain usable
    if (phase === "Recruitment") {
      if (!areCastlesUsableInPhase) {
        // All castles used or none controlled - advance to next player
        return 1;
      }
      // Still have castles to use - stay in Recruitment phase
      return 0;
    }

    // Default: advance one turn counter step
    return 1;
  }
}
