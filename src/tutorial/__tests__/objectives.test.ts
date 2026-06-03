import { Board, type BoardConfig } from "../../Classes/Core/Board";
import { Castle } from "../../Classes/Entities/Castle";
import { Hex } from "../../Classes/Entities/Hex";
import { PieceFactory } from "../../Classes/Entities/PieceFactory";
import { AbilityType, PieceType } from "../../Constants";
import { getLessonObjectives, getTutorialInspectionKey, objectiveMatchesTutorialEvent } from "../objectives";
import type { TutorialLesson } from "../types";
import { getStartingLayout } from "../../ConstantImports";

function createObjectiveTestLesson(overrides: Partial<TutorialLesson> = {}): TutorialLesson {
  const castles = [
    new Castle(new Hex(-2, 2, 0), "w", 0),
    new Castle(new Hex(2, -2, 0), "b", 0),
  ];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), "w"),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), "b"),
  ];

  return {
    id: "objective-test",
    title: "Objective test",
    description: "Objective matcher test fixture",
    board,
    pieces,
    layout: getStartingLayout(board),
    ...overrides,
  };
}

describe("tutorial objectives", () => {
  it("preserves authored completion metadata when normalizing objective ids", () => {
    const lesson = createObjectiveTestLesson({
      objectives: [
        {
          id: "kill-copy-can-change",
          text: "Copy can change without changing validation.",
          completion: { type: "event", eventTypes: ["capture"], pieceRemoved: true },
        },
      ],
    });

    expect(getLessonObjectives(lesson)).toEqual([
      {
        id: "kill-copy-can-change",
        text: "Copy can change without changing validation.",
        completion: { type: "event", eventTypes: ["capture"], pieceRemoved: true },
      },
    ]);
  });

  it("matches game events from completion metadata instead of objective text keywords", () => {
    const lesson = createObjectiveTestLesson({
      objectives: [
        {
          id: "plain-language",
          text: "Use the position correctly.",
          completion: { type: "event", eventTypes: ["ability"], abilityType: AbilityType.Fireball, pieceRemoved: true },
        },
      ],
    });
    const objective = getLessonObjectives(lesson)[0];

    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "ability",
        abilityType: AbilityType.Fireball,
        pieceRemoved: true,
        phase: "Attack",
      }, new Set())
    ).toBe(true);
    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "ability",
        abilityType: AbilityType.Teleport,
        pieceRemoved: true,
        phase: "Attack",
      }, new Set())
    ).toBe(false);
  });

  it("requires authored actor and target identity when present", () => {
    const lesson = createObjectiveTestLesson({
      objectives: [
        {
          id: "archer-target",
          text: "Use the Archer on the intended target.",
          completion: {
            type: "event",
            eventTypes: ["attack"],
            phase: "Attack",
            actorPieceType: PieceType.Archer,
            actorColor: "w",
            targetPieceType: PieceType.Swordsman,
            targetColor: "b",
            targetHexKey: "1,-1,0",
          },
        },
      ],
    });
    const objective = getLessonObjectives(lesson)[0];

    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "attack",
        phase: "Attack",
        actorPieceType: PieceType.Swordsman,
        actorColor: "w",
        targetPieceType: PieceType.Swordsman,
        targetColor: "b",
        targetHexKey: "1,-1,0",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "attack",
        phase: "Attack",
        actorPieceType: PieceType.Archer,
        actorColor: "b",
        targetPieceType: PieceType.Swordsman,
        targetColor: "b",
        targetHexKey: "1,-1,0",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "attack",
        phase: "Attack",
        actorPieceType: PieceType.Archer,
        actorColor: "w",
        targetPieceType: PieceType.Swordsman,
        targetColor: "w",
        targetHexKey: "1,-1,0",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "attack",
        phase: "Attack",
        actorPieceType: PieceType.Archer,
        actorColor: "w",
        targetPieceType: PieceType.Swordsman,
        targetColor: "b",
        targetHexKey: "0,0,0",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "attack",
        phase: "Attack",
        actorPieceType: PieceType.Archer,
        actorColor: "w",
        targetPieceType: PieceType.Swordsman,
        targetColor: "b",
        targetHexKey: "1,-1,0",
      }, new Set())
    ).toBe(true);
  });

  it("keeps manual objectives out of automatic completion", () => {
    const lesson = createObjectiveTestLesson({
      objectives: [
        {
          id: "find-target",
          text: "Find the important target.",
          completion: { type: "manual" },
        },
      ],
    });

    expect(
      objectiveMatchesTutorialEvent(lesson, getLessonObjectives(lesson)[0], {
        type: "capture",
        pieceRemoved: true,
        phase: "Attack",
      }, new Set())
    ).toBe(false);
  });

  it("requires all authored inspection targets before completing an inspection objective", () => {
    const lesson = createObjectiveTestLesson({
      objectives: [
        {
          id: "inspect-castles",
          text: "Right-click both castles.",
          completion: { type: "inspection", targetKind: "castle", required: "all-castles" },
        },
      ],
    });
    const objective = getLessonObjectives(lesson)[0];
    const firstCastleKey = lesson.board.castles[0].hex.getKey();
    const secondCastleKey = lesson.board.castles[1].hex.getKey();

    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "inspect",
        targetKind: "castle",
        hexKey: firstCastleKey,
      }, new Set([getTutorialInspectionKey("castle", firstCastleKey)]))
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "inspect",
        targetKind: "castle",
        hexKey: secondCastleKey,
      }, new Set([
        getTutorialInspectionKey("castle", firstCastleKey),
        getTutorialInspectionKey("piece", secondCastleKey),
      ]))
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, objective, {
        type: "inspect",
        targetKind: "castle",
        hexKey: secondCastleKey,
      }, new Set([
        getTutorialInspectionKey("castle", firstCastleKey),
        getTutorialInspectionKey("castle", secondCastleKey),
      ]))
    ).toBe(true);
  });

  it("requires authored source castle and sanctuary identity when present", () => {
    const lesson = createObjectiveTestLesson({
      objectives: [
        {
          id: "recruit-source",
          text: "Recruit from the captured castle.",
          completion: {
            type: "event",
            eventTypes: ["recruitment"],
            phase: "Recruitment",
            createdPieceType: PieceType.Swordsman,
            createdColor: "w",
            sourceCastleHexKey: "2,-2,0",
            targetHexKey: "1,-2,1",
          },
        },
        {
          id: "pledge-source",
          text: "Pledge from the intended sanctuary.",
          completion: {
            type: "event",
            eventTypes: ["pledge"],
            phase: "Recruitment",
            createdPieceType: PieceType.Wolf,
            createdColor: "w",
            sourceSanctuaryHexKey: "0,0,0",
            targetHexKey: "1,-1,0",
          },
        },
      ],
    });
    const [recruitObjective, pledgeObjective] = getLessonObjectives(lesson);

    expect(
      objectiveMatchesTutorialEvent(lesson, recruitObjective, {
        type: "recruitment",
        phase: "Recruitment",
        createdPieceType: PieceType.Swordsman,
        createdColor: "w",
        sourceCastleHexKey: "-2,2,0",
        targetHexKey: "1,-2,1",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, recruitObjective, {
        type: "recruitment",
        phase: "Recruitment",
        createdPieceType: PieceType.Swordsman,
        createdColor: "b",
        sourceCastleHexKey: "2,-2,0",
        targetHexKey: "1,-2,1",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, recruitObjective, {
        type: "recruitment",
        phase: "Recruitment",
        createdPieceType: PieceType.Swordsman,
        createdColor: "w",
        sourceCastleHexKey: "2,-2,0",
        targetHexKey: "0,0,0",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, recruitObjective, {
        type: "recruitment",
        phase: "Recruitment",
        createdPieceType: PieceType.Swordsman,
        createdColor: "w",
        sourceCastleHexKey: "2,-2,0",
        targetHexKey: "1,-2,1",
      }, new Set())
    ).toBe(true);
    expect(
      objectiveMatchesTutorialEvent(lesson, pledgeObjective, {
        type: "pledge",
        phase: "Recruitment",
        createdPieceType: PieceType.Wolf,
        createdColor: "w",
        sourceSanctuaryHexKey: "1,-1,0",
        targetHexKey: "1,-1,0",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, pledgeObjective, {
        type: "pledge",
        phase: "Recruitment",
        createdPieceType: PieceType.Wolf,
        createdColor: "b",
        sourceSanctuaryHexKey: "0,0,0",
        targetHexKey: "1,-1,0",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, pledgeObjective, {
        type: "pledge",
        phase: "Recruitment",
        createdPieceType: PieceType.Wolf,
        createdColor: "w",
        sourceSanctuaryHexKey: "0,0,0",
        targetHexKey: "2,-2,0",
      }, new Set())
    ).toBe(false);
    expect(
      objectiveMatchesTutorialEvent(lesson, pledgeObjective, {
        type: "pledge",
        phase: "Recruitment",
        createdPieceType: PieceType.Wolf,
        createdColor: "w",
        sourceSanctuaryHexKey: "0,0,0",
        targetHexKey: "1,-1,0",
      }, new Set())
    ).toBe(true);
  });
});
