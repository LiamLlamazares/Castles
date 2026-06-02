/**
 * @file Tutorial.tsx
 * @description Interactive tutorial component for teaching Castles gameplay.
 */
import React, { useMemo, useState } from "react";
import GameBoard from "./Game";
import AppShellNav, { AppShellDestination } from "./AppShellNav";
import { getAllLessons, TutorialLesson } from "../tutorial";
import { getImageByPieceType } from "./PieceImages";
import { PieceType } from "../Constants";
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
  reviewedLessonIds: string[];
  checkedObjectivesByLessonId: Record<string, number[]>;
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

function createDefaultTutorialProgress(lessons: TutorialLesson[]): TutorialProgressState {
  return {
    lastLessonId: lessons[0]?.id ?? "",
    reviewedLessonIds: [],
    checkedObjectivesByLessonId: {},
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
  const reviewedLessonIds = Array.isArray(record.reviewedLessonIds)
    ? orderLessonIds(record.reviewedLessonIds.filter((id): id is string => typeof id === "string"), lessons)
      .filter((lessonId) => (lessons.find((candidate) => candidate.id === lessonId)?.objectives?.length ?? 0) === 0)
    : [];
  const checkedObjectivesByLessonId: Record<string, number[]> = {};

  if (record.checkedObjectivesByLessonId && typeof record.checkedObjectivesByLessonId === "object") {
    for (const lesson of lessons) {
      const rawObjectiveIndexes = record.checkedObjectivesByLessonId[lesson.id];
      if (!Array.isArray(rawObjectiveIndexes)) continue;
      const objectiveCount = lesson.objectives?.length ?? 0;
      const cleaned = Array.from(new Set(rawObjectiveIndexes))
        .filter((index): index is number => Number.isInteger(index) && index >= 0 && index < objectiveCount)
        .sort((a, b) => a - b);
      if (cleaned.length > 0) {
        checkedObjectivesByLessonId[lesson.id] = cleaned;
      }
    }
  }

  return {
    lastLessonId,
    reviewedLessonIds,
    checkedObjectivesByLessonId,
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
  return lesson.objectives?.[0] ?? "Interactive lesson";
}

function isLessonReviewed(lesson: TutorialLesson, progress: TutorialProgressState): boolean {
  const objectiveCount = lesson.objectives?.length ?? 0;
  if (objectiveCount === 0) {
    return progress.reviewedLessonIds.includes(lesson.id);
  }
  const checkedCount = progress.checkedObjectivesByLessonId[lesson.id]?.length ?? 0;
  return checkedCount === objectiveCount;
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
  const [canStoreProgress, setCanStoreProgress] = useState(initialProgress.canStoreProgress);
  const currentLessonIndex = Math.max(
    0,
    lessons.findIndex((candidate) => candidate.id === tutorialProgress.lastLessonId)
  );
  const lesson: TutorialLesson = lessons[currentLessonIndex];
  const lessonObjectives = lesson.objectives ?? [];
  const checkedObjectiveIndexes = new Set(
    (tutorialProgress.checkedObjectivesByLessonId[lesson.id] ?? []).filter((index) => index < lessonObjectives.length)
  );
  const reviewedLessonIds = new Set(lessons.filter((candidate) => isLessonReviewed(candidate, tutorialProgress)).map((candidate) => candidate.id));
  const isCurrentLessonReviewed = reviewedLessonIds.has(lesson.id);
  const reviewedLessonCount = reviewedLessonIds.size;
  const nextUncheckedLessonIndex = Math.max(
    0,
    lessons.findIndex((candidate) => !reviewedLessonIds.has(candidate.id))
  );
  const courseActionLessonIndex = isCurrentLessonReviewed ? nextUncheckedLessonIndex : currentLessonIndex;
  const hasStartedCourse = currentLessonIndex > 0 || reviewedLessonCount > 0;
  const coursePrimaryActionLabel = hasStartedCourse ? "Continue course" : "Start course";
  const courseHeroActionLabel = hasStartedCourse ? "Continue" : "Start";
  const courseProgressPercent = lessons.length > 0
    ? Math.round((reviewedLessonCount / lessons.length) * 100)
    : 0;

  React.useEffect(() => {
    setCanStoreProgress(saveStoredTutorialProgress(tutorialProgress));
  }, [tutorialProgress]);

  const PIECE_LESSONS = [
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

  const TERRAIN_LESSONS = [
    { id: "m1_l1_introduction", label: "Castles", hexClass: "hexagon-white-castle" },
    { id: "m1_l2_terrain_rivers", label: "Rivers", hexClass: "hexagon-river" },
    { id: "m1_l3_terrain_highground", label: "High Ground", hexClass: "hexagon-light hexagon-high-ground" },
    { id: "m1_l4_terrain_sanctuaries", label: "Sanctuaries", hexClass: "hexagon-sanctuary hexagon-sanctuary-phoenix" },
  ];

  const updateProgress = (updater: (progress: TutorialProgressState) => TutorialProgressState) => {
    setTutorialProgress((previous) => sanitizeTutorialProgress(updater(previous), lessons));
  };

  const openLessonAtIndex = (lessonIndex: number) => {
    const nextLesson = lessons[lessonIndex];
    if (!nextLesson) return;
    updateProgress((previous) => ({
      ...previous,
      lastLessonId: nextLesson.id,
    }));
    setViewMode("lesson");
  };

  const goToNextLesson = () => {
    if (currentLessonIndex < lessons.length - 1) {
      openLessonAtIndex(currentLessonIndex + 1);
    }
  };

  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) {
      openLessonAtIndex(currentLessonIndex - 1);
    }
  };

  const restartTutorial = () => {
    setTutorialProgress(createDefaultTutorialProgress(lessons));
    setViewMode("course");
  };

  const jumpToLesson = (lessonId: string) => {
    const idx = lessons.findIndex((candidate) => candidate.id === lessonId);
    if (idx !== -1) openLessonAtIndex(idx);
  };

  const toggleObjective = (objectiveIndex: number) => {
    updateProgress((previous) => {
      const checkedObjectivesByLessonId = { ...previous.checkedObjectivesByLessonId };
      const checked = new Set(checkedObjectivesByLessonId[lesson.id] ?? []);
      if (checked.has(objectiveIndex)) {
        checked.delete(objectiveIndex);
      } else {
        checked.add(objectiveIndex);
      }
      const nextChecked = Array.from(checked).sort((a, b) => a - b);
      if (nextChecked.length > 0) {
        checkedObjectivesByLessonId[lesson.id] = nextChecked;
      } else {
        delete checkedObjectivesByLessonId[lesson.id];
      }

      return {
        ...previous,
        checkedObjectivesByLessonId,
      };
    });
  };

  const markLessonReviewed = () => {
    updateProgress((previous) => {
      const checkedObjectivesByLessonId = { ...previous.checkedObjectivesByLessonId };
      const reviewed = new Set(previous.reviewedLessonIds);
      if (lessonObjectives.length > 0) {
        checkedObjectivesByLessonId[lesson.id] = lessonObjectives.map((_, index) => index);
        reviewed.delete(lesson.id);
      } else {
        delete checkedObjectivesByLessonId[lesson.id];
        reviewed.add(lesson.id);
      }

      return {
        ...previous,
        checkedObjectivesByLessonId,
        reviewedLessonIds: orderLessonIds(reviewed, lessons),
      };
    });
  };

  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame ?? onBack },
    { id: "learn", label: "Learn" },
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
  const shellNav = (
    <AppShellNav
      ariaLabel="Learn navigation"
      activeDestination="learn"
      title="Learn"
      kicker={viewMode === "course" ? "Course" : "Tutorial"}
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
              <span>Checklist progress</span>
              <strong>{courseProgressPercent}%</strong>
            </div>
            <div className="tutorial-course-progress-track" aria-hidden="true">
              <span style={{ width: `${courseProgressPercent}%` }} />
            </div>
            <div className="tutorial-course-progress-meta" role="status" aria-label="Course progress" aria-live="polite">
              {reviewedLessonCount} / {lessons.length} lessons checked
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
        </aside>

        <main className="tutorial-course-main" aria-label="Learn Castles course">
          <div className="tutorial-course-hero">
            <div>
              <p className="tutorial-course-kicker">Learn by playing</p>
              <h2>Castles course</h2>
            </div>
            <button type="button" className="tutorial-course-primary-action" onClick={() => openLessonAtIndex(courseActionLessonIndex)}>
              {courseHeroActionLabel}
            </button>
          </div>

          <div className="tutorial-course-modules">
            {courseModules.map((module) => {
              const moduleReviewedCount = module.lessons.filter(({ lesson: moduleLesson }) => reviewedLessonIds.has(moduleLesson.id)).length;
              return (
                <section className="tutorial-course-module" key={module.key} aria-labelledby={`tutorial-module-${module.key}`}>
                  <div className="tutorial-course-module-heading">
                    <img src={module.icon} alt="" aria-hidden="true" />
                    <div>
                      <h3 id={`tutorial-module-${module.key}`}>{module.label}</h3>
                      <p>{module.subtitle}</p>
                    </div>
                    <span>{moduleReviewedCount} / {module.lessons.length}</span>
                  </div>
                  <div className="tutorial-course-grid">
                    {module.lessons.map(({ lesson: moduleLesson, index }) => {
                      const isReviewed = reviewedLessonIds.has(moduleLesson.id);
                      const isCurrent = moduleLesson.id === lesson.id;
                      const objectiveCount = moduleLesson.objectives?.length ?? 0;
                      const cardStatusLabel = isReviewed ? "Checklist checked" : isCurrent ? "Current lesson" : "Not checked";
                      return (
                        <button
                          key={moduleLesson.id}
                          type="button"
                          className={`tutorial-course-card ${isReviewed ? "reviewed" : ""} ${isCurrent ? "current" : ""}`}
                          onClick={() => openLessonAtIndex(index)}
                          aria-label={`Open ${moduleLesson.title}. ${cardStatusLabel}${objectiveCount > 0 ? `, ${objectiveCount} objectives` : ""}`}
                          aria-current={isCurrent ? "step" : undefined}
                        >
                          <img src={module.icon} alt="" aria-hidden="true" />
                          <span className="tutorial-course-card-content">
                            <span className="tutorial-course-card-title">{moduleLesson.title}</span>
                            <span className="tutorial-course-card-summary">{getLessonCardSummary(moduleLesson)}</span>
                            {objectiveCount > 0 && (
                              <span className="tutorial-course-card-meta">{objectiveCount} objectives</span>
                            )}
                          </span>
                          <span className={`tutorial-course-card-status ${isReviewed ? "reviewed" : isCurrent ? "current" : ""}`}>
                            {isReviewed ? "Checked" : isCurrent ? "Current" : "Open"}
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
          <h2 className="tutorial-title">{lesson.title}</h2>
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
            <button type="button" onClick={() => setViewMode("course")} className="tutorial-step-button">
              Course
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

        {lessonObjectives.length > 0 ? (
          <div className={`tutorial-list-section tutorial-objectives ${isDark ? "dark" : "light"}`} role="group" aria-label="Lesson objectives">
            <h3>Review checklist:</h3>
            <div className="tutorial-objective-list">
              {lessonObjectives.map((obj, i) => (
                <label className="tutorial-objective-item" key={i}>
                  <input
                    type="checkbox"
                    checked={checkedObjectiveIndexes.has(i)}
                    onChange={() => toggleObjective(i)}
                  />
                  <span>{obj}</span>
                </label>
              ))}
            </div>
            <button type="button" className="tutorial-review-button" onClick={markLessonReviewed} disabled={isCurrentLessonReviewed}>
              {isCurrentLessonReviewed ? "Checklist checked" : "Mark checklist checked"}
            </button>
          </div>
        ) : (
          <div className={`tutorial-list-section tutorial-objectives ${isDark ? "dark" : "light"}`} role="group" aria-label="Lesson objectives">
            <h3>Review checklist:</h3>
            <p className="tutorial-objective-placeholder">Read the position, inspect the board, and continue when it makes sense.</p>
            <button type="button" className="tutorial-review-button" onClick={markLessonReviewed} disabled={isCurrentLessonReviewed}>
              {isCurrentLessonReviewed ? "Checklist checked" : "Mark checked"}
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
        />
      </section>
    </div>
  );
};

export default Tutorial;
