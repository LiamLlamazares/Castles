import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { PieceType, AttackType } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";

export interface CombatResult {
  pieces: Piece[];
  victimDied: boolean;
  deadPiece?: Piece; // The piece that died, if any
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
  /**
   * Calculates the effective combat strength of a piece, including bonuses.
   * - Wolf: +1 Strength for each adjacent friendly Wolf (Pack Tactics)
   */
  public static getCombatStrength(piece: Piece, pieceMap: PieceMap): number {
    let strength = piece.Strength;

    // Pack Tactics (Wolf)
    if (piece.type === PieceType.Wolf) {
        const neighbors = piece.hex.cubeRing(1);
        let adjacentWolves = 0;
        for (const n of neighbors) {
            const neighborPiece = pieceMap.get(n);
            if (neighborPiece && 
                neighborPiece.color === piece.color && 
                neighborPiece.type === PieceType.Wolf) {
                adjacentWolves++;
            }
        }
        strength += adjacentWolves;
    }

    return strength;
  }

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

    // Calculate modified strengths
    const attackStrength = CombatSystem.getCombatStrength(originalAttacker, pieceMap);
    // Note: Defender strength is also calculated with context (though heavily damaged)
    // The current logic uses defender.Strength (base) to check death threshold vs damage.
    // If "Defense" bonuses existed, we'd use them here. For now, max HP = Strength.
    // BUT checking death: damage >= Strength. 
    // If Pack Tactics increases Strength, does it increase HP? 
    // Usually "Strength" in this game implies both Power and HP cap.
    // Let's assume Pack Tactics increases effectively HP too if it increases Strength.
    const defenderStrength = CombatSystem.getCombatStrength(defender, pieceMap);

    // Apply Damage using immutable update
    // Damage dealt is based on Attacker's effective strength
    const damageDealt = attackStrength;
    const damagedDefender = defender.with({ damage: defender.damage + damageDealt });
    
    // Check Death
    // Defender dies if accumulated damage >= their effective Strength (Max HP)
    const isDefenderDead = 
      damagedDefender.damage >= defenderStrength ||
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

      // Soul Harvest: If attacker is Necromancer, gain 1 soul
      if (finalAttacker.type === PieceType.Necromancer) {
          finalAttacker = finalAttacker.with({ souls: finalAttacker.souls + 1 });
      }

      // Rebuild array: Filter out defender, Update attacker
      // This is O(N) but clean and robust
      finalPieces = pieces
        .filter(p => p !== defender) // Remove defender
        .map(p => p === originalAttacker ? finalAttacker : p); // Update attacker

      return { pieces: finalPieces, victimDied: true, deadPiece: damagedDefender };
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
