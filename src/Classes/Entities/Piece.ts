/**
 * Represents a game piece on the board.
 * 
 * Each piece has:
 * - Position (hex coordinates)
 * - Allegiance (color: white or black)
 * - Type (determines movement, attack range, and strength)
 * - Turn state (canMove, canAttack, damage taken)
 */
import { Hex } from "./Hex";
import {
  PieceType,
  AttackType,
  PieceStrength,
  Color,
  N_SQUARES,
} from "../../Constants";

import {
  swordsmanMoves,
  archerMoves,
  knightMoves,
  eagleMoves,
  dragonMoves,
  assassinMoves,
  giantMoves,
  wolfMoves,
  rangerMoves,
} from "../Strategies/MoveStrategies";

import {
  meleeAttacks,
  rangedAttacks,
  longRangedAttacks,
  swordsmanAttacks,
} from "../Strategies/AttackStrategies";

/**
 * A piece on the game board.
 * 
 * Movement and attack patterns are determined by the piece type.
 * See MoveStrategies.ts for movement implementations.
 * 
 * IMMUTABILITY:
 * All properties are readonly. Use the `with()` method to create updated copies.
 */
export class Piece {
  constructor(
    /** Current position on the hex grid */
    public readonly hex: Hex,
    /** Which player owns this piece */
    public readonly color: Color,
    /** Piece variant (determines movement/attack/strength) */
    public readonly type: PieceType,
    /** Whether this piece can still move this turn */
    public readonly canMove: boolean = true,
    /** Whether this piece can still attack this turn */
    public readonly canAttack: boolean = true,
    /** Damage accumulated this turn (resets each round) */
    public readonly damage: number = 0,
    /** Whether this piece has used its special ability (for one-time use pieces like Wizard/Necromancer) */
    public readonly abilityUsed: boolean = false,
    /** Number of souls collected by Necromancer */
    public readonly souls: number = 0,
    /** Whether this piece was revived by a Necromancer (if killed again, it is exiled) */
    public readonly isRevived: boolean = false
  ) {
    if (!hex || !color || !type) {
      throw new Error("Invalid arguments for Piece constructor");
    }
  }

  /** Combat strength - must exceed defender's strength to capture */
  get Strength(): number {
    return PieceStrength[this.type];
  }

  /** 
   * Attack type determines attack range and capture behavior:
   * - Melee: adjacent hexes, moves onto target when capturing
   * - Ranged: exactly 2 hexes away (3 from high ground), doesn't move
   * - LongRanged: exactly 3 hexes away (4 from high ground), doesn't move
   * - Swordsman: diagonal-forward only, moves onto target
   */
  get AttackType(): AttackType {
    switch (this.type) {
      case PieceType.Archer:
      case PieceType.Wizard:      // Wizard has Range 2 (like Archer)
        return AttackType.Ranged;
        
      case PieceType.Trebuchet:
      case PieceType.Ranger:      // Ranger has Long Range (3)
        return AttackType.LongRanged;
        
      case PieceType.Swordsman:
        return AttackType.Swordsman;
        
      case PieceType.Healer:      // Healers do not attack
        return AttackType.None;
        
      case PieceType.Necromancer: // Necromancer is Melee
        return AttackType.Melee;
        
      default:
        return AttackType.Melee;
    }
  }

  /**
   * Creates a copy of this piece with specified properties updated.
   * This is the primary way to "modify" a piece.
   */
  public with(updates: Partial<Piece>): Piece {
    return new Piece(
        updates.hex !== undefined ? updates.hex : this.hex,
        updates.color !== undefined ? updates.color : this.color,
        updates.type !== undefined ? updates.type : this.type,
        updates.canMove !== undefined ? updates.canMove : this.canMove,
        updates.canAttack !== undefined ? updates.canAttack : this.canAttack,
        updates.damage !== undefined ? updates.damage : this.damage,
        updates.abilityUsed !== undefined ? updates.abilityUsed : this.abilityUsed,
        updates.souls !== undefined ? updates.souls : this.souls,
        updates.isRevived !== undefined ? updates.isRevived : this.isRevived
    );
  }

  /**
   * Returns all legal movement destinations for this piece.
   * Delegates to the appropriate move strategy based on piece type.
   * 
   * @param blockedHexSet - Set of hex keys that cannot be moved to (occupied, river, castle)
   * @param color - Color of the moving piece (affects swordsman direction)
   * @param validHexSet - Set of hex keys representing valid board positions
   */
  /**
   * Returns all legal movement destinations for this piece.
   * Delegates to the appropriate move strategy based on piece type.
   * 
   * @param blockedHexSet - Set of hex keys that cannot be moved to (occupied, river, castle)
   * @param color - Color of the moving piece (affects swordsman direction)
   * @param validHexSet - Set of hex keys representing valid board positions
   */
  public getLegalMoves(blockedHexSet: Set<string>, color: Color, validHexSet: Set<string>): Hex[] {
    switch (this.type) {
      case PieceType.Swordsman:
        return swordsmanMoves(this.hex, blockedHexSet, validHexSet, color);
      case PieceType.Archer:
      case PieceType.Trebuchet:
      case PieceType.Monarch:
        return archerMoves(this.hex, blockedHexSet, validHexSet);
      case PieceType.Knight:
        return knightMoves(this.hex, blockedHexSet, validHexSet, N_SQUARES);
      case PieceType.Eagle:
        return eagleMoves(this.hex, blockedHexSet, validHexSet);
      case PieceType.Giant:
        return giantMoves(this.hex, blockedHexSet, validHexSet, N_SQUARES);
      case PieceType.Dragon:
        return dragonMoves(this.hex, blockedHexSet, validHexSet);
      case PieceType.Assassin:
        return assassinMoves(this.hex, blockedHexSet, validHexSet, N_SQUARES);
      case PieceType.Wolf:
        return wolfMoves(this.hex, blockedHexSet, validHexSet);
      case PieceType.Ranger:
        return rangerMoves(this.hex, blockedHexSet, validHexSet);
      case PieceType.Phoenix:
        return eagleMoves(this.hex, blockedHexSet, validHexSet);
      case PieceType.Healer:
      case PieceType.Wizard:
      case PieceType.Necromancer:
        return archerMoves(this.hex, blockedHexSet, validHexSet);
      default:
        return [];
    }
  }

  // =========== ATTACK LOGIC ===========
  


  /** Returns all legal attacks based on attack type */
  public legalAttacks(attackableHexSet: Set<string>, highGroundHexSet?: Set<string>): Hex[] {
    if (this.AttackType === AttackType.None) return [];
    
    if (this.AttackType === AttackType.Melee) {
      return meleeAttacks(this.hex, attackableHexSet);
    } else if (this.AttackType === AttackType.Ranged) {
      return rangedAttacks(this.hex, attackableHexSet, highGroundHexSet);
    } else if (this.AttackType === AttackType.LongRanged) {
      return longRangedAttacks(this.hex, attackableHexSet, highGroundHexSet);
    } else {
      return swordsmanAttacks(this.hex, attackableHexSet, this.color);
    }
  }

  /** Creates a deep copy of this piece (for immutable state updates) */
  public clone(): Piece {
    // Clone via copy constructor pattern
    return this.with({});
  }
}
