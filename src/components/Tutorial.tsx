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
        <h2 style={{ margin: 0, color: '#ffd700' }}>{lesson.title}</h2>
        
        {/* Lesson Description */}
        <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{lesson.description}</p>
        
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
