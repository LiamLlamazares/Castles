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
} from "../Constants";

import {
  swordsmanMoves,
  archerMoves,
  knightMoves,
  eagleMoves,
  dragonMoves,
  assassinMoves,
  giantMoves,
} from "./MoveStrategies";

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
    public readonly damage: number = 0
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
        return AttackType.Ranged;
      case PieceType.Trebuchet:
        return AttackType.LongRanged;
      case PieceType.Swordsman:
        return AttackType.Swordsman;
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
        updates.damage !== undefined ? updates.damage : this.damage
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
  public legalmoves(blockedHexSet: Set<string>, color: Color, validHexSet: Set<string>): Hex[] {
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
      default:
        return [];
    }
  }

  // =========== ATTACK LOGIC ===========
  
  /** Checks if a target hex contains an attackable enemy */
  private isValidAttack(targetHex: Hex, attackableHexSet: Set<string>): boolean {
    return attackableHexSet.has(targetHex.getKey());
  }

  /** Melee attacks: all adjacent hexes (radius 1) */
  public meleeAttacks(attackableHexSet: Set<string>): Hex[] {
    const attacks: Hex[] = [];
    const potentialAttacks = this.hex.cubeRing(1);

    for (const target of potentialAttacks) {
      if (this.isValidAttack(target, attackableHexSet)) {
        attacks.push(target);
      }
    }

    return attacks;
  }
  /** Ranged attacks: ring at distance 2 (+3 from high ground) */
  public rangedAttacks(attackableHexSet: Set<string>, highGroundHexSet?: Set<string>): Hex[] {
    const attacks: Hex[] = [];
    let potentialAttacks = this.hex.cubeRing(2);
    if (highGroundHexSet && highGroundHexSet.has(this.hex.getKey())) {
      potentialAttacks.push(...this.hex.cubeRing(3));
    }

    for (const newHex of potentialAttacks) {
      if (this.isValidAttack(newHex, attackableHexSet)) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }
  /** Long-ranged attacks: ring at distance 3 (+4 from high ground) */
  public longRangedAttacks(attackableHexSet: Set<string>, highGroundHexSet?: Set<string>): Hex[] {
    const attacks: Hex[] = [];
    let potentialAttacks = this.hex.cubeRing(3);
    if (highGroundHexSet && highGroundHexSet.has(this.hex.getKey())) {
      potentialAttacks.push(...this.hex.cubeRing(4));
    }

    for (const newHex of potentialAttacks) {
      if (this.isValidAttack(newHex, attackableHexSet)) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }

  /** Swordsman attacks: diagonal-forward only */
  public swordsmanAttacks(attackableHexSet: Set<string>): Hex[] {
    const attacks: Hex[] = [];
    const { q, r, s } = this.hex;
    const direction = this.color === "b" ? -1 : 1;

    const attackDirections = [
      { q: direction, r: -direction, s: 0 },
      { q: -direction, r: 0, s: direction },
    ];

    for (const dir of attackDirections) {
      const newHex = new Hex(q + dir.q, r + dir.r, s + dir.s);
      if (this.isValidAttack(newHex, attackableHexSet)) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }

  /** Returns all legal attacks based on attack type */
  public legalAttacks(attackableHexSet: Set<string>, highGroundHexSet?: Set<string>): Hex[] {
    if (this.AttackType === AttackType.Melee) {
      return this.meleeAttacks(attackableHexSet);
    } else if (this.AttackType === AttackType.Ranged) {
      return this.rangedAttacks(attackableHexSet, highGroundHexSet);
    } else if (this.AttackType === AttackType.LongRanged) {
      return this.longRangedAttacks(attackableHexSet, highGroundHexSet);
    } else {
      return this.swordsmanAttacks(attackableHexSet);
    }
  }

  /** Creates a deep copy of this piece (for immutable state updates) */
  public clone(): Piece {
    // Clone via copy constructor pattern
    return this.with({});
  }
}
