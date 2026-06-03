import { AbilityType, PieceType, SanctuaryType } from "../../Constants";
import { buildTutorialGameEventFromMove, type TutorialEventSnapshot } from "../eventMetadata";

const snapshot = (
  piecesByHex: TutorialEventSnapshot["piecesByHex"],
  options: Partial<TutorialEventSnapshot> = {}
): TutorialEventSnapshot => ({
  pieceCount: Object.keys(piecesByHex).length,
  graveyardLength: 0,
  piecesByHex,
  castleOwnersByHex: {},
  ...options,
});

describe("tutorial event metadata", () => {
  it("emits actor and target identity for non-capturing attacks", () => {
    const previousSnapshot = snapshot({
      "-2,2,0": { color: "w", type: PieceType.Archer },
      "0,0,0": { color: "b", type: PieceType.Swordsman },
    });
    const currentSnapshot = snapshot({
      "-2,2,0": { color: "w", type: PieceType.Archer },
      "0,0,0": { color: "b", type: PieceType.Swordsman },
    });

    expect(
      buildTutorialGameEventFromMove({
        notation: "H11xJ10",
        phase: "Attack",
        resultPhase: "Attack",
        previousSnapshot,
        currentSnapshot,
        castleHexKeys: new Set(),
      })
    ).toEqual(
      expect.objectContaining({
        type: "attack",
        actorPieceType: PieceType.Archer,
        actorColor: "w",
        targetPieceType: PieceType.Swordsman,
        targetColor: "b",
        sourceHexKey: "-2,2,0",
        targetHexKey: "0,0,0",
        targetKind: "piece",
      })
    );
  });

  it("emits created piece identity for recruitment notation", () => {
    const previousSnapshot = snapshot({});
    const currentSnapshot = snapshot({
      "1,-2,1": { color: "w", type: PieceType.Swordsman },
    });

    expect(
      buildTutorialGameEventFromMove({
        notation: "K9=Swo",
        phase: "Recruitment",
        resultPhase: "Recruitment",
        previousSnapshot,
        currentSnapshot,
        castleHexKeys: new Set(),
      })
    ).toEqual(
      expect.objectContaining({
        type: "recruitment",
        createdPieceType: PieceType.Swordsman,
        createdColor: "w",
        targetHexKey: "1,-2,1",
      })
    );
  });

  it("emits the captured castle target and source castle for castle and recruitment events", () => {
    const previousCaptureSnapshot = snapshot(
      { "1,-1,0": { color: "w", type: PieceType.Knight } },
      {
        castleOwnersByHex: { "3,-3,0": "b" },
        castlesByHex: { "3,-3,0": { color: "b", owner: "b" } },
      } as Partial<TutorialEventSnapshot>
    );
    const currentCaptureSnapshot = snapshot(
      { "3,-3,0": { color: "w", type: PieceType.Knight } },
      {
        castleOwnersByHex: { "3,-3,0": "w" },
        castlesByHex: { "3,-3,0": { color: "b", owner: "w" } },
      } as Partial<TutorialEventSnapshot>
    );

    expect(
      buildTutorialGameEventFromMove({
        notation: "K10xM9",
        phase: "Movement",
        resultPhase: "Movement",
        previousSnapshot: previousCaptureSnapshot,
        currentSnapshot: currentCaptureSnapshot,
        castleHexKeys: new Set(["3,-3,0"]),
      })
    ).toEqual(
      expect.objectContaining({
        type: "capture",
        actorPieceType: PieceType.Knight,
        actorColor: "w",
        sourceHexKey: "1,-1,0",
        targetHexKey: "3,-3,0",
        targetKind: "castle",
        castleControlChanged: true,
      })
    );

    const previousRecruitmentSnapshot = snapshot(
      {},
      {
        castlesByHex: {
          "-3,3,0": { color: "w", owner: "w" },
          "3,-3,0": { color: "b", owner: "w" },
        },
      } as Partial<TutorialEventSnapshot>
    );
    const currentRecruitmentSnapshot = snapshot(
      { "2,-2,0": { color: "w", type: PieceType.Swordsman } },
      {
        castlesByHex: {
          "-3,3,0": { color: "w", owner: "w" },
          "3,-3,0": { color: "b", owner: "w" },
        },
      } as Partial<TutorialEventSnapshot>
    );

    expect(
      buildTutorialGameEventFromMove({
        notation: "L9=Swo",
        phase: "Recruitment",
        resultPhase: "Recruitment",
        previousSnapshot: previousRecruitmentSnapshot,
        currentSnapshot: currentRecruitmentSnapshot,
        castleHexKeys: new Set(["-3,3,0", "3,-3,0"]),
      })
    ).toEqual(
      expect.objectContaining({
        type: "recruitment",
        createdPieceType: PieceType.Swordsman,
        createdColor: "w",
        targetHexKey: "2,-2,0",
        sourceCastleHexKey: "3,-3,0",
      } as Record<string, unknown>)
    );
  });

  it("emits source sanctuary identity for pledge notation", () => {
    const previousSnapshot = snapshot(
      { "0,0,0": { color: "w", type: PieceType.Swordsman } },
      {
        sanctuariesByHex: { "0,0,0": { type: SanctuaryType.WolfCovenant, controller: "w" } },
      } as Partial<TutorialEventSnapshot>
    );
    const currentSnapshot = snapshot(
      {
        "0,0,0": { color: "w", type: PieceType.Swordsman },
        "1,-1,0": { color: "w", type: PieceType.Wolf },
      },
      {
        sanctuariesByHex: { "0,0,0": { type: SanctuaryType.WolfCovenant, controller: "w" } },
      } as Partial<TutorialEventSnapshot>
    );

    expect(
      buildTutorialGameEventFromMove({
        notation: "P:WlfK10",
        phase: "Recruitment",
        resultPhase: "Recruitment",
        previousSnapshot,
        currentSnapshot,
        castleHexKeys: new Set(),
      })
    ).toEqual(
      expect.objectContaining({
        type: "pledge",
        createdPieceType: PieceType.Wolf,
        createdColor: "w",
        targetHexKey: "1,-1,0",
        sourceSanctuaryHexKey: "0,0,0",
      } as Record<string, unknown>)
    );
  });

  it("emits promotion actor and created piece identity after the move notation is rewritten", () => {
    const previousSnapshot = snapshot({
      "1,-3,2": { color: "w", type: PieceType.Swordsman },
    });
    const currentSnapshot = snapshot({
      "1,-3,2": { color: "w", type: PieceType.Archer },
    });

    expect(
      buildTutorialGameEventFromMove({
        notation: "J8K8=Ar",
        phase: "Movement",
        resultPhase: "Movement",
        previousSnapshot,
        currentSnapshot,
        castleHexKeys: new Set(),
      })
    ).toEqual(
      expect.objectContaining({
        type: "promotion",
        actorPieceType: PieceType.Swordsman,
        actorColor: "w",
        createdPieceType: PieceType.Archer,
        createdColor: "w",
        targetHexKey: "1,-3,2",
      })
    );
  });

  it("emits named ability identity and board-effect flags", () => {
    const previousSnapshot = snapshot({
      "0,0,0": { color: "w", type: PieceType.Wizard },
      "0,-1,1": { color: "b", type: PieceType.Swordsman },
    });
    const currentSnapshot = snapshot({
      "0,0,0": { color: "w", type: PieceType.Wizard },
    });

    expect(
      buildTutorialGameEventFromMove({
        notation: "WF:J10J9",
        phase: "Attack",
        resultPhase: "Attack",
        previousSnapshot,
        currentSnapshot,
        castleHexKeys: new Set(),
      })
    ).toEqual(
      expect.objectContaining({
        type: "ability",
        abilityType: AbilityType.Fireball,
        actorPieceType: PieceType.Wizard,
        actorColor: "w",
        targetPieceType: PieceType.Swordsman,
        targetColor: "b",
        targetHexKey: "0,-1,1",
        pieceRemoved: true,
      })
    );
  });
});
