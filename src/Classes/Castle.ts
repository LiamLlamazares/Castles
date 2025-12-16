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
 */
export class Castle {
  constructor(
    /** Position on the hex grid */
    public hex: Hex,
    /** Original side of the board (white side 'w' or black side 'b') - never changes */
    public color: Color,
    /** Number of turns this castle has been controlled (affects recruitment) */
    public turns_controlled: number,
    /** Whether this castle has been used for recruitment this turn */
    public used_this_turn: boolean = false,
    /** Current owner of this castle (can change when captured) */
    public owner: Color = color
  ) {}

  /** Returns all hexes adjacent to this castle (valid recruitment positions) */
  public adjacentHexes(): Hex[] {
    return this.hex.cubeRing(1);
  }

  /** Checks if a given hex is adjacent to this castle */
  public isAdjacent(hex: Hex): boolean {
    return this.adjacentHexes().some((castleHex) => castleHex.equals(hex));
  }

  /** Creates a copy of this castle (for immutable state updates) */
  public clone(): Castle {
    return new Castle(this.hex, this.color, this.turns_controlled, this.used_this_turn, this.owner);
  }
}
