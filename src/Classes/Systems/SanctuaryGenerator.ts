import { Board } from "../Core/Board";
import { Hex } from "../Entities/Hex";
import { Sanctuary } from "../Entities/Sanctuary";
import { SanctuaryType, SanctuaryConfig, Color } from "../../Constants";

/**
 * Generates sanctuary positions on the board.
 * 
 * PLACEMENT ZONES (zone-based by tier):
 * - Tier 1: Neutral zone near river (equal distance for both players)
 * - Tier 2: Opponent's shallow territory (past river, not deep)
 * - Tier 3: Opponent's deep territory (near enemy starting area)
 * 
 * All placements are mirrored for fairness.
 */
export class SanctuaryGenerator {
  /**
   * Generates random mirrored sanctuary positions.
   * 
   * @param board The board to place sanctuaries on
   * @param types Array of sanctuary types to generate (defaults to all Tier 1)
   * @returns Array of Sanctuary objects (one per type, mirrored for both sides)
   */
  public static generateRandomSanctuaries(
    board: Board,
    types: SanctuaryType[] = [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring]
  ): Sanctuary[] {
    const sanctuaries: Sanctuary[] = [];
    const usedKeys = new Set<string>();

    for (const type of types) {
      const tier = SanctuaryConfig[type].tier;
      const validHexes = this.getValidHexesForTier(board, tier, usedKeys);

      if (validHexes.length === 0) {
        console.warn(`No valid hexes for sanctuary type: ${type}`);
        continue;
      }

      // Pick a random hex from valid options (on White's territory side for Tier 2/3)
      const randomIndex = Math.floor(Math.random() * validHexes.length);
      const hex = validHexes[randomIndex];
      const mirroredHex = new Hex(-hex.q, -hex.r, -hex.s);

      // Mark both as used
      usedKeys.add(hex.getKey());
      usedKeys.add(mirroredHex.getKey());

      if (tier === 1) {
        // Tier 1: Neutral zone - both players can access equally
        // Create one sanctuary, territory is neutral (use 'w' as placeholder)
        sanctuaries.push(new Sanctuary(hex, type, 'w'));
        sanctuaries.push(new Sanctuary(mirroredHex, type, 'b'));
      } else {
        // Tier 2/3: In opponent's territory
        // hex is in White's target zone (Black's territory) → White must reach it
        // mirroredHex is in Black's target zone (White's territory) → Black must reach it
        sanctuaries.push(new Sanctuary(hex, type, 'b')); // On Black's side, for White to capture
        sanctuaries.push(new Sanctuary(mirroredHex, type, 'w')); // On White's side, for Black to capture
      }
    }

    return sanctuaries;
  }

  /**
   * Returns valid hex positions for a given tier.
   */
  private static getValidHexesForTier(
    board: Board,
    tier: 1 | 2 | 3,
    usedKeys: Set<string>
  ): Hex[] {
    return board.hexes.filter(h => {
      const key = h.getKey();
      
      // Skip already used hexes
      if (usedKeys.has(key)) return false;
      
      // Skip river hexes
      if (board.isRiver(h)) return false;
      
      // Skip castle hexes
      if (board.isCastle(h, board.NSquares)) return false;

      // Skip high ground hexes (avoid placing sanctuaries on strategic terrain)
      if (board.highGroundHexSet.has(key)) return false;
      
      // Zone filtering based on tier
      // Board Size N=8. R-coordinates range roughly -8 to +8.
      // Starting pieces occupy roughly R=6,7,8.
      // Safe Zone: Keep Sanctuaries within R <= 5.
      
      switch (tier) {
        case 1:
          // Tier 1: Neutral Central Zone
          // R: -1 to 1 (River is 0, mostly empty or crossings)
          return Math.abs(h.r) <= 1 && Math.abs(h.r) >= 1; // Avoid exact river center if desired, but 0 is filtered above
        
        case 2:
          // Tier 2: Mid-Field
          // R: 2 to 3 (Safe distance from river, far from base)
          return h.r >= 2 && h.r <= 3;
        
        case 3:
          // Tier 3: Forward Aggressive (But SAFE from spawn)
          // R: 4 to 5 (Still reachable, but definitely not in spawn zone 6+)
          return h.r >= 4 && h.r <= 5;
        
        default:
          return false;
      }
    });
  }

  /**
   * Generates a default set of Tier 1 sanctuaries for a standard game.
   */
  public static generateDefaultSanctuaries(board: Board): Sanctuary[] {
    return this.generateRandomSanctuaries(board, [
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring
    ]);
  }

  /**
   * Generates a full set of all sanctuary types.
   */
  public static generateAllSanctuaries(board: Board): Sanctuary[] {
    return this.generateRandomSanctuaries(board, [
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
      SanctuaryType.WardensWatch,
      SanctuaryType.ArcaneRefuge,
      SanctuaryType.ForsakenGrounds,
      SanctuaryType.PyreEternal
    ]);
  }
}
