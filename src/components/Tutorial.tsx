/**
 * @file Tutorial.tsx
 * @description Interactive tutorial component for teaching Castles gameplay.
 */
import React, { useMemo, useState } from "react";
import GameBoard from "./Game";
import AppShellNav, { AppShellDestination } from "./AppShellNav";
import { getAllLessons, TutorialLesson } from "../tutorial";
import { getLessonObjectives } from "../tutorial/objectives";
import type { TutorialGameEvent } from "../tutorial/types";
import { getImageByPieceType } from "./PieceImages";
import { AbilityType, PieceType } from "../Constants";
import { useTheme } from "../contexts/ThemeContext";
import castleIcon from "../Assets/Images/misc/wcastle.svg";
import dragonIcon from "../Assets/Images/misc/dragon2.svg";
import flagIcon from "../Assets/Images/misc/flag.svg";
import hexTilesIcon from "../Assets/Images/misc/hex-tiles.svg";
import scrollIcon from "../Assets/Images/misc/scroll.svg";
import swordsIcon from "../Assets/Images/misc/swords-crossed.svg";
import "../css/Board.css";

interface TutorialProps {
  onBack: () => void;
  onOpenGame?: () => void;
  backLabel?: string;
  onOpenLibrary?: () => void;
  onOpenOnlineBrowser?: () => void;
}

const TUTORIAL_PROGRESS_KEY = "castles_tutorial_progress_v2";

interface TutorialProgressState {
  lastLessonId: string;
  completedLessonIds: string[];
  checkedObjectiveIdsByLessonId: Record<string, string[]>;
}

interface StoredTutorialProgress {
  progress: TutorialProgressState;
  canStoreProgress: boolean;
}

interface TutorialModuleDescriptor {
  key: string;
  label: string;
  subtitle: string;
  icon: string;
}

interface PieceLessonShortcut {
  id: string;
  piece: PieceType;
  label: string;
}

interface TerrainLessonShortcut {
  id: string;
  label: string;
  hexClass: string;
}

const TUTORIAL_MODULES: TutorialModuleDescriptor[] = [
  {
    key: "m0_",
    label: "Getting started",
    subtitle: "Win conditions and the first shape of a Castles game.",
    icon: flagIcon,
  },
  {
    key: "m1_",
    label: "Terrain",
    subtitle: "Castles, rivers, high ground, and sanctuaries.",
    icon: hexTilesIcon,
  },
  {
    key: "m2_",
    label: "Pieces",
    subtitle: "Movement, attacks, promotion, and Monarch safety.",
    icon: scrollIcon,
  },
  {
    key: "m3_",
    label: "Combat",
    subtitle: "Strength, defense, ranged attacks, and tactical follow-ups.",
    icon: swordsIcon,
  },
  {
    key: "m4_",
    label: "Castles",
    subtitle: "Castle control, recruitment, and pledging.",
    icon: castleIcon,
  },
  {
    key: "m5_",
    label: "Advanced units",
    subtitle: "Special units, abilities, and a practice position.",
    icon: dragonIcon,
  },
];

const PIECE_LESSONS: PieceLessonShortcut[] = [
  { id: "m2_l2_swordsman", piece: PieceType.Swordsman, label: "Sword" },
  { id: "m2_l4_archer", piece: PieceType.Archer, label: "Archer" },
  { id: "m2_l5_knight", piece: PieceType.Knight, label: "Knight" },
  { id: "m2_l6_eagle", piece: PieceType.Eagle, label: "Eagle" },
  { id: "m2_l7_giant", piece: PieceType.Giant, label: "Giant" },
  { id: "m2_l8_trebuchet", piece: PieceType.Trebuchet, label: "Treb." },
  { id: "m2_l9_assassin", piece: PieceType.Assassin, label: "Assassin" },
  { id: "m2_l10_dragon", piece: PieceType.Dragon, label: "Dragon" },
  { id: "m2_l11_monarch", piece: PieceType.Monarch, label: "Monarch" },
];

const TERRAIN_LESSONS: TerrainLessonShortcut[] = [
  { id: "m1_l1_introduction", label: "Castles", hexClass: "hexagon-white-castle" },
  { id: "m1_l2_terrain_rivers", label: "Rivers", hexClass: "hexagon-river" },
  { id: "m1_l3_terrain_highground", label: "High Ground", hexClass: "hexagon-light hexagon-high-ground" },
  { id: "m1_l4_terrain_sanctuaries", label: "Sanctuaries", hexClass: "hexagon-sanctuary hexagon-sanctuary-phoenix" },
];

function createDefaultTutorialProgress(lessons: TutorialLesson[]): TutorialProgressState {
  return {
    lastLessonId: lessons[0]?.id ?? "",
    completedLessonIds: [],
    checkedObjectiveIdsByLessonId: {},
  };
}

function orderLessonIds(ids: Iterable<string>, lessons: TutorialLesson[]): string[] {
  const idSet = new Set(ids);
  return lessons.filter((lesson) => idSet.has(lesson.id)).map((lesson) => lesson.id);
}

function sanitizeTutorialProgress(raw: unknown, lessons: TutorialLesson[]): TutorialProgressState {
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
    completedLessonIds: orderLessonIds(completed, lessons),
    checkedObjectiveIdsByLessonId,
  };
}

function readStoredTutorialProgress(lessons: TutorialLesson[]): StoredTutorialProgress {
  try {
    const stored = localStorage.getItem(TUTORIAL_PROGRESS_KEY);
    if (!stored) {
      return { progress: createDefaultTutorialProgress(lessons), canStoreProgress: true };
    }
    return { progress: sanitizeTutorialProgress(JSON.parse(stored), lessons), canStoreProgress: true };
  } catch (error) {
    console.error("Failed to load tutorial progress", error);
    return { progress: createDefaultTutorialProgress(lessons), canStoreProgress: false };
  }
}

function saveStoredTutorialProgress(progress: TutorialProgressState): boolean {
  try {
    localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch (error) {
    console.error("Failed to save tutorial progress", error);
    return false;
  }
}

function getLessonModuleLabel(lessonId: string): string {
  if (lessonId.startsWith("m0_")) return "Getting started";
  if (lessonId.startsWith("m1_")) return "Terrain";
  if (lessonId.startsWith("m2_")) return "Pieces";
  if (lessonId.startsWith("m3_")) return "Combat";
  if (lessonId.startsWith("m4_")) return "Castles";
  if (lessonId.startsWith("m5_")) return "Advanced units";
  return "Course";
}

function getLessonCardSummary(lesson: TutorialLesson): string {
  if (typeof lesson.description === "string") {
    return lesson.description;
  }
  return getLessonObjectives(lesson)[0]?.text ?? "Interactive lesson";
}

function getRequiredInspectionKeys(lesson: TutorialLesson, objectiveText: string): string[] {
  const lower = objectiveText.toLowerCase();
  if (lower.includes("non-swordsman") && lower.includes("across the river")) {
    return lesson.pieces
      .filter((piece) =>
        piece.type !== PieceType.Swordsman &&
        ((piece.color === "w" && piece.hex.r < 0) || (piece.color === "b" && piece.hex.r > 0))
      )
      .map((piece) => piece.hex.getKey());
  }
  if (lower.includes("both castles") || lower.includes("each castle") || lower.includes("every castle")) {
    return lesson.board.castles.map((castle) => castle.hex.getKey());
  }
  if (lower.includes("sanctuary")) {
    return (lesson.sanctuaries ?? []).map((sanctuary) => sanctuary.hex.getKey());
  }
  if (lower.includes("each special unit") || lower.includes("each unit") || lower.includes("every unit")) {
    return lesson.pieces.map((piece) => piece.hex.getKey());
  }
  return [];
}

function eventReachedPhase(event: TutorialGameEvent, targetPhase: "Attack" | "Recruitment"): boolean {
  return event.resultPhase === targetPhase || event.phase === targetPhase;
}

function objectiveMatchesTutorialEvent(
  lesson: TutorialLesson,
  objectiveText: string,
  event: TutorialGameEvent,
  inspectedKeys: Set<string>
): boolean {
  const lower = objectiveText.toLowerCase();

  if (/\bfind\b/.test(lower)) {
    return false;
  }

  if (lower.includes("reach the attack phase") || lower.includes("reach attack phase")) {
    return eventReachedPhase(event, "Attack");
  }

  if (
    lower.includes("reach the castles phase") ||
    lower.includes("reach castles phase")
  ) {
    return eventReachedPhase(event, "Recruitment");
  }

  if (lower.includes("pass after attack") || lower.includes("pass during attack")) {
    return event.type === "pass" && event.phase === "Attack";
  }

  if (lower.includes("right-click") || lower.includes("right click") || lower.includes("inspect")) {
    if (event.type !== "inspect") return false;
    if (lower.includes("castle") && event.targetKind !== "castle") return false;
    if (lower.includes("sanctuary") && event.targetKind !== "sanctuary") return false;
    if ((lower.includes("unit") || lower.includes("piece")) && event.targetKind !== "piece") return false;
    const requiredKeys = getRequiredInspectionKeys(lesson, objectiveText);
    return requiredKeys.length === 0 || requiredKeys.every((key) => inspectedKeys.has(key));
  }

  if (lower.includes("recruit")) return event.type === "recruitment";
  if (lower.includes("promot")) return event.type === "promotion";
  if (lower.includes("pledge")) return event.type === "pledge";
  if (lower.includes("fireball")) {
    return event.type === "ability" && event.abilityType === AbilityType.Fireball && event.pieceRemoved === true;
  }
  if (lower.includes("raise dead")) {
    return event.type === "ability" && event.abilityType === AbilityType.RaiseDead && event.pieceAdded === true;
  }
  if (lower.includes("teleport")) {
    return event.type === "ability" && event.abilityType === AbilityType.Teleport;
  }
  if (lower.includes("ability")) {
    return event.type === "ability" && event.abilityType !== undefined;
  }
  if (lower.includes("capture") || lower.includes("overpower") || lower.includes("defeat") || lower.includes("kill")) {
    return event.type === "capture";
  }
  if (lower.includes("attack")) {
    return event.type === "attack" || event.type === "capture";
  }
  if (lower.includes("move") || lower.includes("slide") || lower.includes("fly") || lower.includes("jump")) {
    return event.type === "move";
  }

  return false;
}

function isLessonComplete(lesson: TutorialLesson, progress: TutorialProgressState): boolean {
  const objectives = getLessonObjectives(lesson);
  if (objectives.length === 0) {
    return progress.completedLessonIds.includes(lesson.id);
  }
  const checkedIds = new Set(progress.checkedObjectiveIdsByLessonId[lesson.id] ?? []);
  return objectives.every((objective) => checkedIds.has(objective.id));
}

function completeLessonInProgress(
  progress: TutorialProgressState,
  targetLesson: TutorialLesson,
  lessons: TutorialLesson[]
): TutorialProgressState {
  const checkedObjectiveIdsByLessonId = { ...progress.checkedObjectiveIdsByLessonId };
  const completedLessonIds = new Set(progress.completedLessonIds);
  const objectives = getLessonObjectives(targetLesson);
  if (objectives.length > 0) {
    checkedObjectiveIdsByLessonId[targetLesson.id] = objectives.map((objective) => objective.id);
  } else {
    delete checkedObjectiveIdsByLessonId[targetLesson.id];
  }
  completedLessonIds.add(targetLesson.id);

  return {
    ...progress,
    checkedObjectiveIdsByLessonId,
    completedLessonIds: orderLessonIds(completedLessonIds, lessons),
  };
}

function completeObjectiveIdsInProgress(
  progress: TutorialProgressState,
  targetLesson: TutorialLesson,
  objectiveIds: string[],
  lessons: TutorialLesson[]
): TutorialProgressState {
  const objectives = getLessonObjectives(targetLesson);
  if (objectives.length === 0 || objectiveIds.length === 0) {
    return progress;
  }

  const objectiveIdSet = new Set(objectives.map((objective) => objective.id));
  const checked = new Set(
    (progress.checkedObjectiveIdsByLessonId[targetLesson.id] ?? []).filter((objectiveId) =>
      objectiveIdSet.has(objectiveId)
    )
  );
  for (const objectiveId of objectiveIds) {
    if (objectiveIdSet.has(objectiveId)) {
      checked.add(objectiveId);
    }
  }

  const checkedObjectiveIdsByLessonId = { ...progress.checkedObjectiveIdsByLessonId };
  const orderedCheckedIds = objectives.map((objective) => objective.id).filter((objectiveId) => checked.has(objectiveId));
  checkedObjectiveIdsByLessonId[targetLesson.id] = orderedCheckedIds;

  const completedLessonIds = new Set(progress.completedLessonIds);
  if (objectives.every((objective) => checked.has(objective.id))) {
    completedLessonIds.add(targetLesson.id);
  }

  return {
    ...progress,
    checkedObjectiveIdsByLessonId,
    completedLessonIds: orderLessonIds(completedLessonIds, lessons),
  };
}

const Tutorial: React.FC<TutorialProps> = ({
  onBack,
  onOpenGame,
  backLabel = "Back to game",
  onOpenLibrary,
  onOpenOnlineBrowser,
}) => {
  const { isDark } = useTheme();
  const lessons = useMemo(() => getAllLessons(), []);
  const initialProgress = useMemo(() => readStoredTutorialProgress(lessons), [lessons]);
  const [viewMode, setViewMode] = useState<"course" | "lesson">("course");
  const [tutorialProgress, setTutorialProgress] = useState<TutorialProgressState>(initialProgress.progress);
  const [inspectedKeysByLessonId, setInspectedKeysByLessonId] = useState<Record<string, string[]>>({});
  const [canStoreProgress, setCanStoreProgress] = useState(initialProgress.canStoreProgress);
  const courseHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const lessonHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const focusAfterViewChangeRef = React.useRef(false);
  const currentLessonIndex = Math.max(
    0,
    lessons.findIndex((candidate) => candidate.id === tutorialProgress.lastLessonId)
  );
  const lesson: TutorialLesson = lessons[currentLessonIndex];
  const lessonObjectives = getLessonObjectives(lesson);
  const checkedObjectiveIds = new Set(
    (tutorialProgress.checkedObjectiveIdsByLessonId[lesson.id] ?? []).filter((objectiveId) =>
      lessonObjectives.some((objective) => objective.id === objectiveId)
    )
  );
  const completedLessonIds = new Set(lessons.filter((candidate) => isLessonComplete(candidate, tutorialProgress)).map((candidate) => candidate.id));
  const isCurrentLessonComplete = completedLessonIds.has(lesson.id);
  const completedLessonCount = completedLessonIds.size;
  const nextIncompleteLessonIndex = lessons.findIndex((candidate) => !completedLessonIds.has(candidate.id));
  const allLessonsComplete = lessons.length > 0 && completedLessonCount === lessons.length;
  const courseActionLessonIndex = allLessonsComplete
    ? 0
    : isCurrentLessonComplete && nextIncompleteLessonIndex >= 0
      ? nextIncompleteLessonIndex
      : currentLessonIndex;
  const hasStartedCourse = currentLessonIndex > 0 || completedLessonCount > 0;
  const coursePrimaryActionLabel = allLessonsComplete
    ? "Review Tutorial"
    : hasStartedCourse
      ? "Continue Tutorial"
      : "Start Tutorial";
  const courseHeroActionLabel = allLessonsComplete ? "Review" : hasStartedCourse ? "Continue" : "Start";
  const courseProgressPercent = lessons.length > 0
    ? Math.round((completedLessonCount / lessons.length) * 100)
    : 0;
  const objectiveProgressLabel = lessonObjectives.length > 0
    ? `${checkedObjectiveIds.size} / ${lessonObjectives.length} goals completed`
    : isCurrentLessonComplete
      ? "Completed"
      : "Ready to continue";
  const getCheckedObjectiveCount = (targetLesson: TutorialLesson) => {
    const targetObjectives = getLessonObjectives(targetLesson);
    const targetCheckedIds = new Set(tutorialProgress.checkedObjectiveIdsByLessonId[targetLesson.id] ?? []);
    return targetObjectives.filter((objective) => targetCheckedIds.has(objective.id)).length;
  };

  const getLessonObjectiveProgressLabel = (targetLesson: TutorialLesson) => {
    const targetObjectives = getLessonObjectives(targetLesson);
    if (targetObjectives.length === 0) {
      return completedLessonIds.has(targetLesson.id) ? "Completed" : "Ready to continue";
    }
    return `${getCheckedObjectiveCount(targetLesson)} / ${targetObjectives.length} goals completed`;
  };

  const renderLessonVisual = (targetLesson: TutorialLesson, moduleIcon: string, className = "tutorial-course-card-visual") => {
    const pieceLesson = PIECE_LESSONS.find((candidate) => candidate.id === targetLesson.id);
    const terrainLesson = TERRAIN_LESSONS.find((candidate) => candidate.id === targetLesson.id);

    if (pieceLesson) {
      return (
        <span className={className} aria-hidden="true">
          <img src={getImageByPieceType(pieceLesson.piece, "w")} alt="" />
        </span>
      );
    }

    if (terrainLesson) {
      return (
        <span className={className} aria-hidden="true">
          <svg viewBox="0 0 110 110" focusable="false">
            <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className={terrainLesson.hexClass} style={{ strokeWidth: 3 }} />
          </svg>
        </span>
      );
    }

    return (
      <span className={className} aria-hidden="true">
        <img src={moduleIcon} alt="" />
      </span>
    );
  };

  React.useEffect(() => {
    setCanStoreProgress(saveStoredTutorialProgress(tutorialProgress));
  }, [tutorialProgress]);

  React.useEffect(() => {
    if (!focusAfterViewChangeRef.current) return;
    focusAfterViewChangeRef.current = false;
    window.requestAnimationFrame(() => {
      const target = viewMode === "course" ? courseHeadingRef.current : lessonHeadingRef.current;
      target?.focus();
    });
  }, [viewMode]);

  const updateProgress = (updater: (progress: TutorialProgressState) => TutorialProgressState) => {
    setTutorialProgress((previous) => sanitizeTutorialProgress(updater(previous), lessons));
  };

  const openLessonAtIndex = (lessonIndex: number) => {
    const nextLesson = lessons[lessonIndex];
    if (!nextLesson) return;
    focusAfterViewChangeRef.current = true;
    updateProgress((previous) => ({
      ...previous,
      lastLessonId: nextLesson.id,
    }));
    setViewMode("lesson");
  };

  const openCourseOverview = () => {
    focusAfterViewChangeRef.current = true;
    setViewMode("course");
  };

  const goToNextLesson = () => {
    const nextLesson = lessons[currentLessonIndex + 1];
    if (!nextLesson) return;
    focusAfterViewChangeRef.current = true;
    updateProgress((previous) => {
      const withCurrentComplete = lessonObjectives.length === 0
        ? completeLessonInProgress(previous, lesson, lessons)
        : previous;
      return {
        ...withCurrentComplete,
        lastLessonId: nextLesson.id,
      };
    });
    setViewMode("lesson");
  };

  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) {
      openLessonAtIndex(currentLessonIndex - 1);
    }
  };

  const restartTutorial = () => {
    setTutorialProgress(createDefaultTutorialProgress(lessons));
    openCourseOverview();
  };

  const jumpToLesson = (lessonId: string) => {
    const idx = lessons.findIndex((candidate) => candidate.id === lessonId);
    if (idx !== -1) openLessonAtIndex(idx);
  };

  const toggleObjective = (objectiveId: string) => {
    updateProgress((previous) => {
      const checkedObjectiveIdsByLessonId = { ...previous.checkedObjectiveIdsByLessonId };
      const completedLessonIds = new Set(previous.completedLessonIds);
      const checked = new Set(checkedObjectiveIdsByLessonId[lesson.id] ?? []);
      if (checked.has(objectiveId)) {
        checked.delete(objectiveId);
      } else {
        checked.add(objectiveId);
      }
      const nextChecked = lessonObjectives
        .map((objective) => objective.id)
        .filter((id) => checked.has(id));
      if (nextChecked.length > 0) {
        checkedObjectiveIdsByLessonId[lesson.id] = nextChecked;
      } else {
        delete checkedObjectiveIdsByLessonId[lesson.id];
      }
      if (lessonObjectives.every((objective) => checked.has(objective.id))) {
        completedLessonIds.add(lesson.id);
      } else {
        completedLessonIds.delete(lesson.id);
      }

      return {
        ...previous,
        completedLessonIds: orderLessonIds(completedLessonIds, lessons),
        checkedObjectiveIdsByLessonId,
      };
    });
  };

  const markLessonComplete = () => {
    updateProgress((previous) => completeLessonInProgress(previous, lesson, lessons));
  };

  const handleTutorialEvent = React.useCallback((event: TutorialGameEvent) => {
    const nextInspectedKeys = new Set(inspectedKeysByLessonId[lesson.id] ?? []);
    if (event.type === "inspect" && event.hexKey) {
      nextInspectedKeys.add(event.hexKey);
      setInspectedKeysByLessonId((previous) => ({
        ...previous,
        [lesson.id]: Array.from(nextInspectedKeys),
      }));
    }

    const matchingObjectiveIds = lessonObjectives
      .filter((objective) => objectiveMatchesTutorialEvent(lesson, objective.text, event, nextInspectedKeys))
      .map((objective) => objective.id)
      .filter((objectiveId) => !checkedObjectiveIds.has(objectiveId));

    if (matchingObjectiveIds.length > 0) {
      updateProgress((previous) =>
        completeObjectiveIdsInProgress(previous, lesson, matchingObjectiveIds, lessons)
      );
    }
  }, [checkedObjectiveIds, inspectedKeysByLessonId, lesson, lessonObjectives, lessons]);

  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame ?? onBack },
    { id: "learn", label: "Tutorial" },
    ...(onOpenOnlineBrowser ? [{ id: "online" as const, label: "Online", onClick: onOpenOnlineBrowser }] : []),
    ...(onOpenLibrary ? [{ id: "library" as const, label: "Library", onClick: onOpenLibrary }] : []),
  ];
  const lessonProgressLabel = `Lesson ${currentLessonIndex + 1} of ${lessons.length}`;
  const lessonModuleLabel = getLessonModuleLabel(lesson.id);
  const progressStorageLabel = canStoreProgress ? "Progress saved" : "Session only";
  const courseModules = TUTORIAL_MODULES.map((module) => ({
    ...module,
    lessons: lessons
      .map((moduleLesson, index) => ({ lesson: moduleLesson, index }))
      .filter(({ lesson: moduleLesson }) => moduleLesson.id.startsWith(module.key)),
  })).filter((module) => module.lessons.length > 0);
  const courseActionLesson = lessons[courseActionLessonIndex] ?? lesson;
  const courseActionModule = courseModules.find((module) => courseActionLesson.id.startsWith(module.key)) ?? courseModules[0];
  const courseActionIsCurrentLesson = courseActionLesson.id === lesson.id;
  const courseActionLabel = allLessonsComplete
    ? "Review this lesson"
    : !hasStartedCourse
      ? "Start this lesson"
      : courseActionIsCurrentLesson
      ? "Continue this lesson"
      : "Open next lesson";
  const courseActionStatusLabel = allLessonsComplete
    ? "Review"
    : !hasStartedCourse
      ? "First lesson"
      : courseActionIsCurrentLesson
      ? "Current lesson"
        : "Next to complete";
  const shellNav = (
    <AppShellNav
      ariaLabel="Tutorial navigation"
      activeDestination="learn"
      title="Tutorial"
      kicker={viewMode === "course" ? "Overview" : "Lesson"}
      description={viewMode === "course" ? "Castle basics, terrain, pieces, combat, and advanced units." : "Interactive lesson board."}
      backLabel={backLabel}
      onBack={onBack}
      destinations={navDestinations}
    />
  );

  if (viewMode === "course") {
    return (
      <div className="tutorial-container tutorial-container-course">
        <aside className="tutorial-sidebar tutorial-course-sidebar">
          {shellNav}

          <div className="tutorial-course-progress-card">
            <div className="tutorial-course-progress-heading">
              <span>Tutorial progress</span>
              <strong>{courseProgressPercent}%</strong>
            </div>
            <div className="tutorial-course-progress-track" aria-hidden="true">
              <span style={{ width: `${courseProgressPercent}%` }} />
            </div>
            <div className="tutorial-course-progress-meta" role="status" aria-label="Tutorial progress" aria-live="polite">
              {completedLessonCount} / {lessons.length} lessons completed
            </div>
            <div className="tutorial-course-actions">
              <button type="button" className="tutorial-course-primary-action" onClick={() => openLessonAtIndex(courseActionLessonIndex)}>
                {coursePrimaryActionLabel}
              </button>
              <button type="button" className="tutorial-reset-button" onClick={restartTutorial}>
                Reset progress
              </button>
            </div>
            <span className="tutorial-progress-saved-chip">{progressStorageLabel}</span>
          </div>

          <nav className="tutorial-course-section-map" aria-label="Tutorial sections">
            <h2>Tutorial sections</h2>
            {courseModules.map((module) => {
              const moduleCompletedCount = module.lessons.filter(({ lesson: moduleLesson }) => completedLessonIds.has(moduleLesson.id)).length;
              const moduleProgressPercent = Math.round((moduleCompletedCount / module.lessons.length) * 100);
              return (
                <a
                  className="tutorial-course-section-link"
                  href={`#tutorial-module-${module.key}`}
                  key={module.key}
                  aria-label={`${module.label} ${moduleCompletedCount} of ${module.lessons.length} lessons completed`}
                >
                  <span className="tutorial-course-section-label">{module.label}</span>
                  <span className="tutorial-course-section-count">{moduleCompletedCount} / {module.lessons.length}</span>
                  <span className="tutorial-course-section-track" aria-hidden="true">
                    <span style={{ width: `${moduleProgressPercent}%` }} />
                  </span>
                </a>
              );
            })}
          </nav>
        </aside>

        <main className="tutorial-course-main" aria-label="Castles tutorial">
          <div className="tutorial-course-hero">
            <div>
              <p className="tutorial-course-kicker">Guided tutorial</p>
              <h2 ref={courseHeadingRef} tabIndex={-1}>Castles tutorial</h2>
            </div>
            <button type="button" className="tutorial-course-primary-action" onClick={() => openLessonAtIndex(courseActionLessonIndex)}>
              {courseHeroActionLabel}
            </button>
          </div>

          <section className="tutorial-course-current-panel" aria-labelledby="tutorial-course-current-heading">
            {renderLessonVisual(courseActionLesson, courseActionModule?.icon ?? scrollIcon, "tutorial-course-current-visual")}
            <div className="tutorial-course-current-copy">
              <div className="tutorial-course-current-meta">
                <span>{courseActionStatusLabel}</span>
                <span>{getLessonModuleLabel(courseActionLesson.id)}</span>
              </div>
              <h3 id="tutorial-course-current-heading">{courseActionLesson.title}</h3>
              <p>{getLessonCardSummary(courseActionLesson)}</p>
              <span className="tutorial-course-current-progress">{getLessonObjectiveProgressLabel(courseActionLesson)}</span>
            </div>
            <button type="button" className="tutorial-course-primary-action" onClick={() => openLessonAtIndex(courseActionLessonIndex)}>
              {courseActionLabel}
            </button>
          </section>

          <div className="tutorial-course-modules">
            {courseModules.map((module) => {
              const moduleCompletedCount = module.lessons.filter(({ lesson: moduleLesson }) => completedLessonIds.has(moduleLesson.id)).length;
              const moduleProgressPercent = Math.round((moduleCompletedCount / module.lessons.length) * 100);
              return (
                <section className="tutorial-course-module" key={module.key} aria-labelledby={`tutorial-module-${module.key}`}>
                  <div className="tutorial-course-module-heading">
                    <img src={module.icon} alt="" aria-hidden="true" />
                    <div>
                      <h3 id={`tutorial-module-${module.key}`}>{module.label}</h3>
                      <p>{module.subtitle}</p>
                      <div className="tutorial-course-module-progress" aria-hidden="true">
                        <span style={{ width: `${moduleProgressPercent}%` }} />
                      </div>
                    </div>
                    <span>{moduleCompletedCount} / {module.lessons.length}</span>
                  </div>
                  <div className="tutorial-course-grid">
                    {module.lessons.map(({ lesson: moduleLesson, index }) => {
                      const isComplete = completedLessonIds.has(moduleLesson.id);
                      const isCurrent = moduleLesson.id === lesson.id;
                      const objectiveCount = getLessonObjectives(moduleLesson).length;
                      const completedStatusLabel = objectiveCount > 0 ? "Goals complete" : "Lesson complete";
                      const cardStatusLabel = isComplete ? completedStatusLabel : isCurrent ? "Current lesson" : "Not complete";
                      return (
                        <button
                          key={moduleLesson.id}
                          type="button"
                          className={`tutorial-course-card ${isComplete ? "reviewed" : ""} ${isCurrent ? "current" : ""}`}
                          onClick={() => openLessonAtIndex(index)}
                          aria-label={`Open ${moduleLesson.title}. ${cardStatusLabel}${objectiveCount > 0 ? `, ${getLessonObjectiveProgressLabel(moduleLesson)}` : ""}`}
                          aria-current={isCurrent ? "step" : undefined}
                        >
                          {renderLessonVisual(moduleLesson, module.icon)}
                          <span className="tutorial-course-card-content">
                            <span className="tutorial-course-card-title">{moduleLesson.title}</span>
                            <span className="tutorial-course-card-summary">{getLessonCardSummary(moduleLesson)}</span>
                            <span className="tutorial-course-card-meta">{getLessonObjectiveProgressLabel(moduleLesson)}</span>
                          </span>
                          <span className={`tutorial-course-card-status ${isComplete ? "reviewed" : isCurrent ? "current" : ""}`}>
                            {isComplete ? "Complete" : isCurrent ? "Current" : "Open"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="tutorial-container">
      <div className="tutorial-sidebar">
        {shellNav}

        <div className="tutorial-lesson-header" role="group" aria-label="Current lesson">
          <h2 className="tutorial-title" ref={lessonHeadingRef} tabIndex={-1}>{lesson.title}</h2>
          <div className="tutorial-lesson-meta" aria-label="Lesson position">
            <span className="tutorial-module-chip">{lessonModuleLabel}</span>
            <span className="tutorial-lesson-progress-summary">{lessonProgressLabel}</span>
            <span className="tutorial-progress-saved-chip">{progressStorageLabel}</span>
          </div>
        </div>

        <div className="tutorial-progress-controls" role="group" aria-label="Lesson progress controls">
          <span
            className="tutorial-progress"
            data-display="screen-reader"
            role="status"
            aria-label="Tutorial progress"
            aria-live="polite"
          >
            {currentLessonIndex + 1} / {lessons.length}
          </span>
          <div className="tutorial-control-strip" role="toolbar" aria-label="Lesson controls">
            <button type="button" onClick={openCourseOverview} className="tutorial-step-button">
              Tutorial overview
            </button>
            <button onClick={goToPrevLesson} disabled={currentLessonIndex === 0} className="tutorial-step-button">
              Previous
            </button>
            <button
              type="button"
              onClick={restartTutorial}
              className="tutorial-reset-button"
              aria-label="Restart Tutorial"
            >
              <span className="tutorial-reset-full">Restart Tutorial</span>
              <span className="tutorial-reset-short" aria-hidden="true">Restart</span>
            </button>
            <button onClick={goToNextLesson} disabled={currentLessonIndex === lessons.length - 1} className="tutorial-step-button">
              Next
            </button>
          </div>
        </div>

        {lesson.id.startsWith("m2_l") && (
          <div className="tutorial-quick-nav" role="group" aria-label="Piece lessons">
            {PIECE_LESSONS.map(({ id, piece, label }) => {
              const isActive = lesson.id === id;
              return (
                <button key={id} onClick={() => jumpToLesson(id)} title={label} aria-label={label} className={`tutorial-nav-btn ${isActive ? "active" : ""}`}>
                  <img src={getImageByPieceType(piece, "w")} alt="" className="tutorial-quick-nav-icon" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {lesson.id.startsWith("m1_l") && (
          <div className="tutorial-quick-nav" role="group" aria-label="Terrain lessons">
            {TERRAIN_LESSONS.map(({ id, label, hexClass }) => {
              const isActive = lesson.id === id;
              return (
                <button key={id} onClick={() => jumpToLesson(id)} title={label} aria-label={label} className={`tutorial-nav-btn ${isActive ? "active" : ""}`}>
                  <svg viewBox="0 0 110 110" className="tutorial-quick-nav-icon" aria-hidden="true">
                    <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className={hexClass} style={{ strokeWidth: 3 }} />
                  </svg>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="tutorial-description">{lesson.description}</div>

        {lesson.instructions && (
          <div className={`tutorial-callout ${isDark ? "dark" : "light"}`}>
            {lesson.instructions}
          </div>
        )}

        {lessonObjectives.length > 0 && (
          <div className={`tutorial-list-section tutorial-objectives ${isDark ? "dark" : "light"}`} role="group" aria-label="Lesson goals">
            <h3>Lesson goals</h3>
            <p className="tutorial-objective-progress">{objectiveProgressLabel}</p>
            <div className="tutorial-objective-list">
              {lessonObjectives.map((objective) => (
                <label className="tutorial-objective-item" key={objective.id}>
                  <input
                    type="checkbox"
                    checked={checkedObjectiveIds.has(objective.id)}
                    onChange={() => toggleObjective(objective.id)}
                  />
                  <span>{objective.text}</span>
                </label>
              ))}
            </div>
            <button type="button" className="tutorial-review-button" onClick={markLessonComplete} disabled={isCurrentLessonComplete}>
              {isCurrentLessonComplete ? "Goals complete" : "Complete manually"}
            </button>
          </div>
        )}

        {lesson.hints && lesson.hints.length > 0 && (
          <div className={`tutorial-list-section ${isDark ? "dark" : "light"}`}>
            <h3>Hints:</h3>
            <ul>
              {lesson.hints.map((hint, i) => <li key={i}>{hint}</li>)}
            </ul>
          </div>
        )}

        <div className="tutorial-lesson-footer-actions" role="group" aria-label="Lesson footer navigation">
          <button type="button" onClick={openCourseOverview} className="tutorial-step-button">
            Tutorial overview
          </button>
          <button onClick={goToNextLesson} disabled={currentLessonIndex === lessons.length - 1} className="tutorial-step-button">
            Next lesson
          </button>
        </div>
      </div>

      <section className="tutorial-board-stage" aria-label="Tutorial lesson board">
        <GameBoard
          key={lesson.id}
          initialBoard={lesson.board}
          initialPieces={lesson.pieces}
          initialLayout={lesson.layout}
          initialTurnCounter={lesson.initialTurnCounter}
          initialSanctuaries={lesson.sanctuaries}
          initialGraveyard={lesson.graveyard}
          initialPhoenixRecords={lesson.phoenixRecords}
          isTutorialMode={true}
          isAnalysisMode={true}
          showNavigationMenu={false}
          showTooltipHint={false}
          onSetup={() => {}}
          onRestart={() => {}}
          onTutorialEvent={handleTutorialEvent}
        />
      </section>
    </div>
  );
};

export default Tutorial;
