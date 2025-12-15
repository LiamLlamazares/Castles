/**
 * Represents a game piece on the board.
 * 
 * Each piece has:
 * - Position (hex coordinates)
 * - Allegiance (color: white or black)
 * - Type (determines movement, attack range, and strength)
 * - Turn state (canMove, canAttack, damage taken)
 */
import { Hex, highGroundHexes } from "./Hex";
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
 */
export class Piece {
  constructor(
    /** Current position on the hex grid */
    public hex: Hex,
    /** Which player owns this piece */
    public color: Color,
    /** Piece variant (determines movement/attack/strength) */
    public type: PieceType,
    /** Whether this piece can still move this turn */
    public canMove: boolean = true,
    /** Whether this piece can still attack this turn */
    public canAttack: boolean = true,
    /** Damage accumulated this turn (resets each round) */
    public damage: number = 0
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
   * Returns all legal movement destinations for this piece.
   * Delegates to the appropriate move strategy based on piece type.
   * 
   * @param blockedHexes - Hexes that cannot be moved to (occupied, river, castle)
   * @param color - Color of the moving piece (affects swordsman direction)
   */
  public legalmoves(blockedHexes: Hex[], color: Color): Hex[] {
    // Convert to Set for O(1) lookups in move strategies
    const blockedHexSet = new Set(blockedHexes.map((hex) => hex.getKey()));
    
    switch (this.type) {
      case PieceType.Swordsman:
        return swordsmanMoves(this.hex, blockedHexSet, color);
      case PieceType.Archer:
      case PieceType.Trebuchet:
      case PieceType.Monarch:
        return archerMoves(this.hex, blockedHexSet);
      case PieceType.Knight:
        return knightMoves(this.hex, blockedHexSet, N_SQUARES);
      case PieceType.Eagle:
        return eagleMoves(this.hex, blockedHexSet);
      case PieceType.Giant:
        return giantMoves(this.hex, blockedHexSet, N_SQUARES);
      case PieceType.Dragon:
        return dragonMoves(this.hex, blockedHexSet);
      case PieceType.Assassin:
        return assassinMoves(this.hex, blockedHexSet, N_SQUARES);
      default:
        return [];
    }
  }

  // =========== ATTACK LOGIC ===========

  /** Checks if a target hex contains an attackable enemy */
  private isValidAttack(targetHex: Hex, enemyHexes: Hex[]): boolean {
    return enemyHexes.some((enemyHex) => enemyHex.equals(targetHex));
  }

  /** Melee attacks: all adjacent hexes (radius 1) */
  public meleeAttacks(enemyHexes: Hex[]): Hex[] {
    const attacks: Hex[] = [];
    const potentialAttacks = this.hex.cubeRing(1);

    for (const target of potentialAttacks) {
      if (this.isValidAttack(target, enemyHexes)) {
        attacks.push(target);
      }
    }

    return attacks;
  }
  public rangedAttacks(enemyHexes: Hex[]): Hex[] {
    const attacks: Hex[] = [];
    let potentialAttacks = this.hex.cubeRing(2);
    if (highGroundHexes.some((hgHex) => hgHex.equals(this.hex))) {
      potentialAttacks.push(...this.hex.cubeRing(3));
    }

    for (const newHex of potentialAttacks) {
      if (this.isValidAttack(newHex, enemyHexes)) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }
  public longRangedAttacks(enemyHexes: Hex[]): Hex[] {
    const attacks: Hex[] = [];
    let potentialAttacks = this.hex.cubeRing(3);
    if (highGroundHexes.some((hgHex) => hgHex.equals(this.hex))) {
      potentialAttacks.push(...this.hex.cubeRing(4));
    }

    for (const newHex of potentialAttacks) {
      if (this.isValidAttack(newHex, enemyHexes)) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }

  public swordsmanAttacks(enemyHexes: Hex[]): Hex[] {
    const attacks: Hex[] = [];
    const { q, r, s } = this.hex;
    const direction = this.color === "b" ? -1 : 1;

    const attackDirections = [
      { q: direction, r: -direction, s: 0 },
      { q: -direction, r: 0, s: direction },
    ];

    for (const dir of attackDirections) {
      const newHex = new Hex(q + dir.q, r + dir.r, s + dir.s);
      if (enemyHexes.some((enemyHex) => enemyHex.equals(newHex))) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }

  public legalAttacks(enemyHexes: Hex[]): Hex[] {
    if (this.AttackType === AttackType.Melee) {
      return this.meleeAttacks(enemyHexes);
    } else if (this.AttackType === AttackType.Ranged) {
      return this.rangedAttacks(enemyHexes);
    } else if (this.AttackType === AttackType.LongRanged) {
      return this.longRangedAttacks(enemyHexes);
    } else {
      return this.swordsmanAttacks(enemyHexes);
    }
  }

  public getHex(): Hex {
    return this.hex;
  }

  public setHex(newHex: Hex): void {
    this.hex = newHex;
  }

  public setColor(color: Color): void {
    this.color = color;
  }

  public getColor(): Color {
    return this.color;
  }

  public getType(): PieceType {
    return this.type;
  }

  public clone(): Piece {
    return new Piece(this.hex, this.color, this.type, this.canMove, this.canAttack, this.damage);
  }
}


