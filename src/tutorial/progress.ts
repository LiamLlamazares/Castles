import { getAllLessons, type TutorialLesson } from ".";
import { getLessonObjectives } from "./objectives";

export const TUTORIAL_PROGRESS_STORAGE_KEY = "castles_tutorial_progress_v2";
export const TUTORIAL_PROGRESS_UPDATED_EVENT = "castles:tutorial-progress-updated";

export interface TutorialProgressState {
  lastLessonId: string;
  completedLessonIds: string[];
  checkedObjectiveIdsByLessonId: Record<string, string[]>;
}

export interface StoredTutorialProgress {
  progress: TutorialProgressState;
  canStoreProgress: boolean;
}

export interface TutorialProgressSummary {
  completedLessonCount: number;
  lessonCount: number;
  isComplete: boolean;
  canStoreProgress: boolean;
}

export function createDefaultTutorialProgress(lessons: TutorialLesson[]): TutorialProgressState {
  return {
    lastLessonId: lessons[0]?.id ?? "",
    completedLessonIds: [],
    checkedObjectiveIdsByLessonId: {},
  };
}

export function orderTutorialLessonIds(ids: Iterable<string>, lessons: TutorialLesson[]): string[] {
  const idSet = new Set(ids);
  return lessons.filter((lesson) => idSet.has(lesson.id)).map((lesson) => lesson.id);
}

export function sanitizeTutorialProgress(raw: unknown, lessons: TutorialLesson[]): TutorialProgressState {
  const defaults = createDefaultTutorialProgress(lessons);
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  const record = raw as Partial<TutorialProgressState>;
  const lastLessonId = typeof record.lastLessonId === "string" && lessonIds.has(record.lastLessonId)
    ? record.lastLessonId
    : defaults.lastLessonId;
  const completed = new Set<string>();
  const rawCompletedLessonIds = Array.isArray(record.completedLessonIds)
    ? new Set(record.completedLessonIds.filter((id): id is string => typeof id === "string" && lessonIds.has(id)))
    : new Set<string>();
  const checkedObjectiveIdsByLessonId: Record<string, string[]> = {};
  const rawCheckedIds = record.checkedObjectiveIdsByLessonId && typeof record.checkedObjectiveIdsByLessonId === "object"
    ? record.checkedObjectiveIdsByLessonId
    : {};

  for (const lesson of lessons) {
    const objectives = getLessonObjectives(lesson);
    const objectiveIdSet = new Set(objectives.map((objective) => objective.id));
    const checked = new Set<string>();
    const rawLessonCheckedIds = rawCheckedIds[lesson.id];
    if (Array.isArray(rawLessonCheckedIds)) {
      for (const objectiveId of rawLessonCheckedIds) {
        if (typeof objectiveId === "string" && objectiveIdSet.has(objectiveId)) {
          checked.add(objectiveId);
        }
      }
    }

    const orderedCheckedIds = objectives
      .map((objective) => objective.id)
      .filter((objectiveId) => checked.has(objectiveId));
    if (orderedCheckedIds.length > 0) {
      checkedObjectiveIdsByLessonId[lesson.id] = orderedCheckedIds;
    }

    if (objectives.length > 0) {
      if (objectives.every((objective) => checked.has(objective.id))) {
        completed.add(lesson.id);
      }
    } else if (rawCompletedLessonIds.has(lesson.id)) {
      completed.add(lesson.id);
    }
  }

  return {
    lastLessonId,
    completedLessonIds: orderTutorialLessonIds(completed, lessons),
    checkedObjectiveIdsByLessonId,
  };
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function dispatchProgressUpdated(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new Event(TUTORIAL_PROGRESS_UPDATED_EVENT));
}

export function readStoredTutorialProgress(lessons: TutorialLesson[] = getAllLessons()): StoredTutorialProgress {
  const storage = getBrowserStorage();
  if (!storage) {
    return { progress: createDefaultTutorialProgress(lessons), canStoreProgress: false };
  }

  try {
    const stored = storage.getItem(TUTORIAL_PROGRESS_STORAGE_KEY);
    if (!stored) {
      return { progress: createDefaultTutorialProgress(lessons), canStoreProgress: true };
    }
    return { progress: sanitizeTutorialProgress(JSON.parse(stored), lessons), canStoreProgress: true };
  } catch (error) {
    console.error("Failed to load tutorial progress", error);
    return { progress: createDefaultTutorialProgress(lessons), canStoreProgress: false };
  }
}

export function saveStoredTutorialProgress(progress: TutorialProgressState): boolean {
  const storage = getBrowserStorage();
  if (!storage) return false;

  try {
    storage.setItem(TUTORIAL_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    dispatchProgressUpdated();
    return true;
  } catch (error) {
    console.error("Failed to save tutorial progress", error);
    return false;
  }
}

export function readTutorialProgressSummary(lessons: TutorialLesson[] = getAllLessons()): TutorialProgressSummary {
  const stored = readStoredTutorialProgress(lessons);
  const completedLessonCount = stored.progress.completedLessonIds.length;
  const lessonCount = lessons.length;
  return {
    completedLessonCount,
    lessonCount,
    isComplete: lessonCount > 0 && completedLessonCount === lessonCount,
    canStoreProgress: stored.canStoreProgress,
  };
}

export function isTutorialComplete(lessons: TutorialLesson[] = getAllLessons()): boolean {
  return readTutorialProgressSummary(lessons).isComplete;
}
