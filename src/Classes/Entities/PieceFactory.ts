/**
 * @file PieceFactory.ts
 * @description Factory for creating game pieces.
 *
 * Centralizes piece creation to ensure consistent initialization.
 * All pieces start in "fresh" state (canMove=canAttack=true, damage=0).
 *
 * @usage
 * ```typescript
 * import { PieceFactory } from "../Classes/Entities/PieceFactory";
 * const piece = PieceFactory.create(PieceType.Archer, hex, "w");
 * const phoenix = PieceFactory.createPhoenix(hex, "b");
 * ```
 */

import { Piece } from "./Piece";
import { Hex } from "./Hex";
import { PieceType, Color } from "../../Constants";

export class PieceFactory {
  /**
   * Creates a piece of any type.
   * Pieces start fresh (can move, can attack, no damage).
   */
  static create(type: PieceType, hex: Hex, color: Color): Piece {
    return new Piece(hex, color, type, true, true, 0);
  }

  /**
   * Creates a Phoenix specifically (convenience for DeathSystem).
   */
  static createPhoenix(hex: Hex, color: Color): Piece {
    return new Piece(hex, color, PieceType.Phoenix, true, true, 0);
  }

  /**
   * Alias for create() - for cases where type comes from a variable.
   */
  static fromType(type: PieceType, hex: Hex, color: Color): Piece {
    return PieceFactory.create(type, hex, color);
  }

  /**
   * Creates a revived piece (from Necromancer ability).
   * isRevived=true means it will be exiled if killed again.
   */
  static createRevived(type: PieceType, hex: Hex, color: Color): Piece {
    return new Piece(hex, color, type, true, true, 0, false, 0, true);
  }
}
