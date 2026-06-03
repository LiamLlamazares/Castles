import { PieceType, type TurnPhase } from "../Constants";
import type { TutorialGameEvent, TutorialLesson, TutorialObjectiveCompletion } from "./types";

export interface NormalizedTutorialObjective {
  id: string;
  text: string;
  completion: TutorialObjectiveCompletion;
}

function slugifyObjectiveId(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return slug || fallback;
}

export function getTutorialInspectionKey(targetKind: TutorialGameEvent["targetKind"], hexKey: string): string {
  return `${targetKind}:${hexKey}`;
}

export function getLessonObjectives(lesson: TutorialLesson): NormalizedTutorialObjective[] {
  const counts = new Map<string, number>();
  return (lesson.objectives ?? []).map((objective, index) => {
    const baseId = slugifyObjectiveId(objective.id, `objective-${index + 1}`);
    const count = counts.get(baseId) ?? 0;
    counts.set(baseId, count + 1);

    return {
      id: count === 0 ? baseId : `${baseId}-${count + 1}`,
      text: objective.text,
      completion: objective.completion,
    };
  });
}

function getRequiredInspectionKeys(
  lesson: TutorialLesson,
  completion: Extract<TutorialObjectiveCompletion, { type: "inspection" }>
): string[] {
  if (completion.required === "all-castles") {
    return lesson.board.castles.map((castle) => castle.hex.getKey());
  }
  if (completion.required === "all-sanctuaries") {
    return (lesson.sanctuaries ?? []).map((sanctuary) => sanctuary.hex.getKey());
  }
  if (completion.required === "all-pieces") {
    return lesson.pieces.map((piece) => piece.hex.getKey());
  }
  if (completion.required === "non-swordsmen-across-river") {
    return lesson.pieces
      .filter((piece) =>
        piece.type !== PieceType.Swordsman &&
        ((piece.color === "w" && piece.hex.r < 0) || (piece.color === "b" && piece.hex.r > 0))
      )
      .map((piece) => piece.hex.getKey());
  }
  return [];
}

function eventReachedPhase(event: TutorialGameEvent, targetPhase: TurnPhase): boolean {
  return event.resultPhase === targetPhase || event.phase === targetPhase;
}

function matchesExpectedFlag(actual: boolean | undefined, expected: boolean | undefined): boolean {
  return expected === undefined || actual === expected;
}

export function objectiveMatchesTutorialEvent(
  lesson: TutorialLesson,
  objective: NormalizedTutorialObjective,
  event: TutorialGameEvent,
  inspectedKeys: Set<string>
): boolean {
  const completion = objective.completion;

  if (completion.type === "manual") {
    return false;
  }

  if (completion.type === "phase") {
    return eventReachedPhase(event, completion.phase);
  }

  if (completion.type === "inspection") {
    if (event.type !== "inspect") return false;
    if (event.targetKind !== completion.targetKind) return false;
    const requiredKeys = getRequiredInspectionKeys(lesson, completion);
    return requiredKeys.length === 0 ||
      requiredKeys.every((key) => inspectedKeys.has(getTutorialInspectionKey(completion.targetKind, key)));
  }

  if (!completion.eventTypes.includes(event.type)) {
    return false;
  }
  if (completion.phase && event.phase !== completion.phase) {
    return false;
  }
  if (completion.resultPhase && event.resultPhase !== completion.resultPhase) {
    return false;
  }
  if (completion.abilityType && event.abilityType !== completion.abilityType) {
    return false;
  }
  if (completion.pieceType && event.pieceType !== completion.pieceType) {
    return false;
  }
  if (completion.pieceColor && event.pieceColor !== completion.pieceColor) {
    return false;
  }
  if (completion.actorPieceType && event.actorPieceType !== completion.actorPieceType) {
    return false;
  }
  if (completion.actorColor && event.actorColor !== completion.actorColor) {
    return false;
  }
  if (completion.targetPieceType && event.targetPieceType !== completion.targetPieceType) {
    return false;
  }
  if (completion.targetColor && event.targetColor !== completion.targetColor) {
    return false;
  }
  if (completion.createdPieceType && event.createdPieceType !== completion.createdPieceType) {
    return false;
  }
  if (completion.createdColor && event.createdColor !== completion.createdColor) {
    return false;
  }
  if (completion.sourceHexKey && event.sourceHexKey !== completion.sourceHexKey) {
    return false;
  }
  if (completion.targetHexKey && event.targetHexKey !== completion.targetHexKey) {
    return false;
  }
  if (completion.sourceCastleHexKey && event.sourceCastleHexKey !== completion.sourceCastleHexKey) {
    return false;
  }
  if (completion.sourceSanctuaryHexKey && event.sourceSanctuaryHexKey !== completion.sourceSanctuaryHexKey) {
    return false;
  }
  return (
    matchesExpectedFlag(event.pieceRemoved, completion.pieceRemoved) &&
    matchesExpectedFlag(event.pieceAdded, completion.pieceAdded) &&
    matchesExpectedFlag(event.castleControlChanged, completion.castleControlChanged)
  );
}
