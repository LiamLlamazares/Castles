import { Board } from "../Core/Board";
import { Hex } from "../Entities/Hex";
import { Castle } from "../Entities/Castle";

export class CastleGenerator {
  /**
   * Generates random mirrored castle positions.
   * 
   * @param board The board to place castles on
   * @param count Number of castles per player
   * @returns Array of Castle objects
   */
  public static generateRandomCastles(board: Board, count: number): Castle[] {
    const validHexes = board.hexes.filter(h => 
      h.r > 0 && // South side (White)
      !board.isRiver(h) && // Not in river
      Math.abs(h.q) < board.NSquares && // Avoid extreme edges if possible, but valid board hexes are fine
      Math.abs(h.r) < board.NSquares &&
      Math.abs(h.s) < board.NSquares
    );

    const selectedHexes: Hex[] = [];
    const usedKeys = new Set<string>();

    // Simple random selection for now
    // In future: ensure minimum distance between castles?
    for (let i = 0; i < count; i++) {
        if (validHexes.length === 0) break;
        
        const randomIndex = Math.floor(Math.random() * validHexes.length);
        const hex = validHexes[randomIndex];
        
        selectedHexes.push(hex);
        usedKeys.add(hex.getKey());
        
        // Remove selected from pool (swap-pop or filter)
        validHexes.splice(randomIndex, 1);
    }

    const castles: Castle[] = [];

    // Create White castles (South)
    selectedHexes.forEach(hex => {
        castles.push(new Castle(hex, 'w', 0));
    });

    // Create Mirrored Black castles (North)
    // Mirroring strategy: Rotate 180 or Reflection?
    // Standard chess mirror: file (q) matches, rank (r) is opposite?
    // In hex (q, r, s), rotating 180 is (-q, -r, -s).
    // Reflecting across r=0 (river)?
    // If hex is (q, r, s), reflection across r=0 (q axis) isn't simple in cube coords without changing shape.
    // Point reflection (-q, -r, -s) is standard board symmetry.
    
    selectedHexes.forEach(hex => {
        const mirroredHex = new Hex(-hex.q, -hex.r, -hex.s);
        // Verify it's on the board (it should be since board is symmetric)
        if (board.hexSet.has(mirroredHex.getKey())) {
             castles.push(new Castle(mirroredHex, 'b', 0));
        }
    });

    return castles;
  }
}
