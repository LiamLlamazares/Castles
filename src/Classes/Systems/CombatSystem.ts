import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { PieceType, AttackType } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";

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
    targetHex: Hex,
    existingPieceMap?: PieceMap
  ): CombatResult {
    // Use provided map or create one (O(N) if created, O(1) if provided)
    const pieceMap = existingPieceMap || new PieceMap(pieces);
    
    const defender = pieceMap.get(targetHex);
    if (!defender) {
      console.warn(
        `CombatSystem: No piece found at target hex ${targetHex.getKey()}. ` +
        `This should not happen if move validation is correct.`
      );
      return { pieces: [...pieces], victimDied: false };
    }

    const originalAttacker = pieceMap.get(attacker.hex);
    if (!originalAttacker) {
      console.warn(
        `CombatSystem: Attacker not found at ${attacker.hex.getKey()}. ` +
        `This should not happen.`
      );
      return { pieces: [...pieces], victimDied: false };
    }

    // Apply Damage using immutable update
    const damageDealt = originalAttacker.Strength;
    const damagedDefender = defender.with({ damage: defender.damage + damageDealt });
    
    // Check Death
    const isDefenderDead = 
      damagedDefender.damage >= damagedDefender.Strength ||
      (damagedDefender.type === PieceType.Monarch && originalAttacker.type === PieceType.Assassin);

    let finalPieces: Piece[];

    if (isDefenderDead) {
      // Logic: Remove defender, Upgrade attacker
      let finalAttacker = originalAttacker;

      // Melee attackers move onto the captured hex
      if (
        finalAttacker.AttackType === AttackType.Melee ||
        finalAttacker.AttackType === AttackType.Swordsman
      ) {
         finalAttacker = finalAttacker.with({ hex: damagedDefender.hex });
      }
      
      // Mark as having attacked
      finalAttacker = finalAttacker.with({ canAttack: false });

      // Rebuild array: Filter out defender, Update attacker
      // This is O(N) but clean and robust
      finalPieces = pieces
        .filter(p => p !== defender) // Remove defender
        .map(p => p === originalAttacker ? finalAttacker : p); // Update attacker

      return { pieces: finalPieces, victimDied: true };
    } else {
      // Defender survives
      const finalAttacker = originalAttacker.with({ canAttack: false });
      
      // Rebuild array: Update both
      finalPieces = pieces.map(p => {
          if (p === defender) return damagedDefender;
          if (p === originalAttacker) return finalAttacker;
          return p;
      });
      
      return { pieces: finalPieces, victimDied: false };
    }
  }
}
