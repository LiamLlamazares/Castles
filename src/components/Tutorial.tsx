/**
 * @file Tutorial.tsx
 * @description Interactive tutorial component for teaching Castles gameplay.
 * 
 * Uses the same GameBoard component as regular games but with isTutorialMode=true
 * to disable victory checks. Each lesson provides a pre-configured board position
 * with instructional sidebar content.
 */
import React from 'react';
import GameBoard from './Game';
import { Board, BoardConfig } from '../Classes/Core/Board';
import { LayoutService } from '../Classes/Systems/LayoutService';
import { Piece } from '../Classes/Entities/Piece';
import { Castle } from '../Classes/Entities/Castle';
import { Hex } from '../Classes/Entities/Hex';
import { PieceFactory } from '../Classes/Entities/PieceFactory';
import { PieceType } from '../Constants';
import '../css/Board.css';

interface TutorialProps {
  onBack: () => void;
}

/**
 * First lesson: Full 7x7 board with terrain overview.
 * Creates a complete board with castles, rivers, and high ground for exploration.
 */
const createLesson1Board = () => {
  const N = 3; // 7x7 board (hexes from -3 to +3 in each direction)
  
  // Create castles (3 per side) - using default corner positions
  const whiteCastlePositions = [
    new Hex(-3, 3, 0),  // Bottom-left corner
    new Hex(0, 3, -3),  // Bottom-center corner
    new Hex(3, 0, -3),  // Right corner
  ];
  const blackCastlePositions = [
    new Hex(3, -3, 0),  // Top-right corner
    new Hex(0, -3, 3),  // Top-center corner
    new Hex(-3, 0, 3),  // Left corner
  ];
  
  const castles: Castle[] = [
    ...whiteCastlePositions.map(hex => new Castle(hex, 'w', 0)),
    ...blackCastlePositions.map(hex => new Castle(hex, 'b', 0)),
  ];
  
  // Create board configuration
  const boardConfig: BoardConfig = { nSquares: N };
  
  // Create board with custom castles
  const board = new Board(boardConfig, castles);
  
  // Create some pieces for interaction demonstration
  const pieces: Piece[] = [
    // White pieces
    PieceFactory.create(PieceType.Monarch, new Hex(0, 3, -3), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 3, -2), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, 2, -3), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-2, 3, -1), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(2, 1, -3), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(0, 2, -2), 'w'),
    
    // Black pieces
    PieceFactory.create(PieceType.Monarch, new Hex(0, -3, 3), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -3, 2), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, -2, 3), 'b'),
    PieceFactory.create(PieceType.Archer, new Hex(2, -3, 1), 'b'),
    PieceFactory.create(PieceType.Knight, new Hex(-2, -1, 3), 'b'),
    PieceFactory.create(PieceType.Giant, new Hex(0, -2, 2), 'b'),
  ];
  
  return { board, pieces };
};

const Tutorial: React.FC<TutorialProps> = ({ onBack }) => {
  const { board, pieces } = React.useMemo(() => createLesson1Board(), []);
  const layout = React.useMemo(() => new LayoutService(board), [board]);
  
  return (
    <div className="tutorial-container" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Instructional Sidebar */}
      <div className="tutorial-sidebar" style={{
        width: '300px',
        padding: '20px',
        backgroundColor: '#1a1a2e',
        color: '#e0e0e0',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
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
          ← Back to Menu
        </button>
        
        <h2 style={{ margin: 0, color: '#ffd700' }}>Lesson 1: The Battlefield</h2>
        
        <div style={{ lineHeight: 1.6 }}>
          <p>Welcome to <strong>Castles</strong>, a fantasy chess game played on a hexagonal board!</p>
          
          <p>The board contains several types of terrain:</p>
          
          <ul style={{ paddingLeft: '20px' }}>
            <li><strong>🏰 Castles</strong> - Control these to recruit new pieces and achieve victory</li>
            <li><strong>🌊 Rivers</strong> - Block ground-based movement (blue hexes)</li>
            <li><strong>⛰️ High Ground</strong> - Grant ranged units bonus range (brown hexes)</li>
          </ul>
          
          <h3 style={{ color: '#ffd700', marginTop: '24px' }}>Try These:</h3>
          <ul style={{ paddingLeft: '20px' }}>
            <li>✓ Click a piece to see its legal moves</li>
            <li>✓ Right-click any piece for detailed info</li>
            <li>✓ Right-click terrain to learn about it</li>
            <li>✓ Move a piece and attack an enemy</li>
          </ul>
        </div>
        
        <div style={{ 
          marginTop: 'auto', 
          padding: '12px', 
          backgroundColor: '#2a2a4e',
          borderRadius: '8px',
          fontSize: '14px'
        }}>
          💡 <strong>Tip:</strong> In tutorial mode, there are no victory conditions - explore freely!
        </div>
      </div>
      
      {/* Game Board */}
      <div style={{ flex: 1, position: 'relative' }}>
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
