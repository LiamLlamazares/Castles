/**
 * @file Tutorial.tsx
 * @description Interactive tutorial component for teaching Castles gameplay.
 */
import React, { useState, useMemo } from 'react';
import GameBoard from './Game';
import { getAllLessons, TutorialLesson } from '../tutorial';
import { getImageByPieceType } from './PieceImages';
import { PieceType } from '../Constants';
import { useTheme } from '../contexts/ThemeContext';
import '../css/Board.css';

interface TutorialProps {
  onBack: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ onBack }) => {
  const { isDark } = useTheme();
  const lessons = useMemo(() => getAllLessons(), []);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const lesson: TutorialLesson = lessons[currentLessonIndex];

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

  const jumpToLesson = (lessonId: string) => {
    const idx = lessons.findIndex(l => l.id === lessonId);
    if (idx !== -1) setCurrentLessonIndex(idx);
  };

  return (
    <div className="tutorial-container">
      <div className="tutorial-sidebar">
        <div className="tutorial-topbar">
          <button
            onClick={onBack}
            className="tutorial-back-button"
          >
            Back to game
          </button>
          <span className="tutorial-progress">
            {currentLessonIndex + 1} / {lessons.length}
          </span>
        </div>

        <h2 className="tutorial-title" style={{ margin: 0 }}>{lesson.title}</h2>

        {lesson.id.startsWith('m2_l') && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {PIECE_LESSONS.map(({ id, piece, label }) => {
              const isActive = lesson.id === id;
              return (
                <button key={id} onClick={() => jumpToLesson(id)} title={label} className={`tutorial-nav-btn ${isActive ? 'active' : ''}`}>
                  <img src={getImageByPieceType(piece, 'w')} alt={label} style={{ width: '28px', height: '28px', filter: isActive ? 'brightness(0.3)' : 'none' }} />
                  <span style={{ fontSize: '9px', fontWeight: 'bold' }}>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {lesson.id.startsWith('m1_l') && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {TERRAIN_LESSONS.map(({ id, label, hexClass }) => {
              const isActive = lesson.id === id;
              return (
                <button key={id} onClick={() => jumpToLesson(id)} title={label} className={`tutorial-nav-btn ${isActive ? 'active' : ''}`}>
                  <svg viewBox="0 0 110 110" style={{ width: 28, height: 28 }}>
                    <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className={hexClass} style={{ strokeWidth: 3 }} />
                  </svg>
                  <span style={{ fontSize: '9px', fontWeight: 'bold' }}>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lesson.description}</div>

        {lesson.instructions && (
          <div style={{ padding: '12px', backgroundColor: isDark ? '#2a2a4e' : '#e8e8f0', borderRadius: '8px', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {lesson.instructions}
          </div>
        )}

        {lesson.objectives && lesson.objectives.length > 0 && (
          <div>
            <h3 style={{ color: isDark ? '#ffd700' : '#702cf0', marginTop: 0, marginBottom: '8px' }}>Objectives:</h3>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {lesson.objectives.map((obj, i) => <li key={i} style={{ marginBottom: '4px' }}>{obj}</li>)}
            </ul>
          </div>
        )}

        {lesson.hints && lesson.hints.length > 0 && (
          <div>
            <h3 style={{ color: isDark ? '#ffd700' : '#702cf0', marginTop: '16px', marginBottom: '8px' }}>Hints:</h3>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {lesson.hints.map((hint, i) => <li key={i} style={{ marginBottom: '4px' }}>{hint}</li>)}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', gap: '12px', paddingTop: '16px' }}>
          <button onClick={goToPrevLesson} disabled={currentLessonIndex === 0} style={{ flex: 1, padding: '10px', backgroundColor: currentLessonIndex === 0 ? '#333' : '#2a4a7a', color: currentLessonIndex === 0 ? '#666' : '#fff', border: 'none', borderRadius: '8px', cursor: currentLessonIndex === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            Previous
          </button>
          <button onClick={goToNextLesson} disabled={currentLessonIndex === lessons.length - 1} style={{ flex: 1, padding: '10px', backgroundColor: currentLessonIndex === lessons.length - 1 ? '#333' : '#2a4a7a', color: currentLessonIndex === lessons.length - 1 ? '#666' : '#fff', border: 'none', borderRadius: '8px', cursor: currentLessonIndex === lessons.length - 1 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            Next
          </button>
        </div>
      </div>

      <div className="tutorial-board-stage">
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
      </div>
    </div>
  );
};

export default Tutorial;
