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
import { useAIOpponent, AIOpponentConfig } from "../hooks/useAIOpponent";
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
import { RuleEngine } from "../Classes/Systems/RuleEngine";
import { WinCondition } from "../Classes/Systems/WinCondition";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import AbilityBar from "./AbilityBar";
import { SanctuaryTooltip } from "./SanctuaryTooltip";
import { PieceTooltip } from "./PieceTooltip";
import { TerrainTooltip } from "./TerrainTooltip";
import QuickStartModal, { useQuickStart } from "./QuickStartModal";
import { PieceFactory } from "../Classes/Entities/PieceFactory";
import { HistoryEntry, MoveRecord, SanctuaryConfig, PieceTheme } from "../Constants";
import { createPieceMap } from "../utils/PieceMap";
import "../css/Board.css";

// SVG import for lightbulb
import lightbulbIcon from "../Assets/Images/misc/lightbulb.svg";

interface GameBoardProps {
  initialBoard?: Board;
  initialPieces?: Piece[];
  initialLayout?: LayoutService;
  initialHistory?: HistoryEntry[]; 
  initialMoveHistory?: MoveRecord[];
  initialMoveTree?: import('../Classes/Core/MoveTree').MoveTree;
  initialTurnCounter?: number;
  initialSanctuaries?: Sanctuary[];
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  onResign?: () => void; // Optional callback to parent (e.g. log event)
  onSetup?: () => void;
  onRestart?: () => void;
  onLoadGame?: (board: Board, pieces: Piece[], history: HistoryEntry[], moveHistory: MoveRecord[], turnCounter: number, sanctuaries: Sanctuary[], moveTree?: import('../Classes/Core/MoveTree').MoveTree) => void;
  onEditPosition?: (board?: Board, pieces?: Piece[], sanctuaries?: Sanctuary[]) => void;
  onTutorial?: () => void;
  timeControl?: { initial: number, increment: number };
  isAnalysisMode?: boolean;
  onEnableAnalysis?: (board: Board, pieces: Piece[], history: HistoryEntry[], moveHistory: MoveRecord[], turnCounter: number, sanctuaries: Sanctuary[]) => void;
  isTutorialMode?: boolean;
  initialPoolTypes?: import('../Constants').SanctuaryType[];
  pieceTheme?: PieceTheme;
  opponentConfig?: AIOpponentConfig;
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
  sanctuarySettings,
  gameRules,
  onResign = () => {},
  onSetup = () => {},
  onRestart = () => {},
  onLoadGame = () => {},
  onEditPosition,
  onTutorial,
  timeControl,
  isAnalysisMode = false,
  onEnableAnalysis = () => {},
  isTutorialMode = false,
  initialPoolTypes,
  pieceTheme = "Castles",
  opponentConfig
}) => {
  const [isOverlayDismissed, setOverlayDismissed] = React.useState(false);
  const [hoveredHex, setHoveredHex] = React.useState<Hex | null>(null);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const [showRulesModal, setShowRulesModal] = React.useState(false);
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);
  const [tooltipPiece, setTooltipPiece] = React.useState<Piece | null>(null);
  const [tooltipHex, setTooltipHex] = React.useState<Hex | null>(null);
  const [isSanctuaryPreview, setIsSanctuaryPreview] = React.useState(false);
  
  // Tooltip discovery hint (show once per browser)
  const [showTooltipHint, setShowTooltipHint] = React.useState(() => {
    return !localStorage.getItem('hasSeenTooltipHint');
  });
  
  const dismissTooltipHint = () => {
    localStorage.setItem('hasSeenTooltipHint', 'true');
    setShowTooltipHint(false);
  };
  
  // Quick Start modal for first-time users
  const [showQuickStart, dismissQuickStart] = useQuickStart();
  
  // Victory Points state (only used when VP mode is enabled)
  const [victoryPoints, setVictoryPoints] = React.useState<{ w: number, b: number } | undefined>(
    gameRules?.vpModeEnabled ? { w: 0, b: 0 } : undefined
  );
  
  // Track previous turn counter for VP calculation
  const prevTurnCounterRef = React.useRef(0);
  
  // Disable transitions after first render cycle to prevent "flying pieces" on resize
  React.useEffect(() => {
    const timer = setTimeout(() => setIsInitialLoad(false), 100);
    return () => clearTimeout(timer);
  }, []);
  
  // Sound effects hook - subscribes to game events
  useSoundEffects();
  
  // Get game logic first so we have gameEngine and state for AI hook
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
    board,
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
    triggerAbility,
    
    // AI Integration - controlled interface
    aiIntegration
  } = useGameLogic(initialBoard, initialPieces, initialHistory, initialMoveHistory, initialTurnCounter, initialSanctuaries, isAnalysisMode, initialMoveTree, sanctuarySettings, gameRules, isTutorialMode, initialPoolTypes);

  // Decoupled View State
  const { 
    showCoordinates, 
    isBoardRotated, 
    resizeVersion, 
    showShields,
    showCastleRecruitment,
    showTerrainIcons,
    showSanctuaryIcons,
    toggleCoordinates, 
    handleFlipBoard, 
    incrementResizeVersion,
    toggleShields,
    toggleCastleRecruitment,
    toggleTerrainIcons,
    toggleSanctuaryIcons,
    setAllIcons
  } = useGameView();

  // AI Opponent Integration - using controlled aiIntegration interface
  const { isAITurn } = useAIOpponent({
    enabled: opponentConfig?.type !== 'human' && opponentConfig?.type != null,
    opponentType: opponentConfig?.type ?? 'human',
    aiColor: opponentConfig?.aiColor ?? 'b',
    gameEngine: aiIntegration.gameEngine,
    board: aiIntegration.board,
    gameState: aiIntegration.getState(),
    onStateChange: aiIntegration.applyAIState,
    isViewingHistory: aiIntegration.isViewingHistory,
  });

  // Reset overlay when game restarts (victory message clears or changes)
  React.useEffect(() => {
    if (!victoryMessage) {
        setOverlayDismissed(false);
    }
  }, [victoryMessage]);

  // VP Accumulation: Award VP at the end of each round based on castle control
  React.useEffect(() => {
    if (!victoryPoints || !gameRules?.vpModeEnabled) return;
    
    // A round ends every 10 turn counter steps (both players complete their turns)
    const currentRound = Math.floor(turnCounter / 10);
    const prevRound = Math.floor(prevTurnCounterRef.current / 10);
    
    // Only accumulate VP when entering a new round
    if (currentRound > prevRound && currentRound > 0) {
      const whiteGain = WinCondition.calculateVPGain(castles, 'w');
      const blackGain = WinCondition.calculateVPGain(castles, 'b');
      
      if (whiteGain > 0 || blackGain > 0) {
        setVictoryPoints(prev => prev ? {
          w: prev.w + whiteGain,
          b: prev.b + blackGain
        } : undefined);
      }
    }
    
    prevTurnCounterRef.current = turnCounter;
  }, [turnCounter, castles, victoryPoints, gameRules?.vpModeEnabled]);

  // Handle New Game
  // If game is in progress (and not in analysis/finished), ask for confirmation
  const handleNewGame = () => {
    // Conditions where we can instantly reset:
    // 1. Game hasn't started
    // 2. Someone has won
    // 3. We are in analysis mode
    const safeToReset = !hasGameStarted || winner || isAnalysisMode;

    if (safeToReset) {
      onSetup();
    } else {
      if (window.confirm("Current game is in progress. Abandon and start a new game?")) {
        onSetup();
      }
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
    handleBoardClick: onEngineBoardClick,
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
    board,
  });

  const handleBoardClick = (hex: Hex) => {
    if (tooltipPiece) setTooltipPiece(null);
    if (tooltipHex) setTooltipHex(null);
    onEngineBoardClick(hex);
  };

  useInputHandler({
    onPass: handlePass,
    onFlipBoard: handleFlipBoard,
    onTakeback: handleTakeback,
    onResize: incrementResizeVersion,
    onNavigate: stepHistory,
    onNewGame: handleNewGame,
    isNewGameEnabled: !hasGameStarted || !!winner,
  });

  // Calculate viewBox for auto-scaling (always enabled for consistent sizing)
  const viewBox = React.useMemo(() => {
    return initialLayout.calculateViewBox();
  }, [initialLayout]);

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

  const handlePieceClickWrapper = (piece: Piece) => {
    if (activeAbility) {
        handleBoardClick(piece.hex);
    } else {
        handlePieceClick(piece);
    }
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
        onEditPosition={onEditPosition ? () => onEditPosition(initialBoard, pieces, sanctuaries) : undefined}
        onTutorial={onTutorial}
        isAnalysisMode={isAnalysisMode}
        onToggleShields={toggleShields}
        onToggleCastleRecruitment={toggleCastleRecruitment}
        onToggleTerrainIcons={toggleTerrainIcons}
        onToggleSanctuaryIcons={toggleSanctuaryIcons}
        onSetAllIcons={setAllIcons}
        showShields={showShields}
        showCastleRecruitment={showCastleRecruitment}
        showTerrainIcons={showTerrainIcons}
        showSanctuaryIcons={showSanctuaryIcons}
        showCoordinates={showCoordinates}
      />

      <RulesModal 
        isOpen={showRulesModal} 
        onClose={() => setShowRulesModal(false)} 
      />

      {/* Game Panel (Right Side) - Hidden in tutorial mode */}
      {!isTutorialMode && (
        <ControlPanel
          currentPlayer={currentPlayer}
          turnPhase={turnPhase}
          turnCounter={turnCounter}
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
          victoryPoints={victoryPoints}
        />
      )}
      {/* Board Container - takes remaining space after control panel */}
      <div style={{ 
        position: 'absolute',
        top: 0,
        left: 0,
        width: isTutorialMode ? '100%' : 'calc(100vw - 300px)',
        height: '100vh',
        overflow: 'hidden'
      }}
      onClick={() => {
        // Dismiss tooltips when clicking anywhere on the board
        if (tooltipPiece) setTooltipPiece(null);
        if (tooltipHex) setTooltipHex(null);
      }}
      >
        <svg 
          className={`board ${isInitialLoad ? 'no-transition' : ''}`} 
          width="100%"
          height="100%"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
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
          onHexRightClick={(hex) => {
            setTooltipPiece(null);
            setIsSanctuaryPreview(false);
            const sanctuary = sanctuaries.find(s => s.hex.equals(hex));
            if (sanctuary) {
              const pieceType = SanctuaryConfig[sanctuary.type].pieceType;
              const dummyPiece = PieceFactory.create(pieceType, hex, currentPlayer);
              setTooltipPiece(dummyPiece);
              setIsSanctuaryPreview(true);
              setTooltipHex(null);
            } else {
              setTooltipHex(hex === tooltipHex ? null : hex);
            }
          }}
          onHexHover={handleHexHover}
          resizeVersion={resizeVersion}
          layout={initialLayout}
          board={board}
          isPledgeTarget={isPledgeTarget}
          pledgingSanctuary={pledgingSanctuary}
          showCastleRecruitment={showCastleRecruitment}
          showTerrainIcons={showTerrainIcons}
          showSanctuaryIcons={showSanctuaryIcons}
        />
        <PieceRenderer
          pieces={pieces}
          isBoardRotated={isBoardRotated}
          onPieceClick={handlePieceClickWrapper}
          onPieceRightClick={(piece) => {
            setTooltipHex(null);
            setTooltipPiece(piece === tooltipPiece ? null : piece);
          }}
          resizeVersion={resizeVersion}
          layout={initialLayout}
          board={board}
          showShields={showShields}
          pieceTheme={pieceTheme}
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
      </div>

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
                    sanctuarySettings={sanctuarySettings}
                  />
              ) : null;
          })()
      )}

      {/* Piece info tooltip (right-click on a piece) */}
      {tooltipPiece && (
        <PieceTooltip 
          piece={tooltipPiece} 
          isDefended={RuleEngine.isHexDefended(
            tooltipPiece.hex, 
            tooltipPiece.color === 'w' ? 'b' : 'w', 
            { pieces, pieceMap: createPieceMap(pieces) } as any, 
            board
          )}
          isPreview={isSanctuaryPreview}
        />
      )}

      {/* Terrain info tooltip (right-click on empty hex) */}
      {tooltipHex && (
        <TerrainTooltip 
          hex={tooltipHex} 
          board={board} 
          castle={castles.find(c => c.hex.equals(tooltipHex))}
          position={mousePosition} 
        />
      )}
      
      {/* Tooltip Discovery Hint Banner */}
      {showTooltipHint && (
        <div className="tooltip-hint-banner">
          <img src={lightbulbIcon} alt="" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginRight: '4px', filter: 'invert(1)' }} /> Tip: Right-click any piece or hex for detailed information!
          <button className="hint-dismiss-btn" onClick={dismissTooltipHint}>
            Got it
          </button>
        </div>
      )}
      
      {/* Quick Start Modal for first-time users */}
      {showQuickStart && (
        <QuickStartModal onClose={dismissQuickStart} />
      )}
    </>
  );
};

export default GameBoard;
