/**
 * @file PieceFactory.ts
 * @description Factory Pattern for creating game pieces.
 *
 * ## Purpose
 * Centralizes piece creation logic, providing:
 * - **Type-safe creation**: Named methods prevent PieceType errors
 * - **Default initialization**: canMove, canAttack, damage set correctly
 * - **Consistent patterns**: All pieces created the same way
 *
 * ## Usage
 * ```typescript
 * import { PieceFactory } from "../Classes/Entities/PieceFactory";
 *
 * // Instead of: new Piece(hex, "w", PieceType.Swordsman, true, true, 0)
 * // Use:
 * const swordsman = PieceFactory.createSwordsman(hex, "w");
 * const archer = PieceFactory.create(PieceType.Archer, hex, "b");
 * ```
 *
 * @see Piece - The piece class this factory creates
 * @see StateMutator.recruitPiece - Uses factory for new pieces
 */

import { Piece } from "./Piece";
import { Hex } from "./Hex";
import { PieceType, Color } from "../../Constants";

/**
 * Factory for creating game pieces with sensible defaults.
 */
export class PieceFactory {
  /**
   * Creates a piece of any type.
   * Generic factory method when type is dynamic.
   */
  static create(
    type: PieceType,
    hex: Hex,
    color: Color,
    canMove: boolean = true,
    canAttack: boolean = true
  ): Piece {
    return new Piece(hex, color, type, canMove, canAttack);
  }

  /**
   * Creates a fresh piece at turn start (can move and attack).
   */
  static createFresh(type: PieceType, hex: Hex, color: Color): Piece {
    return new Piece(hex, color, type, true, true, 0);
  }

  /**
   * Creates a piece that has already acted this turn.
   * Useful for recruitment (can't move/attack same turn).
   */
  static createSpent(type: PieceType, hex: Hex, color: Color): Piece {
    return new Piece(hex, color, type, false, false, 0);
  }

  // =========== TYPE-SPECIFIC FACTORIES ===========
  
  static createSwordsman(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Swordsman, hex, color);
  }

  static createArcher(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Archer, hex, color);
  }

  static createKnight(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Knight, hex, color);
  }

  static createTrebuchet(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Trebuchet, hex, color);
  }

  static createEagle(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Eagle, hex, color);
  }

  static createGiant(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Giant, hex, color);
  }

  static createAssassin(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Assassin, hex, color);
  }

  static createDragon(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Dragon, hex, color);
  }

  static createMonarch(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Monarch, hex, color);
  }

  // =========== SANCTUARY PIECES ===========

  static createWolf(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Wolf, hex, color);
  }

  static createHealer(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Healer, hex, color);
  }

  static createRanger(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Ranger, hex, color);
  }

  static createWizard(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Wizard, hex, color);
  }

  static createNecromancer(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Necromancer, hex, color);
  }

  static createPhoenix(hex: Hex, color: Color): Piece {
    return PieceFactory.createFresh(PieceType.Phoenix, hex, color);
  }

  // =========== SPECIAL CASES ===========

  /**
   * Creates a revived piece (from Necromancer ability).
   * isRevived = true means it will be exiled if killed again.
   */
  static createRevived(type: PieceType, hex: Hex, color: Color): Piece {
    return new Piece(hex, color, type, true, true, 0, false, 0, true);
  }

  /**
   * Creates a piece from PieceType enum dynamically.
   * Useful when type comes from a sanctuary or parsed notation.
   */
  static fromType(type: PieceType, hex: Hex, color: Color): Piece {
    switch (type) {
      case PieceType.Swordsman: return PieceFactory.createSwordsman(hex, color);
      case PieceType.Archer: return PieceFactory.createArcher(hex, color);
      case PieceType.Knight: return PieceFactory.createKnight(hex, color);
      case PieceType.Trebuchet: return PieceFactory.createTrebuchet(hex, color);
      case PieceType.Eagle: return PieceFactory.createEagle(hex, color);
      case PieceType.Giant: return PieceFactory.createGiant(hex, color);
      case PieceType.Assassin: return PieceFactory.createAssassin(hex, color);
      case PieceType.Dragon: return PieceFactory.createDragon(hex, color);
      case PieceType.Monarch: return PieceFactory.createMonarch(hex, color);
      case PieceType.Wolf: return PieceFactory.createWolf(hex, color);
      case PieceType.Healer: return PieceFactory.createHealer(hex, color);
      case PieceType.Ranger: return PieceFactory.createRanger(hex, color);
      case PieceType.Wizard: return PieceFactory.createWizard(hex, color);
      case PieceType.Necromancer: return PieceFactory.createNecromancer(hex, color);
      case PieceType.Phoenix: return PieceFactory.createPhoenix(hex, color);
      default: return PieceFactory.createSwordsman(hex, color);
    }
  }
}
