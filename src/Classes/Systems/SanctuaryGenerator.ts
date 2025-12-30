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
    // Initialize usedKeys with Castles AND their neighbors (Exclusion Zone)
    // This prevents any sanctuary from being generated adjacent to a castle.
    const usedKeys = new Set<string>();
    
    // Add all castles and their neighbors to exclusion list
    board.castleHexes.forEach(cHex => {
      usedKeys.add(cHex.getKey());
      // Add all 6 neighbors
      for (let i = 0; i < 6; i++) {
        const neighbor = cHex.neighbor(i);
        usedKeys.add(neighbor.getKey());
      }
    });

    for (const type of types) {
      const tier = SanctuaryConfig[type].tier;
      // validHexes will now exclude keys in usedKeys (including exclusion zones)
      const validHexes = this.getValidHexesForTier(board, tier, usedKeys);

      if (validHexes.length === 0) {
        console.warn(`No valid hexes for sanctuary type: ${type}`);
        continue;
      }

      // Since we trust validHexes to be excluded from obstacles, we just need to ensure symmetry validity.
      // But validHexes is based on 'usedKeys'. 'usedKeys' contains symmetric exclusions if we add them.
      
      // We need to pick a hex such that its MIRROR is also valid.
      // Filter candidates where mirror is also in validHexes (or at least not in usedKeys).
      const symmetricCandidates = validHexes.filter(h => {
        const mirroredH = new Hex(-h.q, -h.r, -h.s);
        // Ensure mirrored position is not used/excluded
        return !usedKeys.has(mirroredH.getKey());
      });

      if (symmetricCandidates.length === 0) {
          console.warn(`No symmetric candidates for type: ${type}`);
          continue;
      }

            // Pick a random hex from valid OPTIONS
      const randomIndex = Math.floor(Math.random() * symmetricCandidates.length);
      const hex = symmetricCandidates[randomIndex];
      const mirroredHex = new Hex(-hex.q, -hex.r, -hex.s);

      // Add selection AND its neighbors to exclusion list (for NEXT iteration)
      // This prevents next sanctuary from spawning adjacent to this one.
      [hex, mirroredHex].forEach(h => {
          usedKeys.add(h.getKey());
          for (let i = 0; i < 6; i++) {
              usedKeys.add(h.neighbor(i).getKey());
          }
      });
      
      if (tier === 1) {
        sanctuaries.push(new Sanctuary(hex, type, 'w'));
        sanctuaries.push(new Sanctuary(mirroredHex, type, 'b'));
      } else {
        sanctuaries.push(new Sanctuary(hex, type, 'b'));
        sanctuaries.push(new Sanctuary(mirroredHex, type, 'w'));
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
