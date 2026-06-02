import type { TutorialLesson, TutorialLessonObjective } from "./types";

export interface NormalizedTutorialObjective {
  id: string;
  text: string;
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

function objectiveText(objective: TutorialLessonObjective): string {
  return typeof objective === "string" ? objective : objective.text;
}

function objectiveBaseId(lesson: TutorialLesson, objective: TutorialLessonObjective, index: number): string {
  if (typeof objective !== "string" && objective.id.trim()) {
    return slugifyObjectiveId(objective.id, `objective-${index + 1}`);
  }

  return slugifyObjectiveId(`${lesson.id}-objective-${index + 1}`, `objective-${index + 1}`);
}

export function getLessonObjectives(lesson: TutorialLesson): NormalizedTutorialObjective[] {
  const counts = new Map<string, number>();
  return (lesson.objectives ?? []).map((objective, index) => {
    const baseId = objectiveBaseId(lesson, objective, index);
    const count = counts.get(baseId) ?? 0;
    counts.set(baseId, count + 1);

    return {
      id: count === 0 ? baseId : `${baseId}-${count + 1}`,
      text: objectiveText(objective),
    };
  });
}
