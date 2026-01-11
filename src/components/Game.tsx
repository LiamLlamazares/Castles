/**
 * @file Game.tsx
 * @description Main game board component for the Castles game.
 *
 * Refactored to compose focused sub-components.
 */
import React from 'react';
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useInputHandler } from "../hooks/useInputHandler";
import { useGameView } from "../hooks/useGameView";
import { useAIOpponent, AIOpponentConfig } from "../hooks/useAIOpponent";
import { usePersistence } from "../hooks/usePersistence";
import { useTooltip } from "../hooks/useTooltip";
import ControlPanel from "./ControlPanel";
import HamburgerMenu from "./HamburgerMenu";
import { BoardContainer } from "./Board/BoardContainer";
import { GameHUD } from "./HUD/GameHUD";
import { GameOverlays } from "./Overlays/GameOverlays";
import { Board } from "../Classes/Core/Board";
import { Piece } from "../Classes/Entities/Piece";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { startingLayout, startingBoard, allPieces } from "../ConstantImports";
import { WinCondition } from "../Classes/Systems/WinCondition";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { PieceTheme } from "../Constants";
import "../css/Board.css";

// Context
import { GameProvider } from "../contexts/GameProvider";
import { useGameState, useGameActions } from "../contexts/GameContext";

interface GameBoardProps {
  initialBoard?: Board;
  initialPieces?: Piece[];
  initialLayout?: LayoutService;
  initialMoveTree?: import('../Classes/Core/MoveTree').MoveTree;
  initialTurnCounter?: number;
  initialSanctuaries?: Sanctuary[];
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  onResign?: () => void; 
  onSetup?: () => void;
  onRestart?: () => void;
  onLoadGame?: (data: {
    board: Board, 
    pieces: Piece[], 
    turnCounter: number, 
    sanctuaries: Sanctuary[], 
    moveTree?: import('../Classes/Core/MoveTree').MoveTree,
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    initialPoolTypes?: import('../Constants').SanctuaryType[]
  }) => void;
  onEditPosition?: (board?: Board, pieces?: Piece[], sanctuaries?: Sanctuary[]) => void;
  onTutorial?: () => void;
  timeControl?: { initial: number, increment: number };
  isAnalysisMode?: boolean;
  onEnableAnalysis?: (board: Board, pieces: Piece[], turnCounter: number, sanctuaries: Sanctuary[]) => void;
  isTutorialMode?: boolean;
  initialPoolTypes?: import('../Constants').SanctuaryType[];
  pieceTheme?: PieceTheme;
  opponentConfig?: AIOpponentConfig;
}

/**
 * Inner Game Component that consumes the GameContext.
 */
const InnerGame: React.FC<GameBoardProps> = ({
  initialBoard = startingBoard,
  initialPieces = allPieces,
  initialLayout = startingLayout,
  initialMoveTree,
  initialTurnCounter = 0,
  sanctuarySettings,
  gameRules,
  onResign = () => {},
  onSetup = () => {},
  onRestart = () => {},
  onLoadGame,
  onEditPosition,
  onTutorial,
  timeControl,
  onEnableAnalysis = () => {},
  isTutorialMode = false,
  pieceTheme = "Castles",
  opponentConfig
}) => {
  const [isOverlayDismissed, setOverlayDismissed] = React.useState(false);
  const [showRulesModal, setShowRulesModal] = React.useState(false);
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);
  const [showQuickStart, setShowQuickStart] = React.useState(false);
  const [showTooltipHint, setShowTooltipHint] = React.useState(false);

  // Consolidated tooltip state
  const tooltip = useTooltip();

  // Consume Contexts
  const {
      pieces,
      castles,
      sanctuaries,
      turnCounter,
      turnPhase,
      currentPlayer,
      moveHistory,
      moveTree,
      hasGameStarted,
      isAnalysisMode,
      viewNodeId,
      aiIntegration,
      victoryMessage,
      winner
  } = useGameState();

  const {
      handlePass,
      handleTakeback,
      handleResign,
      jumpToNode,
      stepHistory,
      getPGN,
      loadPGN
  } = useGameActions();

  // Persistence Hooks
  const { shareGame, getGameFromUrl, loadFromLocalStorage, clearUrlParams, clearSave } = usePersistence(getPGN, loadPGN, moveTree);

  // Restore game logic from old Game.tsx
  React.useEffect(() => {
    // 1. Check URL for shared game
    const urlPgn = getGameFromUrl();
    if (urlPgn) {
      try {
        const result = loadPGN(urlPgn);
        if (result && onLoadGame) {
          if (urlPgn === getPGN()) {
            clearUrlParams();
            return;
          }
          clearUrlParams();
          onLoadGame({
            board: result.board,
            pieces: result.pieces,
            turnCounter: result.turnCounter,
            sanctuaries: result.sanctuaries,
            moveTree: result.moveTree,
            sanctuarySettings: result.sanctuarySettings,
            initialPoolTypes: result.sanctuaryPool
          });
          return; 
        }
      } catch (e) {
        console.warn("Failed to load shared game from URL", e);
      }
    }

    const isBeginning = turnCounter === 0 && (!moveTree || moveTree.getHistoryLine().length === 0);
    
    if (isBeginning) {
      const savedPgn = loadFromLocalStorage();
      const currentPgn = getPGN();
      
      if (savedPgn && savedPgn !== currentPgn) {
        try {
          const result = loadPGN(savedPgn);
          if (result && onLoadGame) {
            onLoadGame({
              board: result.board,
              pieces: result.pieces,
              turnCounter: result.turnCounter,
              sanctuaries: result.sanctuaries,
              moveTree: result.moveTree,
              sanctuarySettings: result.sanctuarySettings,
              initialPoolTypes: result.sanctuaryPool
            });
          }
        } catch (e) {
          console.warn("Failed to load saved game from localStorage", e);
        }
      }
    }
  }, []); // Run once on mount

  // Victory Points (only used when VP mode is enabled)
  const [victoryPoints, setVictoryPoints] = React.useState<{ w: number, b: number } | undefined>(
    gameRules?.vpModeEnabled ? { w: 0, b: 0 } : undefined
  );
  
  // Track previous turn counter for VP calculation
  const prevTurnCounterRef = React.useRef(0);
  
  // Disable transitions after first render cycle
  React.useEffect(() => {
    const timer = setTimeout(() => setIsInitialLoad(false), 100);
    return () => clearTimeout(timer);
  }, []);
  
  useSoundEffects();
  
  // Decoupled View State
  const viewState = useGameView();

  // AI Integration
  const aiIntegrationSafe = aiIntegration ? {
    gameEngine: aiIntegration.gameEngine,
    board: aiIntegration.board,
    gameState: aiIntegration.getState(),
    onStateChange: aiIntegration.applyAIState,
    isViewingHistory: aiIntegration.isViewingHistory,
  } : undefined;

  useAIOpponent({
    enabled: opponentConfig?.type !== 'human' && opponentConfig?.type != null,
    opponentType: opponentConfig?.type ?? 'human',
    aiColor: opponentConfig?.aiColor ?? 'b',
    gameEngine: aiIntegrationSafe?.gameEngine!, 
    board: aiIntegrationSafe?.board!,
    gameState: aiIntegrationSafe?.gameState!,
    onStateChange: aiIntegrationSafe?.onStateChange!,
    isViewingHistory: aiIntegrationSafe?.isViewingHistory,
  });

  // Reset overlay when game restarts
  React.useEffect(() => {
    if (!victoryMessage) {
        setOverlayDismissed(false);
    }
  }, [victoryMessage]);

  // VP Accumulation
  React.useEffect(() => {
    if (!victoryPoints || !gameRules?.vpModeEnabled) return;
    const currentRound = Math.floor(turnCounter / 10);
    const prevRound = Math.floor(prevTurnCounterRef.current / 10);
    
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

  const handleNewGame = () => {
    const safeToReset = !hasGameStarted || winner || isAnalysisMode;

    if (safeToReset) {
      clearSave();
      clearUrlParams();
      onSetup();
    } else {
      if (window.confirm("Current game is in progress. Abandon and start a new game?")) {
        clearSave();
        clearUrlParams();
        onSetup();
      }
    }
  };

  const handleEnterAnalysis = React.useCallback(() => {
    const pgn = getPGN();
    const result = loadPGN(pgn);
    if (result && onLoadGame) {
      onLoadGame({
        board: result.board,
        pieces: result.pieces,
        turnCounter: result.turnCounter,
        sanctuaries: result.sanctuaries,
        moveTree: result.moveTree,
        sanctuarySettings: result.sanctuarySettings,
        initialPoolTypes: result.sanctuaryPool
      });
    }
  }, [getPGN, loadPGN, onLoadGame]);

  useInputHandler({
    onPass: handlePass,
    onFlipBoard: viewState.handleFlipBoard,
    onTakeback: handleTakeback,
    onResize: viewState.incrementResizeVersion,
    onNavigate: stepHistory,
    onNewGame: handleNewGame,
    isNewGameEnabled: !hasGameStarted || !!winner,
  });

  const handleImportPGN = () => {
    const pgn = prompt("Paste PGN here:");
    if (pgn) {
        const result = loadPGN(pgn);
        if (result && onLoadGame) {
            onLoadGame({
              board: result.board,
              pieces: result.pieces,
              turnCounter: result.turnCounter,
              sanctuaries: result.sanctuaries,
              moveTree: result.moveTree,
              sanctuarySettings: result.sanctuarySettings,
              initialPoolTypes: result.sanctuaryPool
            });
        } else {
            alert("Failed to load PGN. Check console for details.");
        }
    }
  };

  const handleExportPGN = () => {
    const pgn = getPGN();
    navigator.clipboard.writeText(pgn).then(() => alert("PGN copied to clipboard!"));
  };

  const dismissQuickStart = () => setShowQuickStart(false);
  const dismissTooltipHint = () => setShowTooltipHint(false);

  const [activeAbility, setActiveAbility] = React.useState<import('../Constants').AbilityType | null>(null);

  return (
    <>
      <HamburgerMenu
        onExportPGN={handleExportPGN}
        onImportPGN={handleImportPGN}
        onFlipBoard={viewState.handleFlipBoard}
        onToggleCoordinates={viewState.toggleCoordinates}
        onShowRules={() => setShowRulesModal(true)}
        onEnableAnalysis={handleEnterAnalysis}
        onEditPosition={onEditPosition ? () => onEditPosition(initialBoard, pieces, sanctuaries) : undefined}
        onTutorial={onTutorial}
        isAnalysisMode={isAnalysisMode}
        onToggleShields={viewState.toggleShields}
        onToggleCastleRecruitment={viewState.toggleCastleRecruitment}
        onToggleTerrainIcons={viewState.toggleTerrainIcons}
        onToggleSanctuaryIcons={viewState.toggleSanctuaryIcons}
        onSetAllIcons={viewState.setAllIcons}
        showShields={viewState.showShields}
        showCastleRecruitment={viewState.showCastleRecruitment}
        showTerrainIcons={viewState.showTerrainIcons}
        showSanctuaryIcons={viewState.showSanctuaryIcons}
        showCoordinates={viewState.showCoordinates}
      />

      <GameOverlays 
        showRules={showRulesModal}
        onCloseRules={() => setShowRulesModal(false)}
        victoryMessage={victoryMessage}
        winner={winner}
        isOverlayDismissed={isOverlayDismissed}
        onDismissOverlay={() => setOverlayDismissed(true)}
        onRestart={onRestart}
        onSetup={onSetup}
        onEnableAnalysis={handleEnterAnalysis}
        showQuickStart={showQuickStart}
        onCloseQuickStart={dismissQuickStart}
        showTooltipHint={showTooltipHint}
        onDismissTooltipHint={dismissTooltipHint}
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
          onShare={shareGame}
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
      
      {/* Board Container */}
      <BoardContainer 
        layout={initialLayout}
        pieceTheme={pieceTheme || "Castles"}
        isInitialLoad={isInitialLoad}
        tooltip={tooltip}
        viewState={viewState}
        onActiveAbilityChange={setActiveAbility}
        containerStyle={{
          position: 'relative', // Override absolute
          float: 'left',
          width: isTutorialMode ? '100%' : 'calc(100vw - 300px)',
        }}
      />

      <GameHUD 
        tooltip={tooltip}
        activeAbility={activeAbility}
        onAbilitySelect={setActiveAbility}
        sanctuarySettings={sanctuarySettings}
      />
    </>
  );
};

const GameBoard: React.FC<GameBoardProps> = (props) => {
  return (
    <GameProvider
      config={{
        board: props.initialBoard,
        pieces: props.initialPieces,
        turnCounter: props.initialTurnCounter,
        sanctuaries: props.initialSanctuaries,
        moveTree: props.initialMoveTree,
        poolTypes: props.initialPoolTypes,
      }}
      rules={{
        sanctuarySettings: props.sanctuarySettings,
        vpModeEnabled: props.gameRules?.vpModeEnabled,
      }}
      mode={{
        isAnalysisMode: props.isAnalysisMode,
        isTutorialMode: props.isTutorialMode,
      }}
    >
      <InnerGame {...props} />
    </GameProvider>
  );
};

export default GameBoard;
