import { Sanctuary } from "../Entities/Sanctuary";
import { Hex } from "../Entities/Hex";
import { SanctuaryType, PieceType } from "../../Constants";

describe("Sanctuary", () => {
  describe("constructor", () => {
    it("should create a sanctuary with default values", () => {
      const hex = new Hex(0, 0, 0);
      const sanctuary = new Sanctuary(hex, SanctuaryType.WolfCovenant, 'w');

      expect(sanctuary.hex).toBe(hex);
      expect(sanctuary.type).toBe(SanctuaryType.WolfCovenant);
      expect(sanctuary.territorySide).toBe('w');
      expect(sanctuary.controller).toBeNull();
      expect(sanctuary.cooldown).toBe(0);
      expect(sanctuary.hasPledgedThisGame).toBe(false);
    });

    it("should create a sanctuary with custom values", () => {
      const hex = new Hex(1, -1, 0);
      const sanctuary = new Sanctuary(
        hex,
        SanctuaryType.ForsakenGrounds,
        'b',
        'w',
        3,
        true
      );

      expect(sanctuary.controller).toBe('w');
      expect(sanctuary.cooldown).toBe(3);
      expect(sanctuary.hasPledgedThisGame).toBe(true);
    });
  });

  describe("tier getters", () => {
    it("should return tier 1 for Wolf Covenant", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w');
      expect(sanctuary.tier).toBe(1);
    });

    it("should return tier 1 for Sacred Spring", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.SacredSpring, 'w');
      expect(sanctuary.tier).toBe(1);
    });

    it("should return tier 2 for Warden's Watch", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WardensWatch, 'w');
      expect(sanctuary.tier).toBe(2);
    });

    it("should return tier 2 for Arcane Refuge", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.ArcaneRefuge, 'w');
      expect(sanctuary.tier).toBe(2);
    });

    it("should return tier 3 for Forsaken Grounds", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.ForsakenGrounds, 'w');
      expect(sanctuary.tier).toBe(3);
    });

    it("should return tier 3 for Pyre Eternal", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.PyreEternal, 'w');
      expect(sanctuary.tier).toBe(3);
    });
  });

  describe("requiredStrength", () => {
    it("should return 1 for tier 1 sanctuaries", () => {
      const wolf = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w');
      const healer = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.SacredSpring, 'w');
      expect(wolf.requiredStrength).toBe(1);
      expect(healer.requiredStrength).toBe(1);
    });

    it("should return 3 for tier 2 sanctuaries", () => {
      const ranger = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WardensWatch, 'w');
      const wizard = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.ArcaneRefuge, 'w');
      expect(ranger.requiredStrength).toBe(3);
      expect(wizard.requiredStrength).toBe(3);
    });

    it("should return 4 for tier 3 sanctuaries", () => {
      const necro = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.ForsakenGrounds, 'w');
      const phoenix = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.PyreEternal, 'w');
      expect(necro.requiredStrength).toBe(4);
      expect(phoenix.requiredStrength).toBe(4);
    });
  });

  describe("requiresSacrifice", () => {
    it("should return false for tier 1 and 2 sanctuaries", () => {
      const wolf = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w');
      const ranger = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WardensWatch, 'w');
      expect(wolf.requiresSacrifice).toBe(false);
      expect(ranger.requiresSacrifice).toBe(false);
    });

    it("should return true for tier 3 sanctuaries", () => {
      const necro = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.ForsakenGrounds, 'w');
      const phoenix = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.PyreEternal, 'w');
      expect(necro.requiresSacrifice).toBe(true);
      expect(phoenix.requiresSacrifice).toBe(true);
    });
  });

  describe("pieceType", () => {
    it("should return correct piece type for each sanctuary", () => {
      expect(new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w').pieceType).toBe(PieceType.Wolf);
      expect(new Sanctuary(new Hex(0, 0, 0), SanctuaryType.SacredSpring, 'w').pieceType).toBe(PieceType.Healer);
      expect(new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WardensWatch, 'w').pieceType).toBe(PieceType.Ranger);
      expect(new Sanctuary(new Hex(0, 0, 0), SanctuaryType.ArcaneRefuge, 'w').pieceType).toBe(PieceType.Wizard);
      expect(new Sanctuary(new Hex(0, 0, 0), SanctuaryType.ForsakenGrounds, 'w').pieceType).toBe(PieceType.Necromancer);
      expect(new Sanctuary(new Hex(0, 0, 0), SanctuaryType.PyreEternal, 'w').pieceType).toBe(PieceType.Phoenix);
    });
  });

  describe("isReady", () => {
    it("should return true when cooldown is 0 and not pledged", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w');
      expect(sanctuary.isReady).toBe(true);
    });

    it("should return false when on cooldown", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w', null, 3);
      expect(sanctuary.isReady).toBe(false);
    });

    it("should return false when already pledged this game", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w', null, 0, true);
      expect(sanctuary.isReady).toBe(false);
    });
  });

  describe("adjacentHexes", () => {
    it("should return 6 adjacent hexes", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w');
      const adjacent = sanctuary.adjacentHexes();
      expect(adjacent.length).toBe(6);
    });
  });

  describe("isAdjacent", () => {
    it("should return true for adjacent hex", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w');
      expect(sanctuary.isAdjacent(new Hex(1, -1, 0))).toBe(true);
    });

    it("should return false for non-adjacent hex", () => {
      const sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w');
      expect(sanctuary.isAdjacent(new Hex(2, -2, 0))).toBe(false);
    });
  });

  describe("with", () => {
    it("should create a new sanctuary with updated properties", () => {
      const original = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w');
      const updated = original.with({ controller: 'b', cooldown: 5 });

      expect(updated.controller).toBe('b');
      expect(updated.cooldown).toBe(5);
      expect(updated.type).toBe(SanctuaryType.WolfCovenant); // unchanged
      expect(original.controller).toBeNull(); // original unchanged
    });
  });

  describe("clone", () => {
    it("should create an identical copy", () => {
      const original = new Sanctuary(new Hex(1, -1, 0), SanctuaryType.ArcaneRefuge, 'b', 'w', 2, true);
      const cloned = original.clone();

      expect(cloned.hex.equals(original.hex)).toBe(true);
      expect(cloned.type).toBe(original.type);
      expect(cloned.controller).toBe(original.controller);
      expect(cloned.cooldown).toBe(original.cooldown);
      expect(cloned.hasPledgedThisGame).toBe(original.hasPledgedThisGame);
      expect(cloned).not.toBe(original); // Different object
    });
  });
});
