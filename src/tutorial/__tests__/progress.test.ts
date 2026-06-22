import { getAllLessons } from "..";
import { getLessonObjectives } from "../objectives";
import {
  readTutorialProgressSummary,
  sanitizeTutorialProgress,
  TUTORIAL_PROGRESS_STORAGE_KEY,
  type TutorialProgressState,
} from "../progress";

function completeProgress(): TutorialProgressState {
  const lessons = getAllLessons();
  return {
    lastLessonId: lessons.at(-1)?.id ?? "",
    completedLessonIds: lessons.map((lesson) => lesson.id),
    checkedObjectiveIdsByLessonId: Object.fromEntries(
      lessons
        .map((lesson) => [lesson.id, getLessonObjectives(lesson).map((objective) => objective.id)] as const)
        .filter(([, objectiveIds]) => objectiveIds.length > 0)
    ),
  };
}

describe("tutorial progress storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports complete progress only after all objective-backed lessons are complete", () => {
    localStorage.setItem(TUTORIAL_PROGRESS_STORAGE_KEY, JSON.stringify(completeProgress()));

    const summary = readTutorialProgressSummary();

    expect(summary.lessonCount).toBe(getAllLessons().length);
    expect(summary.completedLessonCount).toBe(getAllLessons().length);
    expect(summary.isComplete).toBe(true);
  });

  it("does not trust stale completed lesson ids without objective evidence", () => {
    const lessons = getAllLessons();
    const sanitized = sanitizeTutorialProgress(
      {
        lastLessonId: lessons.at(-1)?.id,
        completedLessonIds: lessons.map((lesson) => lesson.id),
        checkedObjectiveIdsByLessonId: {},
      },
      lessons
    );

    expect(sanitized.completedLessonIds.length).toBeLessThan(lessons.length);
  });

  it("falls back to incomplete progress when stored JSON is invalid", () => {
    localStorage.setItem(TUTORIAL_PROGRESS_STORAGE_KEY, "{not valid");

    const summary = readTutorialProgressSummary();

    expect(summary.completedLessonCount).toBe(0);
    expect(summary.isComplete).toBe(false);
    expect(summary.canStoreProgress).toBe(false);
  });

  it("falls back to incomplete progress when browser storage access is denied", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("storage denied");
    });

    const summary = readTutorialProgressSummary();

    expect(summary.completedLessonCount).toBe(0);
    expect(summary.isComplete).toBe(false);
    expect(summary.canStoreProgress).toBe(false);
  });
});
