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
import { useInputHandler } from "../hooks/useInputHandler";
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
  initialTurnCounter?: number;
  initialSanctuaries?: Sanctuary[];
  onResign?: () => void; // Optional callback to parent (e.g. log event)
  onSetup?: () => void;
  onRestart?: () => void;
  onLoadGame?: (board: Board, pieces: Piece[], history: HistoryEntry[], moveHistory: MoveRecord[], turnCounter: number, sanctuaries: Sanctuary[]) => void;
  timeControl?: { initial: number, increment: number };
  analysisEnabled?: boolean;
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
  initialTurnCounter,
  initialSanctuaries,
  onResign = () => {},
  onSetup = () => {},
  onRestart = () => {},
  onLoadGame = () => {},
  timeControl,
  analysisEnabled = false,
  onEnableAnalysis = () => {}
}) => {
  const [isOverlayDismissed, setOverlayDismissed] = React.useState(false);
  const [hoveredHex, setHoveredHex] = React.useState<Hex | null>(null);
  const [pledgingSanctuary, setPledgingSanctuary] = React.useState<Hex | null>(null);
  const [activeAbility, setActiveAbility] = React.useState<"Fireball" | "Teleport" | "RaiseDead" | null>(null);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const [showRulesModal, setShowRulesModal] = React.useState(false);
    
  const {
    // State
    pieces,
    castles,
    sanctuaries,
    turnCounter, // Added
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
    moveTree,
    movingPiece,
    jumpToNode,
    history,

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
    viewMoveIndex,
    stepHistory,
    getPGN,
    loadPGN,
    triggerAbility
  } = useGameLogic(initialBoard, initialPieces, initialHistory, initialMoveHistory, initialTurnCounter, initialSanctuaries, analysisEnabled);

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
  const handleEnterAnalysis = React.useCallback(() => {
    if (onEnableAnalysis) {
      // If we have history, use the last snapshot's pieces (preserves pre-resign state)
      const analysisHistory = history || [];
      const analysisPieces = analysisHistory.length > 0 
        ? analysisHistory[analysisHistory.length - 1].pieces 
        : pieces;
      const analysisSanctuaries = analysisHistory.length > 0
        ? analysisHistory[analysisHistory.length - 1].sanctuaries
        : sanctuaries;
      const analysisTurnCounter = analysisHistory.length > 0
        ? analysisHistory[analysisHistory.length - 1].turnCounter
        : turnCounter;
      onEnableAnalysis(initialBoard, analysisPieces, analysisHistory, moveHistory || [], analysisTurnCounter, analysisSanctuaries);
    }
  }, [onEnableAnalysis, initialBoard, pieces, moveHistory, turnCounter, sanctuaries, history]);

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

  const onBoardHexClick = (hex: Hex) => {
      if (activeAbility && movingPiece) {
          // Validate Range
          const distance = movingPiece.hex.distance(hex);
          let valid = false;

          if (activeAbility === "Fireball") {
              // Range 2 (Wizard)
              if (distance <= 2 && distance > 0) valid = true;
          } else if (activeAbility === "Teleport") {
              // Range 3 (Wizard, self-teleport)
              if (distance <= 3 && distance > 0) valid = true;
          } else if (activeAbility === "RaiseDead") {
              // Range 1 (Necromancer)
              if (distance === 1) valid = true;
          }

          if (valid) {
              triggerAbility(movingPiece.hex, hex, activeAbility);
              setActiveAbility(null);
          } else {
              // Invalid target sound/visual?
              console.log("Invalid ability target");
              // setActiveAbility(null); // Keep mode active to retry? Or cancel.
              // Better UX: keep mode.
          }
          return;
      }

      // Normal Click
      handleHexClick(hex); // Delegate to engine logic
  };

  // Reset active ability if moving piece changes
  React.useEffect(() => {
      setActiveAbility(null);
  }, [movingPiece]);

  const handleHexClick = (hex: Hex) => {
    // 1. Pledging Interaction
    if (pledgingSanctuary) {
        if (hex.equals(pledgingSanctuary)) {
            setPledgingSanctuary(null);
            return;
        }
        // Attempt pledge
        // Check spawn hex is empty (no piece there)
        const isSpawnHexEmpty = !pieces.find(p => p.hex.equals(hex));
        if (canPledge(pledgingSanctuary) && hex.distance(pledgingSanctuary) === 1 && isSpawnHexEmpty) {
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
            onLoadGame(result.board, result.pieces, result.history, result.moveHistory, result.turnCounter, result.sanctuaries);
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
        isAnalysisEnabled={analysisEnabled}
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
        viewMoveIndex={viewMoveIndex}
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
          onHexClick={onBoardHexClick}
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
          onHexClick={onBoardHexClick}
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
