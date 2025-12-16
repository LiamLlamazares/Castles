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
    targetHex: Hex
  ): CombatResult {
    // Use PieceMap for O(1) lookups instead of O(N) findIndex
    const pieceMap = new PieceMap(pieces);
    
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
    
    let finalPieces = [...pieces];
    
    // Check Death
    const isDefenderDead = 
      damagedDefender.damage >= damagedDefender.Strength ||
      (damagedDefender.type === PieceType.Monarch && originalAttacker.type === PieceType.Assassin);

    if (isDefenderDead) {
      // Remove defender
      const defenderIndex = pieces.findIndex((p) => p.hex.equals(targetHex));
      finalPieces.splice(defenderIndex, 1);
      
      // Since we removed an item, indices might shift
      const attackerIndex = finalPieces.findIndex((p) => p.hex.equals(attacker.hex));
      let finalAttacker = finalPieces[attackerIndex];

      // Melee attackers move onto the captured hex
      if (
        finalAttacker.AttackType === AttackType.Melee ||
        finalAttacker.AttackType === AttackType.Swordsman
      ) {
         finalAttacker = finalAttacker.with({ hex: damagedDefender.hex });
      }
      
      // Mark as having attacked
      finalAttacker = finalAttacker.with({ canAttack: false });
      finalPieces[attackerIndex] = finalAttacker;

      return { pieces: finalPieces, victimDied: true };
    } else {
      // Defender survives, update it in the list
      const defenderIndex = pieces.findIndex((p) => p.hex.equals(targetHex));
      finalPieces[defenderIndex] = damagedDefender;
      
      // Mark attacker as having attacked
      const attackerIndex = pieces.findIndex((p) => p.hex.equals(attacker.hex));
      const finalAttacker = originalAttacker.with({ canAttack: false });
      finalPieces[attackerIndex] = finalAttacker;
      
      return { pieces: finalPieces, victimDied: false };
    }
  }
}
