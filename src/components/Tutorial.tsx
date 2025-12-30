/**
 * @file Tutorial.tsx
 * @description Interactive tutorial component for teaching Castles gameplay.
 * 
 * Renders the board directly (like BoardEditor) with SVG viewBox for proper
 * auto-scaling within the available space. Uses isTutorialMode-aware game logic.
 */
import React, { useMemo, useState, useCallback } from 'react';
import HexGrid from './HexGrid';
import PieceRenderer from './PieceRenderer';
import LegalMoveOverlay from './LegalMoveOverlay';
import { PieceTooltip } from './PieceTooltip';
import { TerrainTooltip } from './TerrainTooltip';
import { Board } from '../Classes/Core/Board';
import { Piece } from '../Classes/Entities/Piece';
import { Hex } from '../Classes/Entities/Hex';
import { TurnPhase, Color, N_SQUARES } from '../Constants';
import { RuleEngine } from '../Classes/Systems/RuleEngine';
import { createPieceMap } from '../utils/PieceMap';
import { getStartingLayout, getStartingPieces, getStartingBoard } from '../ConstantImports';
import '../css/Board.css';

interface TutorialProps {
  onBack: () => void;
}

/**
 * Create the tutorial board using the standard starting position.
 * Uses the same board size as the normal game (N_SQUARES = 8).
 */
const createTutorialBoard = () => {
  const board = getStartingBoard(N_SQUARES-1);
  const pieces = getStartingPieces(N_SQUARES-1);
  const castles = board.castles;
  
  return { board, pieces, castles };
};

const Tutorial: React.FC<TutorialProps> = ({ onBack }) => {
  // Initialize board state using standard starting position
  const initialData = useMemo(() => createTutorialBoard(), []);
  const [pieces, setPieces] = useState<Piece[]>(initialData.pieces);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('Movement');
  const [currentPlayer, setCurrentPlayer] = useState<Color>('w');
  
  // Tooltip state
  const [tooltipPiece, setTooltipPiece] = useState<Piece | null>(null);
  const [tooltipHex, setTooltipHex] = useState<Hex | null>(null);
  
  const board = initialData.board;
  const castles = initialData.castles;
  
  // Compute layout with viewBox for auto-scaling
  const { layout, viewBox } = useMemo(() => {
    const l = getStartingLayout(board);
    
    // Calculate bounding box for viewBox (same as BoardEditor)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    board.hexes.forEach(hex => {
      const corners = l.layout.polygonCorners(hex);
      corners.forEach(corner => {
        if (corner.x < minX) minX = corner.x;
        if (corner.x > maxX) maxX = corner.x;
        if (corner.y < minY) minY = corner.y;
        if (corner.y > maxY) maxY = corner.y;
      });
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 40;
    const vb = `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;

    return { layout: l, viewBox: vb };
  }, [board]);
  
  // Compute legal moves/attacks for selected piece
  const pieceMap = useMemo(() => createPieceMap(pieces), [pieces]);
  
  const legalMoves = useMemo(() => {
    if (!selectedPiece || turnPhase !== 'Movement') return [];
    return RuleEngine.getLegalMoves(selectedPiece, { pieces, pieceMap, castles } as any, board);
  }, [selectedPiece, pieces, pieceMap, castles, board, turnPhase]);
  
  const legalAttacks = useMemo(() => {
    if (!selectedPiece || turnPhase !== 'Attack') return [];
    return RuleEngine.getLegalAttacks(selectedPiece, { pieces, pieceMap } as any, board);
  }, [selectedPiece, pieces, pieceMap, board, turnPhase]);
  
  const legalMoveSet = useMemo(() => new Set(legalMoves.map(h => h.getKey())), [legalMoves]);
  const legalAttackSet = useMemo(() => new Set(legalAttacks.map(h => h.getKey())), [legalAttacks]);
  
  // Handle piece click
  const handlePieceClick = useCallback((piece: Piece) => {
    if (tooltipPiece) setTooltipPiece(null);
    if (tooltipHex) setTooltipHex(null);
    
    if (piece.color !== currentPlayer) return;
    
    if (selectedPiece === piece) {
      setSelectedPiece(null);
    } else {
      setSelectedPiece(piece);
    }
  }, [selectedPiece, currentPlayer, tooltipPiece, tooltipHex]);
  
  // Handle hex click (for moves/attacks)
  const handleHexClick = useCallback((hex: Hex) => {
    if (tooltipPiece) setTooltipPiece(null);
    if (tooltipHex) setTooltipHex(null);
    
    if (!selectedPiece) return;
    
    const hexKey = hex.getKey();
    
    // Check for move
    if (turnPhase === 'Movement' && legalMoveSet.has(hexKey)) {
      // Execute move using Piece.with() for immutable update
      setPieces(prev => prev.map(p => 
        p === selectedPiece ? p.with({ hex, canMove: false }) : p
      ));
      setSelectedPiece(null);
      setTurnPhase('Attack');
      return;
    }
    
    // Check for attack
    if (turnPhase === 'Attack' && legalAttackSet.has(hexKey)) {
      // Execute attack - remove captured piece
      setPieces(prev => prev.filter(p => !p.hex.equals(hex)));
      setSelectedPiece(null);
      // Switch player
      setCurrentPlayer(prev => prev === 'w' ? 'b' : 'w');
      setTurnPhase('Movement');
      return;
    }
    
    setSelectedPiece(null);
  }, [selectedPiece, turnPhase, legalMoveSet, legalAttackSet, tooltipPiece, tooltipHex]);
  
  // Handle pass
  const handlePass = useCallback(() => {
    if (turnPhase === 'Movement') {
      setTurnPhase('Attack');
    } else {
      setCurrentPlayer(prev => prev === 'w' ? 'b' : 'w');
      setTurnPhase('Movement');
    }
    setSelectedPiece(null);
  }, [turnPhase]);
  
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
          ← Back to Game
        </button>
        
        <h2 style={{ margin: 0, color: '#ffd700' }}>Lesson 1: The Battlefield</h2>
        
        {/* Turn indicator */}
        <div style={{
          padding: '10px',
          backgroundColor: currentPlayer === 'w' ? '#f5f5dc' : '#333',
          color: currentPlayer === 'w' ? '#333' : '#fff',
          borderRadius: '8px',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          {currentPlayer === 'w' ? 'White' : 'Black'}'s Turn - {turnPhase} Phase
        </div>
        
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
        
        <button
          onClick={handlePass}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2a4a7a',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Pass {turnPhase} Phase
        </button>
        
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
      
      {/* Game Board Area */}
      <div style={{ 
        flex: 1, 
        position: 'relative',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
      }}>
        <svg 
          className="board" 
          height="100%" 
          width="100%" 
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          <HexGrid
            hexagons={board.hexes}
            castles={castles}
            sanctuaries={[]}
            legalMoveSet={legalMoveSet}
            legalAttackSet={legalAttackSet}
            showCoordinates={false}
            isBoardRotated={false}
            isAdjacentToControlledCastle={() => false}
            onHexClick={handleHexClick}
            onHexRightClick={(hex) => {
              setTooltipPiece(null);
              setTooltipHex(hex === tooltipHex ? null : hex);
            }}
            resizeVersion={0}
            layout={layout}
            board={board}
          />
          <PieceRenderer
            pieces={pieces}
            isBoardRotated={false}
            onPieceClick={handlePieceClick}
            onPieceRightClick={(piece) => {
              setTooltipHex(null);
              setTooltipPiece(piece === tooltipPiece ? null : piece);
            }}
            resizeVersion={0}
            layout={layout}
            board={board}
          />
          <LegalMoveOverlay
            hexagons={board.hexes}
            legalMoveSet={legalMoveSet}
            legalAttackSet={legalAttackSet}
            isBoardRotated={false}
            onHexClick={handleHexClick}
            layout={layout}
          />
        </svg>
        
        {/* Piece tooltip */}
        {tooltipPiece && (
          <PieceTooltip 
            piece={tooltipPiece} 
            isDefended={RuleEngine.isHexDefended(
              tooltipPiece.hex, 
              tooltipPiece.color === 'w' ? 'b' : 'w', 
              { pieces, pieceMap } as any, 
              board
            )}
          />
        )}
        
        {/* Terrain tooltip */}
        {tooltipHex && (
          <TerrainTooltip 
            hex={tooltipHex} 
            board={board} 
            castle={castles.find(c => c.hex.equals(tooltipHex))}
            position={{ x: 0, y: 0 }} 
          />
        )}
      </div>
    </div>
  );
};

export default Tutorial;
