/**
 * @file Tutorial.tsx
 * @description Interactive tutorial component for teaching Castles gameplay.
 */
import React, { useState, useMemo } from 'react';
import GameBoard from './Game';
import AppShellNav, { AppShellDestination } from './AppShellNav';
import { getAllLessons, TutorialLesson } from '../tutorial';
import { getImageByPieceType } from './PieceImages';
import { PieceType } from '../Constants';
import { useTheme } from '../contexts/ThemeContext';
import '../css/Board.css';

interface TutorialProps {
  onBack: () => void;
  onOpenGame?: () => void;
  backLabel?: string;
  onOpenLibrary?: () => void;
  onOpenOnlineBrowser?: () => void;
}

const TUTORIAL_PROGRESS_KEY = "castles_tutorial_lesson_index";

function readStoredLessonIndex(lessonCount: number): number {
  try {
    const stored = Number(localStorage.getItem(TUTORIAL_PROGRESS_KEY));
    if (!Number.isInteger(stored) || stored < 0 || stored >= lessonCount) {
      return 0;
    }
    return stored;
  } catch (error) {
    console.error("Failed to load tutorial progress", error);
    return 0;
  }
}

function saveStoredLessonIndex(lessonIndex: number): void {
  try {
    localStorage.setItem(TUTORIAL_PROGRESS_KEY, String(lessonIndex));
  } catch (error) {
    console.error("Failed to save tutorial progress", error);
  }
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
  const [currentLessonIndex, setCurrentLessonIndex] = useState(() => readStoredLessonIndex(lessons.length));
  const lesson: TutorialLesson = lessons[currentLessonIndex];

  React.useEffect(() => {
    saveStoredLessonIndex(currentLessonIndex);
  }, [currentLessonIndex]);

  const PIECE_LESSONS = [
    { id: 'm2_l2_swordsman', piece: PieceType.Swordsman, label: 'Sword' },
    { id: 'm2_l4_archer', piece: PieceType.Archer, label: 'Archer' },
    { id: 'm2_l5_knight', piece: PieceType.Knight, label: 'Knight' },
    { id: 'm2_l6_eagle', piece: PieceType.Eagle, label: 'Eagle' },
    { id: 'm2_l7_giant', piece: PieceType.Giant, label: 'Giant' },
    { id: 'm2_l8_trebuchet', piece: PieceType.Trebuchet, label: 'Treb.' },
    { id: 'm2_l9_assassin', piece: PieceType.Assassin, label: 'Assassin' },
    { id: 'm2_l10_dragon', piece: PieceType.Dragon, label: 'Dragon' },
    { id: 'm2_l11_monarch', piece: PieceType.Monarch, label: 'Monarch' },
  ];

  const TERRAIN_LESSONS = [
    { id: 'm1_l1_introduction', label: 'Castles', hexClass: 'hexagon-white-castle' },
    { id: 'm1_l2_terrain_rivers', label: 'Rivers', hexClass: 'hexagon-river' },
    { id: 'm1_l3_terrain_highground', label: 'High Ground', hexClass: 'hexagon-light hexagon-high-ground' },
    { id: 'm1_l4_terrain_sanctuaries', label: 'Sanctuaries', hexClass: 'hexagon-sanctuary hexagon-sanctuary-phoenix' },
  ];

  const goToNextLesson = () => {
    if (currentLessonIndex < lessons.length - 1) {
      setCurrentLessonIndex(prev => prev + 1);
    }
  };

  const goToPrevLesson = () => {
    if (currentLessonIndex > 0) {
      setCurrentLessonIndex(prev => prev - 1);
    }
  };

  const restartTutorial = () => {
    setCurrentLessonIndex(0);
  };

  const jumpToLesson = (lessonId: string) => {
    const idx = lessons.findIndex(l => l.id === lessonId);
    if (idx !== -1) setCurrentLessonIndex(idx);
  };

  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame ?? onBack },
    { id: "learn", label: "Learn" },
    ...(onOpenOnlineBrowser ? [{ id: "watch" as const, label: "Watch", onClick: onOpenOnlineBrowser }] : []),
    ...(onOpenLibrary ? [{ id: "library" as const, label: "Library", onClick: onOpenLibrary }] : []),
  ];
  const lessonProgressLabel = `Lesson ${currentLessonIndex + 1} of ${lessons.length}`;

  return (
    <div className="tutorial-container">
      <div className="tutorial-sidebar">
        <AppShellNav
          ariaLabel="Learn navigation"
          activeDestination="learn"
          title="Learn"
          kicker="Tutorial"
          description="Resume the lesson board and keep progress visible."
          backLabel={backLabel}
          onBack={onBack}
          destinations={navDestinations}
        />

        <div className="tutorial-lesson-header" role="group" aria-label="Current lesson">
          <h2 className="tutorial-title">{lesson.title}</h2>
          <span className="tutorial-lesson-progress-summary">{lessonProgressLabel}</span>
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
            <button onClick={goToPrevLesson} disabled={currentLessonIndex === 0} className="tutorial-step-button">
              Previous
            </button>
            <button
              type="button"
              onClick={restartTutorial}
              className="tutorial-reset-button"
            >
              Restart Tutorial
            </button>
            <button onClick={goToNextLesson} disabled={currentLessonIndex === lessons.length - 1} className="tutorial-step-button">
              Next
            </button>
          </div>
        </div>

        {lesson.id.startsWith('m2_l') && (
          <div className="tutorial-quick-nav" role="group" aria-label="Piece lessons">
            {PIECE_LESSONS.map(({ id, piece, label }) => {
              const isActive = lesson.id === id;
              return (
                <button key={id} onClick={() => jumpToLesson(id)} title={label} aria-label={label} className={`tutorial-nav-btn ${isActive ? 'active' : ''}`}>
                  <img src={getImageByPieceType(piece, 'w')} alt="" className="tutorial-quick-nav-icon" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {lesson.id.startsWith('m1_l') && (
          <div className="tutorial-quick-nav" role="group" aria-label="Terrain lessons">
            {TERRAIN_LESSONS.map(({ id, label, hexClass }) => {
              const isActive = lesson.id === id;
              return (
                <button key={id} onClick={() => jumpToLesson(id)} title={label} aria-label={label} className={`tutorial-nav-btn ${isActive ? 'active' : ''}`}>
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

        {lesson.objectives && lesson.objectives.length > 0 && (
          <div className={`tutorial-list-section ${isDark ? "dark" : "light"}`}>
            <h3>Objectives:</h3>
            <ul>
              {lesson.objectives.map((obj, i) => <li key={i}>{obj}</li>)}
            </ul>
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
