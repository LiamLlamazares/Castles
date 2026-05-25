import { PieceType } from "../../Constants";
import {
  allPieceReferenceRows,
  castleRules,
  commonBlockerRules,
  optionalModeRules,
  rangeDetailRules,
  sanctuaryDetailRules,
  recruitmentCycle,
  sanctuaryRules,
  terrainRules,
} from "../rulesContent";

describe("rules content", () => {
  it("includes every piece type in the generated reference rows", () => {
    const rulePieceTypes = allPieceReferenceRows.map((row) => row.type);

    expect(new Set(rulePieceTypes)).toEqual(new Set(Object.values(PieceType)));
  });

  it("documents deeper full-manual reference sections", () => {
    expect(recruitmentCycle.map(String)).toEqual([
      "Swordsman",
      "Archer",
      "Knight",
      "Eagle",
      "Giant",
      "Trebuchet",
      "Assassin",
      "Dragon",
      "Monarch",
    ]);
    expect(rangeDetailRules.some((rule) => rule.text.includes("too close"))).toBe(true);
    expect(commonBlockerRules.map((rule) => rule.title)).toEqual([
      "Cannot move",
      "Cannot attack",
      "Cannot recruit",
      "Cannot promote",
      "Cannot pledge",
    ]);
    expect(optionalModeRules[0].text).toContain("4 castles");
    expect(optionalModeRules[0].text).toContain("First to 10 VP");
  });

  it("uses accurate wording for fragile rules", () => {
    expect(terrainRules.find((rule) => rule.title === "River")?.text).toContain(
      "cannot enter river hexes or pass through them"
    );
    expect(castleRules.find((rule) => rule.title === "Recruitment source")?.text).toContain(
      "enemy starting castles"
    );
    expect(sanctuaryDetailRules.find((rule) => rule.title === "Cooldown acceleration")?.text).toContain(
      "non-Swordsman"
    );
    expect(sanctuaryRules.map((rule) => rule.text).join(" ")).not.toContain("invader");
  });
});
