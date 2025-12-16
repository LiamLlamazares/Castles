import { Hex } from "./Hex";
import { Color } from "../Constants";

/**
 * Represents a castle on the game board.
 * 
 * Castles are key strategic positions at the corners of the hex board.
 * Controlling all castles is one of the win conditions, and controlled
 * castles allow recruitment of new pieces during the Castles phase.
 * 
 * The piece summoned depends on `turns_controlled`: cycles through
 * Swordsman → Archer → Knight → Eagle → Giant → Trebuchet → Assassin → Dragon → Monarch
 * 
 * OWNERSHIP:
 * - `color` = original side of the board (never changes)
 * - `owner` = current controller (changes when captured)
 * 
 * IMMUTABILITY:
 * All properties are readonly. Use `with()` to create updated copies.
 */
export class Castle {
  constructor(
    /** Position on the hex grid */
    public readonly hex: Hex,
    /** Original side of the board (white side 'w' or black side 'b') - never changes */
    public readonly color: Color,
    /** Number of turns this castle has been controlled (affects recruitment) */
    public readonly turns_controlled: number,
    /** Whether this castle has been used for recruitment this turn */
    public readonly used_this_turn: boolean = false,
    /** Current owner of this castle (can change when captured) */
    public readonly owner: Color = color
  ) {}

  /** Returns all hexes adjacent to this castle (valid recruitment positions) */
  public adjacentHexes(): Hex[] {
    return this.hex.cubeRing(1);
  }

  /** Checks if a given hex is adjacent to this castle */
  public isAdjacent(hex: Hex): boolean {
    return this.adjacentHexes().some((castleHex) => castleHex.equals(hex));
  }

  /**
   * Creates a copy of this castle with specified properties updated.
   */
  public with(updates: Partial<Castle>): Castle {
    return new Castle(
      updates.hex !== undefined ? updates.hex : this.hex,
      updates.color !== undefined ? updates.color : this.color,
      updates.turns_controlled !== undefined ? updates.turns_controlled : this.turns_controlled,
      updates.used_this_turn !== undefined ? updates.used_this_turn : this.used_this_turn,
      updates.owner !== undefined ? updates.owner : this.owner
    );
  }

  /** Creates a copy of this castle (for immutable state updates) */
  public clone(): Castle {
    return this.with({});
  }
}
