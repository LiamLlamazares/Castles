import React from 'react';
import { useGameLogic } from "../hooks/useGameLogic";
import { useInputHandler } from "../hooks/useInputHandler";
import HexGrid from "./HexGrid";
import PieceRenderer from "./PieceRenderer";
import ControlPanel from "./ControlPanel";
import HamburgerMenu from "./HamburgerMenu";
import VictoryOverlay from "./VictoryOverlay";
import { Board } from "../Classes/Core/Board";
import { Piece } from "../Classes/Entities/Piece";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { startingLayout, startingBoard, allPieces } from "../ConstantImports";
import { Hex } from "../Classes/Entities/Hex";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { SanctuaryTooltip } from "./SanctuaryTooltip";
import "../css/Board.css";

interface GameBoardProps {
  initialBoard?: Board;
  initialPieces?: Piece[];
  initialLayout?: LayoutService;
  initialHistory?: any[]; // using any[] to avoid circular dependency hell or import issues, typed in useGameLogic
  initialMoveHistory?: any[];
  initialTurnCounter?: number;
  onResign?: () => void; // Optional callback to parent (e.g. log event)
  onSetup?: () => void;
  onRestart?: () => void;
  onLoadGame?: (board: Board, pieces: Piece[], history: any[], moveHistory: any[], turnCounter: number) => void;
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
  initialTurnCounter,
  onResign = () => {},
  onSetup = () => {},
  onRestart = () => {},
  onLoadGame = () => {}
}) => {
  const [isOverlayDismissed, setOverlayDismissed] = React.useState(false);
  const [hoveredHex, setHoveredHex] = React.useState<Hex | null>(null);
  const [pledgingSanctuary, setPledgingSanctuary] = React.useState<Hex | null>(null);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
    
  const {
    // State
    pieces,
    castles,
    sanctuaries,
    showCoordinates,
    isBoardRotated,
    resizeVersion,
    
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
    movingPiece,

    // Actions
    handlePass,
    handleTakeback,
    handleFlipBoard,
    toggleCoordinates,
    incrementResizeVersion,
    handlePieceClick,
    handleHexClick: onEngineHexClick,
    handleResign,
    hasGameStarted,
    pledge,
    canPledge,
    
    // Analysis
    isAnalysisMode,
    stepHistory,
    getPGN,
    loadPGN
  } = useGameLogic(initialBoard, initialPieces, initialHistory, initialMoveHistory, initialTurnCounter);

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

  const handleHexHover = React.useCallback((hex: Hex | null, event?: React.MouseEvent) => {
    setHoveredHex(hex);
    if (event) {
        setMousePosition({ x: event.clientX, y: event.clientY });
    }
  }, []);

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

  // Interaction Handlers
  const handleHexClick = (hex: Hex) => {
    // 1. Pledging Interaction
    if (pledgingSanctuary) {
        if (hex.equals(pledgingSanctuary)) {
            setPledgingSanctuary(null);
            return;
        }
        // Attempt pledge
        if (canPledge(pledgingSanctuary) && hex.distance(pledgingSanctuary) === 1) {
            try {
                pledge(pledgingSanctuary, hex);
                setPledgingSanctuary(null);
                return;
            } catch (e) {
                console.warn("Pledge failed:", e);
            }
        }
        setPledgingSanctuary(null); // Cancel if clicking elsewhere but fallthrough
    }

    // 2. Sanctuary Selection (Enter Pledge Mode)
    // Only if NOT currently moving a piece (engine state)
    if (!movingPiece) {
        // Find sanctuary at clicked hex
        const clickedSanctuary = sanctuaries && sanctuaries.find((s: Sanctuary) => s.hex.equals(hex));
        if (clickedSanctuary && canPledge(hex)) {
            setPledgingSanctuary(hex);
            return;
        }
    }

    // 3. Delegate to Engine
    onEngineHexClick(hex);
  };

  const isPledgeTarget = React.useCallback((hex: Hex) => {
      if (!pledgingSanctuary) return false;
      return hex.distance(pledgingSanctuary) === 1;
  }, [pledgingSanctuary]);

  const handleImportPGN = () => {
    const pgn = prompt("Paste PGN here:");
    if (pgn) {
        const result = loadPGN(pgn);
        if (result && onLoadGame) {
            onLoadGame(result.board, result.pieces, result.history, result.moveHistory, result.turnCounter);
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
        hasGameStarted={hasGameStarted}
        winner={winner}
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
          onHexClick={handleHexClick}
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
      </svg>

      {!isOverlayDismissed && (
          <VictoryOverlay 
            victoryMessage={victoryMessage} 
            winner={winner} 
            onRestart={onRestart}
            onSetup={onSetup}
            onAnalyze={() => setOverlayDismissed(true)}
          />
      )}
      
      {hoveredHex && sanctuaries && (
          (() => {
              const sanctuary = sanctuaries.find((s: Sanctuary) => s.hex.equals(hoveredHex));
              return sanctuary ? (
                  <SanctuaryTooltip 
                    sanctuary={sanctuary} 
                    position={mousePosition} 
                  />
              ) : null;
          })()
      )}
    </>
  );
};

export default GameBoard;
