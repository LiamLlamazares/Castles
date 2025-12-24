/**
 * @file Game.tsx
 * @description Main game board component for the Castles game.
 *
 * Renders the hex grid, pieces, and handles all user interactions.
 * Orchestrates child components:
 * - **HexGrid** - Renders the hex board with visual states
 * - **PieceRenderer** - Renders all pieces on the board
 * - **ControlPanel** - Clocks, move history, game controls
 * - **VictoryOverlay** - End-game overlay
 *
 * @usage Mounted by App.tsx when in game view.
 * @see useGameLogic - Hook providing all game state and actions
 * @see HexGrid - Board rendering component
 * @see ControlPanel - Right panel with controls
 */
import React from 'react';
import { useGameLogic } from "../hooks/useGameLogic";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useInputHandler } from "../hooks/useInputHandler";
import { useClickHandler } from "../hooks/useClickHandler";
import { useGameView } from "../hooks/useGameView";
import HexGrid from "./HexGrid";
import PieceRenderer from "./PieceRenderer";
import LegalMoveOverlay from "./LegalMoveOverlay";
import ControlPanel from "./ControlPanel";
import HamburgerMenu from "./HamburgerMenu";
import RulesModal from "./RulesModal";
import VictoryOverlay from "./VictoryOverlay";
import { Board } from "../Classes/Core/Board";
import { Piece } from "../Classes/Entities/Piece";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { startingLayout, startingBoard, allPieces } from "../ConstantImports";
import { Hex } from "../Classes/Entities/Hex";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import AbilityBar from "./AbilityBar";
import { SanctuaryTooltip } from "./SanctuaryTooltip";
import { HistoryEntry, MoveRecord } from "../Constants";
import "../css/Board.css";

interface GameBoardProps {
  initialBoard?: Board;
  initialPieces?: Piece[];
  initialLayout?: LayoutService;
  initialHistory?: HistoryEntry[]; 
  initialMoveHistory?: MoveRecord[];
  initialMoveTree?: import('../Classes/Core/MoveTree').MoveTree;
  initialTurnCounter?: number;
  initialSanctuaries?: Sanctuary[];
  onResign?: () => void; // Optional callback to parent (e.g. log event)
  onSetup?: () => void;
  onRestart?: () => void;
  onLoadGame?: (board: Board, pieces: Piece[], history: HistoryEntry[], moveHistory: MoveRecord[], turnCounter: number, sanctuaries: Sanctuary[], moveTree?: import('../Classes/Core/MoveTree').MoveTree) => void;
  timeControl?: { initial: number, increment: number };
  isAnalysisMode?: boolean;
  onEnableAnalysis?: (board: Board, pieces: Piece[], history: HistoryEntry[], moveHistory: MoveRecord[], turnCounter: number, sanctuaries: Sanctuary[]) => void;
}

/**
 * Main game board component.
 * Renders the hex grid, pieces, and handles user interactions.
 */
const GameBoard: React.FC<GameBoardProps> = ({ 
  initialBoard = startingBoard, 
  initialPieces = allPieces, 
  initialLayout = startingLayout,
  initialHistory,
  initialMoveHistory,
  initialMoveTree,
  initialTurnCounter,
  initialSanctuaries,
  onResign = () => {},
  onSetup = () => {},
  onRestart = () => {},
  onLoadGame = () => {},
  timeControl,
  isAnalysisMode = false,
  onEnableAnalysis = () => {}
}) => {
  const [isOverlayDismissed, setOverlayDismissed] = React.useState(false);
  const [hoveredHex, setHoveredHex] = React.useState<Hex | null>(null);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const [showRulesModal, setShowRulesModal] = React.useState(false);
  
  // Sound effects hook - subscribes to game events
  useSoundEffects();
    
  const {
    // State
    pieces,
    castles,
    sanctuaries,
    turnCounter,
    
    // Computed
    turnPhase,
    currentPlayer,
    hexagons,
    legalMoveSet,
    legalAttackSet,
    victoryMessage,
    winner,
    isRecruitmentSpot,
    moveHistory,
    moveTree,
    movingPiece,
    jumpToNode,
    history,
    
    // Actions
    handlePass,
    handleTakeback,
    handlePieceClick,
    handleHexClick: onEngineHexClick,
    handleResign,
    hasGameStarted,
    pledge,
    canPledge,
    
    // Analysis
    isViewingHistory,
    viewNodeId,
    stepHistory,
    getPGN,
    loadPGN,
    triggerAbility
  } = useGameLogic(initialBoard, initialPieces, initialHistory, initialMoveHistory, initialTurnCounter, initialSanctuaries, isAnalysisMode, initialMoveTree);

  // Decoupled View State
  const { 
    showCoordinates, 
    isBoardRotated, 
    resizeVersion, 
    toggleCoordinates, 
    handleFlipBoard, 
    incrementResizeVersion 
  } = useGameView();

  // Reset overlay when game restarts (victory message clears or changes)
  React.useEffect(() => {
    if (!victoryMessage) {
        setOverlayDismissed(false);
    }
  }, [victoryMessage]);

  // Handle New Game - only allow if game hasn't started or someone won
  const handleNewGame = () => {
    if (!hasGameStarted || winner) {
      onSetup();
    }
  };

  // Handle entering analysis mode - captures current state
  // Use last history entry for pieces (handles resign case where monarch was removed)
  // Handle entering analysis mode - export current game as PGN and re-import it
  // This reuses the PGN flow which handles all edge cases (resign, etc.)
  const handleEnterAnalysis = React.useCallback(() => {
    const pgn = getPGN();
    const result = loadPGN(pgn);
    if (result && onLoadGame) {
      // loadPGN returns a clean state with the tree containing snapshots
      onLoadGame(result.board, result.pieces, result.history, result.moveHistory, result.turnCounter, result.sanctuaries, result.moveTree);
    }
  }, [getPGN, loadPGN, onLoadGame]);

  const handleHexHover = React.useCallback((hex: Hex | null, event?: React.MouseEvent) => {
    setHoveredHex(hex);
    if (event) {
        setMousePosition({ x: event.clientX, y: event.clientY });
    }
  }, []);

  // Click handler hook - manages abilities, pledging, and delegation
  const {
    handleBoardClick,
    isPledgeTarget,
    activeAbility,
    setActiveAbility,
    pledgingSanctuary,
  } = useClickHandler({
    movingPiece,
    sanctuaries,
    pieces,
    canPledge,
    pledge,
    triggerAbility,
    onEngineHexClick,
  });

  useInputHandler({
    onPass: handlePass,
    onFlipBoard: handleFlipBoard,
    onTakeback: handleTakeback,
    onResize: incrementResizeVersion,
    onNavigate: stepHistory,
    onNewGame: handleNewGame,
    isNewGameEnabled: !hasGameStarted || !!winner
  });

  // =========== RENDER ===========

  const handleImportPGN = () => {
    const pgn = prompt("Paste PGN here:");
    if (pgn) {
        const result = loadPGN(pgn);
        if (result && onLoadGame) {
            onLoadGame(result.board, result.pieces, result.history, result.moveHistory, result.turnCounter, result.sanctuaries, result.moveTree);
        } else {
            alert("Failed to load PGN. Check console for details.");
        }
    }
  };

  const handleExportPGN = () => {
    const pgn = getPGN();
    navigator.clipboard.writeText(pgn).then(() => alert("PGN copied to clipboard!"));
  };

  return (
    <>
      {/* Hamburger Menu (Top Left) */}
      <HamburgerMenu
        onExportPGN={handleExportPGN}
        onImportPGN={handleImportPGN}
        onFlipBoard={handleFlipBoard}
        onToggleCoordinates={toggleCoordinates}
        onShowRules={() => setShowRulesModal(true)}
        onEnableAnalysis={handleEnterAnalysis}
        isAnalysisMode={isAnalysisMode}
      />

      <RulesModal 
        isOpen={showRulesModal} 
        onClose={() => setShowRulesModal(false)} 
      />

      {/* Game Panel (Right Side - Lichess Style) */}
      <ControlPanel
        currentPlayer={currentPlayer}
        turnPhase={turnPhase}
        onPass={handlePass}
        onResign={() => {
            handleResign(currentPlayer);
            onResign();
        }}
        onNewGame={handleNewGame}
        moveHistory={moveHistory || []}
        moveTree={moveTree}
        onJumpToNode={jumpToNode}
        hasGameStarted={hasGameStarted}
        winner={winner}
        timeControl={timeControl}
        viewNodeId={viewNodeId}
      />
      
      <svg className="board" height="100%" width="100%">
        {/* ... SVG Content ... */}
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
            <feOffset dx="-2" dy="-2" result="offsetblur" />
            <feFlood floodColor="rgba(0,0,0,0.5)" />
            <feComposite in2="offsetblur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        <HexGrid
          hexagons={hexagons}
          castles={castles}
          sanctuaries={sanctuaries}
          legalMoveSet={legalMoveSet}
          legalAttackSet={legalAttackSet}
          showCoordinates={showCoordinates}
          isBoardRotated={isBoardRotated}
          isAdjacentToControlledCastle={isRecruitmentSpot}
          onHexClick={handleBoardClick}
          onHexHover={handleHexHover}
          resizeVersion={resizeVersion}
          layout={initialLayout}
          board={initialBoard}
          isPledgeTarget={isPledgeTarget}
          pledgingSanctuary={pledgingSanctuary}
        />
        <PieceRenderer
          pieces={pieces}
          isBoardRotated={isBoardRotated}
          onPieceClick={handlePieceClick}
          resizeVersion={resizeVersion}
          layout={initialLayout}
        />
        {/* Legal move/attack dots rendered AFTER pieces so they appear on top */}
        <LegalMoveOverlay
          hexagons={hexagons}
          legalMoveSet={legalMoveSet}
          legalAttackSet={legalAttackSet}
          isBoardRotated={isBoardRotated}
          onHexClick={handleBoardClick}
          layout={initialLayout}
        />
      </svg>

      {!isOverlayDismissed && (
          <VictoryOverlay 
            victoryMessage={victoryMessage} 
            winner={winner} 
            onRestart={onRestart}
            onSetup={onSetup}
            onAnalyze={() => setOverlayDismissed(true)}
            onEnableAnalysis={handleEnterAnalysis}
          />
      )}

      {/* Ability Bar */}
      {movingPiece && !victoryMessage && (
          <AbilityBar
            movingPiece={movingPiece}
            activeAbility={activeAbility}
            onAbilitySelect={setActiveAbility}
          />
      )}
      
      {hoveredHex && sanctuaries && (
          (() => {
              const sanctuary = sanctuaries.find((s: Sanctuary) => s.hex.equals(hoveredHex));
              return sanctuary ? (
                  <SanctuaryTooltip 
                    sanctuary={sanctuary} 
                    position={mousePosition} 
                    turnCounter={turnCounter}
                  />
              ) : null;
          })()
      )}
    </>
  );
};

export default GameBoard;
