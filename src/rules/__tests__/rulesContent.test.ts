import {
  CASTLE_RECRUITMENT_COOLDOWN_LABEL,
  SANCTUARY_EVOLUTION_COOLDOWN_LABEL,
  PieceType,
} from "../../Constants";
import {
  allPieceReferenceRows,
  castleRules,
  commonBlockerRules,
  optionalModeRules,
  phaseRules,
  rangeDetailRules,
  recruitmentDetailRules,
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
    expect(commonBlockerRules.find((rule) => rule.title === "Cannot recruit")?.text).toContain(
      "on cooldown"
    );
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
    expect(castleRules.find((rule) => rule.title === "Capturing an empty castle")?.text).toContain(
      "recruitment cooldown is cleared"
    );
    expect(castleRules.find((rule) => rule.title === "Capturing a piece on a castle")?.text).toContain(
      "recruitment cooldown is cleared"
    );
    expect(phaseRules.find((rule) => rule.title === "Turn reset")?.text).toContain(
      "that castle controller's turn"
    );
    expect(recruitmentDetailRules.find((rule) => rule.title === "Eligibility")?.text).toContain(
      "not on cooldown"
    );
    expect(recruitmentDetailRules.find((rule) => rule.title === "Recruitment cooldown")?.text).toContain(
      CASTLE_RECRUITMENT_COOLDOWN_LABEL
    );
    expect(recruitmentDetailRules.find((rule) => rule.title === "Castle counter")?.text).toContain(
      "cooldown clears"
    );
    expect(sanctuaryDetailRules.find((rule) => rule.title === "Cooldown acceleration")?.text).toContain(
      "cooldown player's turn"
    );
    expect(sanctuaryDetailRules.find((rule) => rule.title === "Cooldown acceleration")?.text).toContain(
      "non-Swordsman"
    );
    expect(sanctuaryDetailRules.find((rule) => rule.title === "Evolution")?.text).toContain(
      SANCTUARY_EVOLUTION_COOLDOWN_LABEL
    );
    expect(sanctuaryRules.find((rule) => rule.title === "Cooldown")?.text).toContain(
      "player who used it"
    );
    expect(sanctuaryRules.find((rule) => rule.title === "Cooldown")?.text).not.toContain(
      "board side"
    );
    expect(sanctuaryRules.map((rule) => rule.text).join(" ")).not.toContain("invader");
  });
});
