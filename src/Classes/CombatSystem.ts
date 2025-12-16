import { Piece } from "./Piece";
import { Hex } from "./Hex";
import { PieceType, AttackType } from "../Constants";

export interface CombatResult {
  pieces: Piece[];
  victimDied: boolean;
}

export class CombatSystem {
  /**
   * Resolves an attack between two pieces.
   * Returns the new list of pieces and whether the defender died.
   *
   * @param pieces Current list of pieces (will be cloned)
   * @param attacker The attacking piece object (must be present in pieces)
   * @param targetHex The hex of the piece being attacked
   */
  public static resolveAttack(
    pieces: Piece[],
    attacker: Piece,
    targetHex: Hex
  ): CombatResult {
    const defender = pieces.find((p) => p.hex.equals(targetHex));
    if (!defender) {
      // Should not happen if move was legal
      return { pieces: [...pieces], victimDied: false };
    }

    // Clone pieces to ensure immutability
    let newPieces = pieces.map((p) => p.clone());
    const attackerClone = newPieces.find((p) => p.hex.equals(attacker.hex))!;
    const defenderClone = newPieces.find((p) => p.hex.equals(defender.hex))!;

    // Apply Damage
    defenderClone.damage += attackerClone.Strength;
    let victimDied = false;

    // Check Death
    // Standard death: damage >= strength
    // Assassin vs Monarch: Instant Kill special rule
    if (
      defenderClone.damage >= defenderClone.Strength ||
      (defenderClone.type === PieceType.Monarch &&
        attackerClone.type === PieceType.Assassin)
    ) {
      victimDied = true;
      // Defender dies - remove from pieces
      newPieces = newPieces.filter((p) => p !== defenderClone);

      // Melee attackers move onto the captured hex (Charge/Advance)
      if (
        attackerClone.AttackType === AttackType.Melee ||
        attackerClone.AttackType === AttackType.Swordsman
      ) {
        attackerClone.hex = defenderClone.hex;
      }
    }

    // Mark attacker as having attacked
    attackerClone.canAttack = false;

    return { pieces: newPieces, victimDied };
  }
}
