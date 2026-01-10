/**
 * @file BoardEditor.tsx
 * @description Board editor component for creating custom positions.
 *
 * Features:
 * - Place pieces and sanctuaries on the board
 * - Drag pieces between hexes
 * - Remove pieces via delete mode
 * - Edit sanctuary cooldowns
 * - Export position as PGN
 */
import React, { useState, useMemo, useCallback } from 'react';
import HexGrid from './HexGrid';
import PieceRenderer from './PieceRenderer';
import BoardEditorToolbar from './BoardEditorToolbar';
import CooldownPopup from './CooldownPopup';
import PieceTooltip from './PieceTooltip';
import { getStartingPieces, getStartingBoard, getStartingLayout } from '../ConstantImports';
import { Board } from '../Classes/Core/Board';
import { Piece } from '../Classes/Entities/Piece';
import { Hex } from '../Classes/Entities/Hex';
import { Sanctuary } from '../Classes/Entities/Sanctuary';
import { PieceType, SanctuaryType, Color } from '../Constants';
import { PGNGenerator } from '../Classes/Services/PGNGenerator';
import { MoveTree } from '../Classes/Core/MoveTree';
import '../css/Board.css';

// SVG import
import scrollIcon from '../Assets/Images/misc/scroll.svg';

export type EditorTool = 
  | { type: 'piece'; pieceType: PieceType; color: Color }
  | { type: 'sanctuary'; sanctuaryType: SanctuaryType }
  | { type: 'delete' }
  | null;

interface BoardEditorProps {
  /** Callback when user wants to play with the current position */
  onPlay: (board: Board, pieces: Piece[], sanctuaries: Sanctuary[]) => void;
  /** Callback to return to previous view */
  onBack: () => void;
  /** Initial board state (optional, for editing existing positions) */
  initialBoard?: Board;
  /** Initial pieces (optional) */
  initialPieces?: Piece[];
  /** Initial sanctuaries (optional) */
  initialSanctuaries?: Sanctuary[];
}

const BoardEditor: React.FC<BoardEditorProps> = ({
  onPlay,
  onBack,
  initialBoard,
  initialPieces,
  initialSanctuaries,
}) => {
  // Board size state
  const [boardRadius, setBoardRadius] = useState<number>(
    initialBoard?.config?.nSquares ?? 8
  );

  // Pieces and sanctuaries state
  const [pieces, setPieces] = useState<Piece[]>(
    initialPieces ?? getStartingPieces(boardRadius)
  );
  const [sanctuaries, setSanctuaries] = useState<Sanctuary[]>(
    initialSanctuaries ?? []
  );

  // Editor state
  const [selectedTool, setSelectedTool] = useState<EditorTool>(null);
  const [draggedPiece, setDraggedPiece] = useState<Piece | null>(null);
  const [cooldownSanctuary, setCooldownSanctuary] = useState<Sanctuary | null>(null);
  const [showCoordinates, setShowCoordinates] = useState<boolean>(true);
  
  // Tooltip state
  const [tooltipData, setTooltipData] = useState<{ piece: Piece, position: {x: number, y: number} } | null>(null);

  // Computed board and layout
  const { board, layout, viewBox } = useMemo(() => {
    const b = initialBoard ?? getStartingBoard(boardRadius);
    const l = getStartingLayout(b);

    // Calculate viewBox using LayoutService method
    const vb = l.calculateViewBox();

    return { board: b, layout: l, viewBox: vb };
  }, [boardRadius, initialBoard]);

  // Update pieces when board radius changes (only if not using initial)
  React.useEffect(() => {
    if (!initialBoard) {
      setPieces(getStartingPieces(boardRadius));
      setSanctuaries([]);
    }
  }, [boardRadius, initialBoard]);

  // Handle hex click - place piece/sanctuary or remove
  const handleHexClick = useCallback((hex: Hex) => {
    if (!selectedTool) {
      // Check if clicking on a sanctuary to edit cooldown
      const sanctuary = sanctuaries.find(s => s.hex.equals(hex));
      if (sanctuary) {
        setCooldownSanctuary(sanctuary);
      }
      return;
    }

    if (selectedTool.type === 'delete') {
      // Remove piece at this hex
      setPieces(prev => prev.filter(p => !p.hex.equals(hex)));
      // Remove sanctuary at this hex (and its mirror)
      setSanctuaries(prev => {
        const sanctuaryAtHex = prev.find(s => s.hex.equals(hex));
        if (sanctuaryAtHex) {
          // Remove both the sanctuary and its mirror
          const mirrorHex = new Hex(-hex.q, -hex.r, -hex.s);
          return prev.filter(s => !s.hex.equals(hex) && !s.hex.equals(mirrorHex));
        }
        return prev;
      });
      return;
    }

    if (selectedTool.type === 'piece') {
      // Check if hex is valid (on board)
      if (!board.hexes.some(h => h.equals(hex))) return;

      // Remove any existing piece at this hex
      const filteredPieces = pieces.filter(p => !p.hex.equals(hex));
      
      // Add new piece (Piece constructor: hex, color, type)
      const newPiece = new Piece(
        hex,
        selectedTool.color,
        selectedTool.pieceType
      );
      setPieces([...filteredPieces, newPiece]);
      return;
    }

    if (selectedTool.type === 'sanctuary') {
      // Check if hex is valid (on board)
      if (!board.hexes.some(h => h.equals(hex))) return;

      // Determine territory side based on hex position (q coordinate)
      const territorySide: Color = hex.q >= 0 ? 'w' : 'b';
      const mirrorTerritorySide: Color = territorySide === 'w' ? 'b' : 'w';
      
      // Remove any existing sanctuaries at this hex or its mirror
      const mirrorHex = new Hex(-hex.q, -hex.r, -hex.s);
      const filteredSanctuaries = sanctuaries.filter(
        s => !s.hex.equals(hex) && !s.hex.equals(mirrorHex)
      );

      // Create sanctuary and its mirror
      const newSanctuary = new Sanctuary(
        hex,
        selectedTool.sanctuaryType,
        territorySide,
        null, // no controller
        0,    // default cooldown
        false // not pledged
      );
      const mirrorSanctuary = new Sanctuary(
        mirrorHex,
        selectedTool.sanctuaryType,
        mirrorTerritorySide,
        null,
        0,
        false
      );

      // Only add mirror if it's a valid hex on the board
      const newSanctuaries = [newSanctuary];
      if (board.hexes.some(h => h.equals(mirrorHex))) {
        newSanctuaries.push(mirrorSanctuary);
      }

      setSanctuaries([...filteredSanctuaries, ...newSanctuaries]);
      return;
    }
  }, [selectedTool, pieces, sanctuaries, board.hexes]);

  // Handle piece click for drag or delete
  const handlePieceClick = useCallback((piece: Piece) => {
    if (selectedTool?.type === 'delete') {
      setPieces(prev => prev.filter(p => p !== piece));
      return;
    }
    
    // Start dragging
    setDraggedPiece(piece);
    setSelectedTool(null); // Clear tool selection during drag
  }, [selectedTool]);

  // Handle dropping a dragged piece
  const handleDrop = useCallback((hex: Hex) => {
    if (!draggedPiece) return;
    
    // Check if hex is valid
    if (!board.hexes.some(h => h.equals(hex))) {
      setDraggedPiece(null);
      return;
    }

    // Move piece to new hex
    setPieces(prev => {
      // Remove piece from old position and any piece at new position
      const filtered = prev.filter(p => p !== draggedPiece && !p.hex.equals(hex));
      // Add piece at new position (Piece constructor: hex, color, type)
      const movedPiece = new Piece(hex, draggedPiece.color, draggedPiece.type);
      return [...filtered, movedPiece];
    });

    setDraggedPiece(null);
  }, [draggedPiece, board.hexes]);

  // Handle cooldown update
  const handleCooldownUpdate = useCallback((cooldown: number) => {
    if (!cooldownSanctuary) return;
    
    setSanctuaries(prev => prev.map(s => 
      s.hex.equals(cooldownSanctuary.hex) 
        ? s.with({ cooldown }) 
        : s
    ));
    setCooldownSanctuary(null);
  }, [cooldownSanctuary]);

  // Export position as PGN
  const handleExport = useCallback(() => {
    const pgn = PGNGenerator.generatePGN(
      board,
      pieces,
      [], // No move history
      sanctuaries,
      { Result: '*' },
      new MoveTree() // Empty move tree
    );
    navigator.clipboard.writeText(pgn).then(() => {
      alert('Position PGN copied to clipboard!');
    });
  }, [board, pieces, sanctuaries]);

  // Play with current position
  const handlePlay = useCallback(() => {
    onPlay(board, pieces, sanctuaries);
  }, [board, pieces, sanctuaries, onPlay]);

  // Clear all pieces and sanctuaries
  const handleClear = useCallback(() => {
    setPieces([]);
    setSanctuaries([]);
  }, []);

  // Combined click handler for board
  const handleBoardClick = useCallback((hex: Hex) => {
    if (draggedPiece) {
      handleDrop(hex);
    } else {
      handleHexClick(hex);
    }
  }, [draggedPiece, handleDrop, handleHexClick]);

  return (
    <div className="board-editor" style={{ 
      display: 'flex', 
      height: '100vh', 
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#eee' 
    }}>
      {/* Toolbar */}
      <BoardEditorToolbar
        selectedTool={selectedTool}
        onToolSelect={setSelectedTool}
        boardRadius={boardRadius}
        onBoardRadiusChange={setBoardRadius}
        isInitialBoard={!!initialBoard}
        showCoordinates={showCoordinates}
        onShowCoordinatesChange={setShowCoordinates}
        onTooltip={setTooltipData}
      />

      {/* Main editor area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Action bar */}
        <div className="editor-actions" style={{
          padding: '12px 20px',
          background: 'rgba(0,0,0,0.3)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onBack} className="editor-btn secondary">
              ← Back
            </button>
            <button onClick={handleClear} className="editor-btn secondary">
              Clear Board
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={handleExport} className="editor-btn primary">
              <img src={scrollIcon} alt="" style={{ width: '16px', height: '16px', marginRight: '6px', verticalAlign: 'middle' }} /> Export PGN
            </button>
            <button onClick={handlePlay} className="editor-btn success">
              ▶ Play Position
            </button>
          </div>
        </div>

        {/* Board */}
        <div className="editor-board-container" style={{ 
          flex: 1, 
          position: 'relative', 
          overflow: 'hidden',
          cursor: draggedPiece ? 'grabbing' : (selectedTool ? 'crosshair' : 'default')
        }}>
          <svg className="board" height="100%" width="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
            <HexGrid
              hexagons={board.hexes}
              castles={board.castles}
              sanctuaries={sanctuaries}
              legalMoveSet={new Set()}
              legalAttackSet={new Set()}
              showCoordinates={showCoordinates}
              isBoardRotated={false}
              isAdjacentToControlledCastle={() => false}
              onHexClick={handleBoardClick}
              resizeVersion={0}
              layout={layout}
              board={board}
            />
            <PieceRenderer
              pieces={pieces}
              isBoardRotated={false}
              onPieceClick={handlePieceClick}
              resizeVersion={0}
              layout={layout}
              editorPlacementMode={selectedTool?.type === 'piece' || selectedTool?.type === 'sanctuary'}
            />
          </svg>
        </div>
      </div>


      {/* Cooldown popup */}
      {cooldownSanctuary && (
        <CooldownPopup
          sanctuary={cooldownSanctuary}
          onSave={handleCooldownUpdate}
          onClose={() => setCooldownSanctuary(null)}
        />
      )}

      {/* Piece Tooltip for sidebar hover */}
      {tooltipData && (
          <PieceTooltip 
              piece={tooltipData.piece} 
              position={tooltipData.position} 
              style={{ bottom: '20px' }}
          />
      )}

      {/* Editor-specific styles */}
      <style>{`
        .editor-btn {
          padding: 10px 20px;
          font-size: 0.95rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .editor-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .editor-btn.primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .editor-btn.secondary {
          background: rgba(255,255,255,0.1);
          color: #ccc;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .editor-btn.secondary:hover {
          background: rgba(255,255,255,0.2);
        }
        .editor-btn.success {
          background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
          color: white;
        }
      `}</style>
    </div>
  );
};

export default BoardEditor;
