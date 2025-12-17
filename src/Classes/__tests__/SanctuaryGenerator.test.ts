import { SanctuaryGenerator } from "../Systems/SanctuaryGenerator";
import { Board } from "../Core/Board";
import { SanctuaryType, SanctuaryConfig } from "../../Constants";

describe("SanctuaryGenerator", () => {
  let board: Board;

  beforeEach(() => {
    // Create a standard 8-hex board
    board = new Board(8);
  });

  describe("generateRandomSanctuaries", () => {
    it("should generate sanctuaries for given types", () => {
      const types = [SanctuaryType.WolfCovenant];
      const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, types);

      // Should create 2 sanctuaries (one per side, mirrored)
      expect(sanctuaries.length).toBe(2);
    });

    it("should generate mirrored sanctuaries", () => {
      const types = [SanctuaryType.WolfCovenant];
      const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, types);

      const [first, second] = sanctuaries;
      
      // Mirrored means (-q, -r, -s)
      // JavaScript: -0 !== 0 with Object.is, but -0 == 0 with loose equality
      // Use expect().toBe() with explicit conversion to avoid -0 issues
      expect(second.hex.q + 0).toBe(-first.hex.q + 0);
      expect(second.hex.r + 0).toBe(-first.hex.r + 0);
      expect(second.hex.s + 0).toBe(-first.hex.s + 0);
    });

    it("should generate multiple sanctuary types", () => {
      const types = [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring];
      const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, types);

      // 2 types × 2 sides = 4 sanctuaries
      expect(sanctuaries.length).toBe(4);
    });

    it("should place sanctuaries on valid board hexes", () => {
      const types = [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring];
      const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, types);

      for (const sanctuary of sanctuaries) {
        expect(board.hexSet.has(sanctuary.hex.getKey())).toBe(true);
      }
    });

    it("should not place sanctuaries on river hexes", () => {
      const types = [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring];
      const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, types);

      for (const sanctuary of sanctuaries) {
        expect(board.isRiver(sanctuary.hex)).toBe(false);
      }
    });

    it("should not place two sanctuaries on the same hex", () => {
      const types = [
        SanctuaryType.WolfCovenant,
        SanctuaryType.SacredSpring,
        SanctuaryType.WardensWatch,
        SanctuaryType.ArcaneRefuge
      ];
      const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, types);

      const hexKeys = sanctuaries.map(s => s.hex.getKey());
      const uniqueKeys = new Set(hexKeys);
      
      expect(uniqueKeys.size).toBe(hexKeys.length);
    });
  });

  describe("generateDefaultSanctuaries", () => {
    it("should generate Tier 1 sanctuaries only", () => {
      const sanctuaries = SanctuaryGenerator.generateDefaultSanctuaries(board);

      // WolfCovenant + SacredSpring × 2 sides = 4
      expect(sanctuaries.length).toBe(4);

      // All should be Tier 1
      for (const sanctuary of sanctuaries) {
        expect(sanctuary.tier).toBe(1);
      }
    });
  });

  describe("generateAllSanctuaries", () => {
    it("should generate all 6 sanctuary types", () => {
      const sanctuaries = SanctuaryGenerator.generateAllSanctuaries(board);

      // 6 types × 2 sides = 12
      expect(sanctuaries.length).toBe(12);
    });

    it("should include all tiers", () => {
      const sanctuaries = SanctuaryGenerator.generateAllSanctuaries(board);

      const tier1 = sanctuaries.filter(s => s.tier === 1);
      const tier2 = sanctuaries.filter(s => s.tier === 2);
      const tier3 = sanctuaries.filter(s => s.tier === 3);

      expect(tier1.length).toBeGreaterThan(0);
      expect(tier2.length).toBeGreaterThan(0);
      expect(tier3.length).toBeGreaterThan(0);
    });
  });

  describe("zone-based placement", () => {
    it("should place Tier 1 sanctuaries near river (neutral zone)", () => {
      // Run multiple times due to randomness
      for (let i = 0; i < 5; i++) {
        const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(
          board, 
          [SanctuaryType.WolfCovenant]
        );

        for (const sanctuary of sanctuaries) {
          // Tier 1 should be near r=0 (river)
          expect(Math.abs(sanctuary.hex.r)).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe("sanctuary properties", () => {
    it("should initialize sanctuaries with correct defaults", () => {
      const sanctuaries = SanctuaryGenerator.generateDefaultSanctuaries(board);

      for (const sanctuary of sanctuaries) {
        expect(sanctuary.controller).toBeNull();
        expect(sanctuary.cooldown).toBe(0);
        expect(sanctuary.hasPledgedThisGame).toBe(false);
        expect(sanctuary.isReady).toBe(true);
      }
    });
  });
});
