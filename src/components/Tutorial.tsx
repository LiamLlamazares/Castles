/**
 * @file Tutorial.tsx
 * @description Interactive tutorial component for teaching Castles gameplay.
 * 
 * Uses the lesson system from src/tutorial/ to load different tutorial scenarios.
 * Each lesson has its own board setup, pieces, and instructional content.
 */
import React, { useState, useMemo } from 'react';
import GameBoard from './Game';
import { getAllLessons, TutorialLesson } from '../tutorial';
import { getImageByPieceType } from './PieceImages';
import { PieceType } from '../Constants';
import '../css/Board.css';

interface TutorialProps {
  onBack: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ onBack }) => {
  // Load all available lessons
  const lessons = useMemo(() => getAllLessons(), []);
  
  // Track current lesson index
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  
  // Get the current lesson
  const lesson: TutorialLesson = lessons[currentLessonIndex];
  
  // Module 2 piece lessons for quick navigation
  const MODULE_2_PIECES = [
    { id: 'm2_l2_swordsman', piece: PieceType.Swordsman, label: 'Swordsman' },
    { id: 'm2_l4_archer', piece: PieceType.Archer, label: 'Archer' },
    { id: 'm2_l5_knight', piece: PieceType.Knight, label: 'Knight' },
    { id: 'm2_l6_giant', piece: PieceType.Giant, label: 'Giant' },
    { id: 'm2_l7_monarch', piece: PieceType.Monarch, label: 'Monarch' },
  ];
  
  // Module 1 terrain lessons for quick navigation (uses CSS classes from Board.css)
  const MODULE_1_TERRAINS = [
    { id: 'm1_l1_introduction', label: 'Castles', hexClass: 'hexagon-white-castle' },
    { id: 'm1_l2_terrain_rivers', label: 'Rivers', hexClass: 'hexagon-river' },
    { id: 'm1_l3_terrain_highground', label: 'High Ground', hexClass: 'hexagon-light hexagon-high-ground' },
    { id: 'm1_l4_terrain_sanctuaries', label: 'Sanctuaries', hexClass: 'hexagon-sanctuary hexagon-sanctuary-phoenix' },
  ];
  
  // Navigation handlers
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
    <div className="tutorial-container" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Instructional Sidebar */}
      <div className="tutorial-sidebar" style={{
        width: '300px',
        minWidth: '300px',
        padding: '20px',
        backgroundColor: '#1a1a2e',
        color: '#e0e0e0',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        zIndex: 10
      }}>
        {/* Navigation Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={onBack}
            style={{
              padding: '8px 16px',
              backgroundColor: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '14px', color: '#aaa' }}>
            {currentLessonIndex + 1} / {lessons.length}
          </span>
        </div>
        
        {/* Lesson Title */}
        <h2 className="tutorial-title" style={{ margin: 0 }}>{lesson.title}</h2>
        
        {/* Piece Quick Nav - only for Module 2 lessons */}
        {lesson.id.startsWith('m2_l') && (
          <div style={{ 
            display: 'flex', 
            gap: '6px', 
            flexWrap: 'wrap',
            padding: '8px 0',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            {MODULE_2_PIECES.map(({ id, piece, label }) => {
              const isActive = lesson.id === id;
              return (
                <button
                  key={id}
                  onClick={() => jumpToLesson(id)}
                  title={label}
                  className={`tutorial-nav-btn ${isActive ? 'active' : ''}`}
                >
                  <img 
                    src={getImageByPieceType(piece, 'w')} 
                    alt={label}
                    style={{ 
                      width: '28px', 
                      height: '28px',
                      filter: isActive ? 'brightness(0.3)' : 'none'
                    }} 
                  />
                  <span style={{ fontSize: '9px', fontWeight: 'bold' }}>{label}</span>
                </button>
              );
            })}
          </div>
        )}
        
        {/* Terrain Quick Nav - only for Module 1 lessons */}
        {lesson.id.startsWith('m1_l') && (
          <div style={{ 
            display: 'flex', 
            gap: '6px', 
            flexWrap: 'wrap',
            padding: '8px 0',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            {MODULE_1_TERRAINS.map(({ id, label, hexClass }) => {
              const isActive = lesson.id === id;
              return (
                <button
                  key={id}
                  onClick={() => jumpToLesson(id)}
                  title={label}
                  className={`tutorial-nav-btn ${isActive ? 'active' : ''}`}
                >
                  <svg viewBox="0 0 110 110" style={{ width: 28, height: 28 }}>
                    <polygon 
                      points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" 
                      className={hexClass}
                      style={{ strokeWidth: 3 }}
                    />
                  </svg>
                  <span style={{ fontSize: '9px', fontWeight: 'bold' }}>{label}</span>
                </button>
              );
            })}
          </div>
        )}
        
        {/* Lesson Description */}
        <div style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lesson.description}</div>
        
        {/* Instructions */}
        {lesson.instructions && (
          <div style={{
            padding: '12px',
            backgroundColor: '#2a2a4e',
            borderRadius: '8px',
            fontSize: '14px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap'
          }}>
            {lesson.instructions}
          </div>
        )}
        
        {/* Objectives */}
        {lesson.objectives && lesson.objectives.length > 0 && (
          <div>
            <h3 style={{ color: '#ffd700', marginTop: 0, marginBottom: '8px' }}>Objectives:</h3>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {lesson.objectives.map((obj, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>{obj}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Hints */}
        {lesson.hints && lesson.hints.length > 0 && (
          <div>
            <h3 style={{ color: '#ffd700', marginTop: '16px', marginBottom: '8px' }}>Hints:</h3>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {lesson.hints.map((hint, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>{hint}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Lesson Navigation */}
        <div style={{ 
          marginTop: 'auto', 
          display: 'flex', 
          gap: '12px',
          paddingTop: '16px'
        }}>
          <button
            onClick={goToPrevLesson}
            disabled={currentLessonIndex === 0}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: currentLessonIndex === 0 ? '#333' : '#2a4a7a',
              color: currentLessonIndex === 0 ? '#666' : '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: currentLessonIndex === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            ← Previous
          </button>
          <button
            onClick={goToNextLesson}
            disabled={currentLessonIndex === lessons.length - 1}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: currentLessonIndex === lessons.length - 1 ? '#333' : '#2a4a7a',
              color: currentLessonIndex === lessons.length - 1 ? '#666' : '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: currentLessonIndex === lessons.length - 1 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            Next →
          </button>
        </div>
      </div>
      
      {/* Game Board - uses full game logic with isTutorialMode */}
      <div style={{ flex: 1, position: 'relative', height: '100vh' }}>
        <GameBoard
          key={lesson.id} // Force remount when lesson changes
          initialBoard={lesson.board}
          initialPieces={lesson.pieces}
          initialLayout={lesson.layout}
          initialSanctuaries={lesson.sanctuaries}
          isTutorialMode={true}
          onSetup={() => {}}
          onRestart={() => {}}
        />
      </div>
    </div>
  );
};

export default Tutorial;
