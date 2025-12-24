/**
 * Represents a game piece on the board.
 * 
 * Each piece has:
 * - Position (hex coordinates)
 * - Allegiance (color: white or black)
 * - Type (determines movement, attack range, and strength)
 * - Turn state (canMove, canAttack, damage taken)
 * 
 * EXTENSIBILITY:
 * To add a new piece type, edit the registry files - NOT this class:
 * - MoveStrategyRegistry.ts - Register movement behavior
 * - AttackStrategyRegistry.ts - Register attack behavior and type
 * - Constants.ts - Add to PieceType enum and PieceStrength
 */
import { Hex } from "./Hex";
import {
  PieceType,
  AttackType,
  Color,
  N_SQUARES,
} from "../../Constants";

// Registry pattern for strategies - adding new piece types doesn't require modifying this file
import { getMoveStrategy } from "../Strategies/MoveStrategyRegistry";
import { getAttackStrategy } from "../Strategies/AttackStrategyRegistry";
import { getPieceStrength, getPieceAttackType } from "../Config/PieceTypeConfig";

/**
 * A piece on the game board.
 * 
 * Movement and attack patterns are determined by the piece type via registries.
 * See MoveStrategyRegistry.ts and AttackStrategyRegistry.ts for configurations.
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
    return getPieceStrength(this.type);
  }

  /** 
   * Attack type determines attack range and capture behavior:
   * - Melee: adjacent hexes, moves onto target when capturing
   * - Ranged: exactly 2 hexes away (3 from high ground), doesn't move
   * - LongRanged: exactly 3 hexes away (4 from high ground), doesn't move
   * - Swordsman: diagonal-forward only, moves onto target
   * 
   * Uses centralized config - see PieceTypeConfig.ts.
   */
  get AttackType(): AttackType {
    return getPieceAttackType(this.type);
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
   * Delegates to the registered move strategy for this piece type.
   * 
   * @param blockedHexSet - Set of hex keys that cannot be moved to (occupied, river, castle)
   * @param color - Color of the moving piece (affects swordsman direction)
   * @param validHexSet - Set of hex keys representing valid board positions
   * 
   * Uses registry lookup - see MoveStrategyRegistry.ts.
   */
  public getLegalMoves(blockedHexSet: Set<string>, color: Color, validHexSet: Set<string>): Hex[] {
    const strategy = getMoveStrategy(this.type);
    return strategy(this.hex, blockedHexSet, validHexSet, color, N_SQUARES);
  }

  /**
   * Returns all legal attacks based on attack type.
   * Delegates to the registered attack strategy for this piece type.
   * 
   * Uses registry lookup - see AttackStrategyRegistry.ts.
   */
  public legalAttacks(attackableHexSet: Set<string>, highGroundHexSet?: Set<string>): Hex[] {
    if (this.AttackType === AttackType.None) return [];
    
    const strategy = getAttackStrategy(this.type);
    return strategy(this.hex, attackableHexSet, this.color, highGroundHexSet);
  }

  /** Creates a deep copy of this piece (for immutable state updates) */
  public clone(): Piece {
    // Clone via copy constructor pattern
    return this.with({});
  }
}

