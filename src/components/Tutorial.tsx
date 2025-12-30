/**
 * @file Tutorial.tsx
 * @description Interactive tutorial component for teaching Castles gameplay.
 * 
 * Uses the same GameBoard component as regular games but with isTutorialMode=true
 * to disable victory checks. Wraps GameBoard with a left sidebar for instructions.
 */
import React from 'react';
import GameBoard from './Game';
import { N_SQUARES } from '../Constants';
import { getStartingPieces, getStartingBoard, getStartingLayout } from '../ConstantImports';
import '../css/Board.css';

interface TutorialProps {
  onBack: () => void;
}

/**
 * Create the tutorial board using slightly smaller board for better fit.
 * Uses N_SQUARES - 1 to accommodate the tutorial sidebar.
 */
const createTutorialBoard = () => {
  const tutorialBoardSize = N_SQUARES - 1; // Slightly smaller to fit with tutorial sidebar
  const board = getStartingBoard(tutorialBoardSize);
  const pieces = getStartingPieces(tutorialBoardSize);
  const layout = getStartingLayout(board);
  return { board, pieces, layout };
};

const Tutorial: React.FC<TutorialProps> = ({ onBack }) => {
  const { board, pieces, layout } = React.useMemo(() => createTutorialBoard(), []);
  
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
        <button 
          onClick={onBack}
          style={{
            padding: '8px 16px',
            backgroundColor: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '16px'
          }}
        >
          ← Back to Game
        </button>
        
        <h2 style={{ margin: 0, color: '#ffd700' }}>Interactive Tutorial</h2>
        
        <div style={{ lineHeight: 1.6 }}>
          <p>Welcome to <strong>Castles</strong>, a fantasy chess game on a hexagonal board!</p>
          
          <p>The board contains terrain types:</p>
          
          <ul style={{ paddingLeft: '20px' }}>
            <li><strong>🏰 Castles</strong> - Recruit pieces and achieve victory</li>
            <li><strong>🌊 Rivers</strong> - Block ground movement</li>
            <li><strong>⛰️ High Ground</strong> - Bonus range for archers</li>
          </ul>
          
          <h3 style={{ color: '#ffd700', marginTop: '24px' }}>Try These:</h3>
          <ul style={{ paddingLeft: '20px' }}>
            <li>✓ Click a piece to see legal moves</li>
            <li>✓ Right-click for detailed info</li>
            <li>✓ Move pieces and attack enemies</li>
          </ul>
        </div>
        
        <div style={{ 
          marginTop: 'auto', 
          padding: '12px', 
          backgroundColor: '#2a2a4e',
          borderRadius: '8px',
          fontSize: '14px'
        }}>
          💡 <strong>Tip:</strong> No victory conditions in tutorial - explore freely!
        </div>
      </div>
      
      {/* Game Board - uses full game logic with isTutorialMode */}
      <div style={{ flex: 1, position: 'relative', height: '100vh' }}>
        <GameBoard
          initialBoard={board}
          initialPieces={pieces}
          initialLayout={layout}
          isTutorialMode={true}
          onSetup={() => {}}
          onRestart={() => {}}
        />
      </div>
    </div>
  );
};

export default Tutorial;
