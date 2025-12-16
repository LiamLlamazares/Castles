import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { PieceType, AttackType } from "../../Constants";

export interface CombatResult {
  pieces: Piece[];
  victimDied: boolean;
}

export class CombatSystem {
  /**
   * Resolves an attack between two pieces.
   * Returns the new list of pieces and whether the defender died.
   *
   * @param pieces Current list of pieces
   * @param attacker The attacking piece object (must be present in pieces)
   * @param targetHex The hex of the piece being attacked
   */
  public static resolveAttack(
    pieces: Piece[],
    attacker: Piece,
    targetHex: Hex
  ): CombatResult {
    const defenderIndex = pieces.findIndex((p) => p.hex.equals(targetHex));
    if (defenderIndex === -1) {
      // Should not happen if move was legal
      return { pieces: [...pieces], victimDied: false };
    }

    const attackerIndex = pieces.findIndex((p) => p.hex.equals(attacker.hex));
    if (attackerIndex === -1) {
       // Should not happen
       return { pieces: [...pieces], victimDied: false };
    }

    const defender = pieces[defenderIndex];
    const originalAttacker = pieces[attackerIndex];

    // Apply Damage using immutable update
    const damageDealt = originalAttacker.Strength;
    const damagedDefender = defender.with({ damage: defender.damage + damageDealt });
    
    let finalPieces = [...pieces];
    
    // Check Death
    const isDefenderDead = 
      damagedDefender.damage >= damagedDefender.Strength ||
      (damagedDefender.type === PieceType.Monarch && originalAttacker.type === PieceType.Assassin);

    if (isDefenderDead) {
      // Remove defender
      finalPieces.splice(defenderIndex, 1);
      
      // Since we removed an item, indices might shift. 
      // If defender was before attacker, attacker index shifts down by 1.
      const adjustedAttackerIndex = (defenderIndex < attackerIndex) ? attackerIndex - 1 : attackerIndex;
      
      let finalAttacker = finalPieces[adjustedAttackerIndex];

      // Melee attackers move onto the captured hex
      if (
        finalAttacker.AttackType === AttackType.Melee ||
        finalAttacker.AttackType === AttackType.Swordsman
      ) {
         finalAttacker = finalAttacker.with({ hex: damagedDefender.hex });
      }
      
      // Mark as having attacked
      finalAttacker = finalAttacker.with({ canAttack: false });
      finalPieces[adjustedAttackerIndex] = finalAttacker;

      return { pieces: finalPieces, victimDied: true };
    } else {
      // Defender survives, update it in the list
      finalPieces[defenderIndex] = damagedDefender;
      
      // Mark attacker as having attacked
      const finalAttacker = originalAttacker.with({ canAttack: false });
      finalPieces[attackerIndex] = finalAttacker; // Indices haven't shifted
      
      return { pieces: finalPieces, victimDied: false };
    }
  }
}
