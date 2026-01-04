import { Hex } from "./Hex";
import { SanctuaryType, SanctuaryConfig, PieceType, Color } from "../../Constants";

/**
 * Represents a sanctuary on the game board.
 * 
 * Sanctuaries are special locations where players can pledge powerful
 * fantasy creatures to their cause. Each sanctuary type unlocks a
 * specific special piece.
 * 
 * TIERS:
 * - Tier 1 (Wolf, Healer): Just occupy to activate
 * - Tier 2 (Ranger, Wizard): Requires surrounding strength >= 3
 * - Tier 3 (Necromancer, Phoenix): Requires strength >= 4 AND sacrifice a piece
 * 
 * PLACEMENT ZONES:
 * - Tier 1: Neutral zone (near river)
 * - Tier 2: Opponent's shallow territory
 * - Tier 3: Opponent's deep territory
 * 
 * IMMUTABILITY:
 * All properties are readonly. Use `with()` to create updated copies.
 */
export class Sanctuary {
  constructor(
    /** Position on the hex grid */
    public readonly hex: Hex,
    /** Type of sanctuary (determines which piece can be pledged) */
    public readonly type: SanctuaryType,
    /** Which player owns this sanctuary's territory ('w' for White's side, 'b' for Black's side) */
    public readonly territorySide: Color,
    /** Current controller (null if uncontrolled) */
    public readonly controller: Color | null = null,
    /** Turns remaining until sanctuary can be used again (0 = ready) */
    public readonly cooldown: number = 10,
    /** Whether a piece has been pledged from this sanctuary this game */
    public readonly hasPledgedThisGame: boolean = false
  ) {}

  /** Returns the tier of this sanctuary (1, 2, or 3) */
  get tier(): 1 | 2 | 3 {
    return SanctuaryConfig[this.type].tier;
  }

  /** Returns the strength required to activate this sanctuary */
  get requiredStrength(): number {
    return SanctuaryConfig[this.type].requiredStrength;
  }

  /** Returns true if activating this sanctuary requires sacrificing a piece */
  get requiresSacrifice(): boolean {
    return SanctuaryConfig[this.type].requiresSacrifice;
  }

  /** Returns the piece type that can be pledged from this sanctuary */
  get pieceType(): PieceType {
    return SanctuaryConfig[this.type].pieceType;
  }

  /** Returns all hexes adjacent to this sanctuary (valid pledge spawn positions) */
  public adjacentHexes(): Hex[] {
    return this.hex.cubeRing(1);
  }

  /** Checks if a given hex is adjacent to this sanctuary */
  public isAdjacent(hex: Hex): boolean {
    return this.adjacentHexes().some((h) => h.equals(hex));
  }

  /** Returns true if this sanctuary is ready to be used (not on cooldown, not pledged) */
  get isReady(): boolean {
    return this.cooldown === 0 && !this.hasPledgedThisGame;
  }

  /**
   * Creates a copy of this sanctuary with specified properties updated.
   */
  public with(updates: Partial<Sanctuary>): Sanctuary {
    return new Sanctuary(
      updates.hex !== undefined ? updates.hex : this.hex,
      updates.type !== undefined ? updates.type : this.type,
      updates.territorySide !== undefined ? updates.territorySide : this.territorySide,
      updates.controller !== undefined ? updates.controller : this.controller,
      updates.cooldown !== undefined ? updates.cooldown : this.cooldown,
      updates.hasPledgedThisGame !== undefined ? updates.hasPledgedThisGame : this.hasPledgedThisGame
    );
  }

  /** Creates a copy of this sanctuary (for immutable state updates) */
  public clone(): Sanctuary {
    return this.with({});
  }
}
