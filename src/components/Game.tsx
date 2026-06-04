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
import { MoveNode, MoveTree } from "../Classes/Core/MoveTree";
import type { PositionSnapshot } from "../Classes/Core/GameState";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { startingLayout, startingBoard, allPieces } from "../ConstantImports";
import { WinCondition } from "../Classes/Systems/WinCondition";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { PhoenixRecord } from "../Classes/Core/GameState";
import { PieceTheme } from "../Constants";
import type { OnlineClientSession } from "../online/types";
import type {
  OnlineGameVisibility,
  OnlinePlayerSettableGameVisibility,
} from "../online/visibility";
import {
  copyOnlineInviteUrl,
  formatOnlineConnectionStatus,
  formatOnlineGameResult,
} from "../online/client";
import type { PGNLoadResult } from "../Classes/Services/PGNLoadService";
import { SavedGameStatus } from "../Classes/Services/GameLibraryRepository";
import { createPieceMap } from "../utils/PieceMap";
import PromotionModal from "./PromotionModal";
import type { TutorialGameEvent } from "../tutorial/types";
import {
  buildTutorialGameEventFromMove,
  type TutorialEventSnapshot,
} from "../tutorial/eventMetadata";
import TurnBanner from "./Turn_banner";
import "../css/Board.css";

// Context
import { GameProvider } from "../contexts/GameProvider";
import { useGameState, useGameActions } from "../contexts/GameContext";

export type SaveGameToLibraryResult =
  | boolean
  | void
  | {
      saved: boolean;
      message?: string;
    };

interface GameBoardProps {
  initialBoard?: Board;
  initialPieces?: Piece[];
  initialCastles?: Castle[];
  initialLayout?: LayoutService;
  initialMoveTree?: import('../Classes/Core/MoveTree').MoveTree;
  initialTurnCounter?: number;
  initialSanctuaries?: Sanctuary[];
  initialGraveyard?: Piece[];
  initialPhoenixRecords?: PhoenixRecord[];
  initialPromotionPending?: Piece | null;
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  onResign?: () => void;
  onSetup?: () => void;
  onRestart?: () => void;
  onRematch?: () => void;
  rematchLabel?: string;
  onLoadGame?: (data: {
    board: Board,
    pieces: Piece[],
    castles?: Castle[],
    turnCounter: number,
    sanctuaries: Sanctuary[],
    moveTree?: import('../Classes/Core/MoveTree').MoveTree,
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    initialPoolTypes?: import('../Constants').SanctuaryType[],
    graveyard?: Piece[],
    phoenixRecords?: PhoenixRecord[],
    promotionPending?: Piece | null,
    gameRules?: { vpModeEnabled: boolean },
    pieceTheme?: PieceTheme,
    timeControl?: { initial: number, increment: number },
    victoryPoints?: { w: number; b: number }
  }, options?: { source?: "analysis" | "import" | "library" }) => void;
  onEditPosition?: (board?: Board, pieces?: Piece[], sanctuaries?: Sanctuary[]) => void;
  onTutorial?: () => void;
  onOpenLibrary?: () => void;
  onOpenOnlineBrowser?: () => void;
  onReturnFromAnalysis?: () => void;
  analysisReturnLabel?: string;
  onSaveGameToLibrary?: (pgn: string, status: SavedGameStatus) => Promise<SaveGameToLibraryResult> | SaveGameToLibraryResult;
  timeControl?: { initial: number, increment: number };
  isAnalysisMode?: boolean;
  isTutorialMode?: boolean;
  initialPoolTypes?: import('../Constants').SanctuaryType[];
  pieceTheme?: PieceTheme;
  opponentConfig?: AIOpponentConfig;
  onlineSession?: OnlineClientSession;
  initialVictoryPoints?: { w: number; b: number };
  showNavigationMenu?: boolean;
  showTooltipHint?: boolean;
  onTutorialEvent?: (event: TutorialGameEvent) => void;
}

function moveTreeHasCompleteSnapshots(tree: MoveTree): boolean {
  if (!tree.rootNode.snapshot) return false;

  const nodeHasSnapshots = (node: MoveNode): boolean =>
    node.children.every((child) => !!child.snapshot && nodeHasSnapshots(child));

  return nodeHasSnapshots(tree.rootNode);
}

function createCurrentPositionAnalysisTree(snapshot: PositionSnapshot): MoveTree {
  const tree = new MoveTree();
  tree.rootNode.snapshot = snapshot;
  return tree;
}

function isUsablePGNLoadResult(result: PGNLoadResult | null): result is PGNLoadResult {
  return !!result && (!result.diagnostics || result.diagnostics.length === 0);
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
  onRematch,
  rematchLabel,
  onLoadGame,
  onEditPosition,
  onTutorial,
  onOpenLibrary,
  onOpenOnlineBrowser,
  onReturnFromAnalysis,
  analysisReturnLabel,
  onSaveGameToLibrary,
  timeControl,
  isTutorialMode = false,
  initialVictoryPoints,
  pieceTheme = "Castles",
  opponentConfig,
  onlineSession,
  showNavigationMenu = true,
  showTooltipHint: shouldShowTooltipHint = true,
  onTutorialEvent
}) => {
  const [isOverlayDismissed, setOverlayDismissed] = React.useState(false);
  const [showRulesModal, setShowRulesModal] = React.useState(false);
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);
  const [showQuickStart, setShowQuickStart] = React.useState(false);
  const [showTooltipHint, setShowTooltipHint] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [lastLibrarySavedPgn, setLastLibrarySavedPgn] = React.useState<string | null>(null);
  const [isNavigationMenuOpen, setNavigationMenuOpen] = React.useState(false);
  const [onlineVisibilityOverride, setOnlineVisibilityOverride] =
    React.useState<OnlineGameVisibility | null>(null);
  const [isOnlineVisibilityPending, setOnlineVisibilityPending] = React.useState(false);
  const [newGameConfirmation, setNewGameConfirmation] = React.useState<{
    title: string;
    message: string;
  } | null>(null);
  const statusTimeoutRef = React.useRef<number | null>(null);
  const shellRef = React.useRef<HTMLDivElement>(null);
  const confirmDialogRef = React.useRef<HTMLElement>(null);
  const keepPlayingButtonRef = React.useRef<HTMLButtonElement>(null);
  const focusBeforeDialogRef = React.useRef<HTMLElement | null>(null);
  const lastOnlineGameIdRef = React.useRef<string | null | undefined>(undefined);
  const lastTutorialMoveSignatureRef = React.useRef("");
  const tutorialSnapshotRef = React.useRef<TutorialEventSnapshot | null>(null);

  const showStatusMessage = React.useCallback((message: string) => {
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    setStatusMessage(message);
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatusMessage(null);
      statusTimeoutRef.current = null;
    }, 4_000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (statusTimeoutRef.current !== null) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const backgroundChildren = Array.from(shell.children).filter(
      (child) => !child.classList.contains("confirm-dialog-backdrop")
    );

    if (newGameConfirmation) {
      backgroundChildren.forEach((child) => {
        child.setAttribute("inert", "");
        child.setAttribute("aria-hidden", "true");
      });
      return () => {
        backgroundChildren.forEach((child) => {
          child.removeAttribute("inert");
          child.removeAttribute("aria-hidden");
        });
      };
    }

    backgroundChildren.forEach((child) => {
      child.removeAttribute("inert");
      child.removeAttribute("aria-hidden");
    });
  }, [newGameConfirmation]);

  React.useEffect(() => {
    if (!newGameConfirmation) return;
    if (!focusBeforeDialogRef.current || !document.contains(focusBeforeDialogRef.current)) {
      focusBeforeDialogRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    keepPlayingButtonRef.current?.focus();
  }, [newGameConfirmation]);

  // Consolidated tooltip state
  const tooltip = useTooltip();

  // Consume Contexts
  const {
      pieces,
      board,
      castles,
      sanctuaries,
      sanctuaryPool,
      graveyard,
      phoenixRecords,
      victoryPoints: viewedVictoryPoints,
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
      winner,
      promotionPending
  } = useGameState();

  const {
      handlePass,
      handleTakeback,
      handleResign,
      handlePromotion,
      jumpToNode,
      stepHistory,
      getPGN,
      loadPGN
  } = useGameActions();

  // Persistence Hooks
  const { shareGame, getGameFromUrl, loadFromLocalStorage, clearUrlParams, clearSave } = usePersistence(getPGN, loadPGN, moveTree);
  const isReadOnlyOnline = onlineSession?.role === "spectator";
  const isOnlineActionPaused =
    onlineSession?.role === "player" &&
    (onlineSession.status !== "connected" || onlineSession.isActionPending === true);

  React.useEffect(() => {
    if (isTutorialMode || onlineSession || isAnalysisMode) {
      return;
    }

    try {
      if (!localStorage.getItem("hasSeenQuickStart")) {
        setShowQuickStart(true);
      }
    } catch (error) {
      console.error("Failed to read quick-start preference", error);
      setShowQuickStart(true);
    }
  }, [isAnalysisMode, isTutorialMode, onlineSession]);

  const copyOnlineLink = React.useCallback((url: string, successMessage: string) => {
    copyOnlineInviteUrl(url)
      .then(() => showStatusMessage(successMessage))
      .catch((error) => {
        console.error("Failed to copy online link", error);
        showStatusMessage("Could not copy the link. Try again from a secure browser session.");
      });
  }, [showStatusMessage]);
  const handleShare = React.useCallback(() => {
    shareGame();
  }, [shareGame]);
  const handleCopyOpponentInvite = React.useCallback(() => {
    if (onlineSession?.role !== "player" || !onlineSession.opponentInviteUrl) return;
    copyOnlineLink(onlineSession.opponentInviteUrl, "Opponent invite link copied.");
  }, [copyOnlineLink, onlineSession]);
  const handleCopySpectator = React.useCallback(() => {
    if (!onlineSession?.spectatorUrl) return;
    copyOnlineLink(onlineSession.spectatorUrl, "Spectator link copied.");
  }, [copyOnlineLink, onlineSession]);
  const currentOnlineVisibility =
    onlineSession?.role === "player"
      ? onlineVisibilityOverride ?? onlineSession.visibility ?? "unlisted"
      : onlineSession?.visibility;
  const handleUpdateOnlineVisibility = React.useCallback(
    (visibility: OnlinePlayerSettableGameVisibility) => {
      if (onlineSession?.role !== "player" || !onlineSession.updateVisibility) return;
      setOnlineVisibilityPending(true);
      onlineSession
        .updateVisibility(visibility)
        .then((summary) => {
          setOnlineVisibilityOverride(summary.visibility);
          showStatusMessage(
            summary.visibility === "public"
              ? "Game published to Watch."
              : "Game removed from Watch."
          );
        })
        .catch((error) => {
          console.error("Failed to update online game visibility", error);
          showStatusMessage("Could not update game visibility.");
        })
        .finally(() => {
          setOnlineVisibilityPending(false);
        });
    },
    [onlineSession, showStatusMessage]
  );

  React.useEffect(() => {
    setOnlineVisibilityOverride(null);
  }, [onlineSession?.gameId]);

  // Restore game logic from old Game.tsx
  React.useEffect(() => {
    if (onlineSession) {
      return;
    }

    // 1. Check URL for shared game
    const urlPgn = getGameFromUrl();
    if (urlPgn) {
      if (urlPgn === getPGN()) {
        clearUrlParams();
        return;
      }

      try {
        const result = loadPGN(urlPgn);
        if (isUsablePGNLoadResult(result) && onLoadGame) {
          clearUrlParams();
          onLoadGame({
            board: result.board,
            pieces: result.pieces,
            castles: result.castles,
            turnCounter: result.turnCounter,
            sanctuaries: result.sanctuaries,
            moveTree: result.moveTree,
            sanctuarySettings: result.sanctuarySettings,
            initialPoolTypes: result.sanctuaryPool,
            graveyard: result.graveyard,
            phoenixRecords: result.phoenixRecords,
            promotionPending: result.promotionPending,
            victoryPoints: result.victoryPoints,
          });
          return;
        }
        clearUrlParams();
      } catch (e) {
        console.warn("Failed to load shared game from URL", e);
        clearUrlParams();
      }
    }

    const isBeginning = turnCounter === 0 && (!moveTree || moveTree.getHistoryLine().length === 0);

    if (isBeginning) {
      const savedPgn = loadFromLocalStorage();
      const currentPgn = getPGN();

      if (savedPgn && savedPgn !== currentPgn) {
        try {
          const result = loadPGN(savedPgn);
          if (isUsablePGNLoadResult(result) && onLoadGame) {
            onLoadGame({
              board: result.board,
              pieces: result.pieces,
              castles: result.castles,
              turnCounter: result.turnCounter,
              sanctuaries: result.sanctuaries,
              moveTree: result.moveTree,
              sanctuarySettings: result.sanctuarySettings,
              initialPoolTypes: result.sanctuaryPool,
              graveyard: result.graveyard,
              phoenixRecords: result.phoenixRecords,
              promotionPending: result.promotionPending,
              victoryPoints: result.victoryPoints,
            });
          } else {
            clearSave();
          }
        } catch (e) {
          console.warn("Failed to load saved game from localStorage", e);
          clearSave();
        }
      }
    }
  }, []); // Run once on mount

  // Victory Points (only used when VP mode is enabled)
  const [victoryPoints, setVictoryPoints] = React.useState<{ w: number, b: number } | undefined>(
    gameRules?.vpModeEnabled ? initialVictoryPoints ?? { w: 0, b: 0 } : undefined
  );

  // Track previous turn counter for VP calculation
  const prevTurnCounterRef = React.useRef(0);

  // Disable transitions after first render cycle
  React.useEffect(() => {
    const timer = setTimeout(() => setIsInitialLoad(false), 100);
    return () => clearTimeout(timer);
  }, []);

  useSoundEffects();

  const onlineOrientationKey = onlineSession?.role === "player"
    ? `${onlineSession.gameId}:${onlineSession.playerColor}`
    : onlineSession
      ? `${onlineSession.gameId}:spectator`
      : "local";
  const onlineOrientationTarget =
    onlineSession?.role === "player" && onlineSession.playerColor === "b";

  // Decoupled View State
  const viewState = useGameView(onlineOrientationTarget);
  const { setBoardRotated } = viewState;

  React.useEffect(() => {
    setBoardRotated(onlineOrientationTarget);
  }, [onlineOrientationKey, onlineOrientationTarget, setBoardRotated]);

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

  const onlineVictoryMessage = onlineSession?.result
    ? formatOnlineGameResult(onlineSession.result)
    : null;
  const displayedVictoryMessage = onlineVictoryMessage ?? victoryMessage;
  const displayedWinner = onlineSession?.result?.winner ?? winner;
  const onlineSessionLabel = React.useMemo(() => {
    if (!onlineSession) return null;
    const roleLabel = onlineSession.role === "player"
      ? `Online ${onlineSession.playerColor === "w" ? "White" : "Black"}`
      : "Spectating";
    const activePlayerLabel = currentPlayer === "w" ? "White" : "Black";
    const displayPhase = turnPhase === "Recruitment" ? "Castles" : turnPhase;
    const stateLabel = onlineSession.result
      ? `Complete · ${formatOnlineGameResult(onlineSession.result)}`
      : onlineSession.role === "player" && onlineSession.isActionPending
        ? "Waiting for server"
      : onlineSession.status === "connected" && onlineSession.role === "player"
        ? onlineSession.playerColor === currentPlayer
          ? `Your turn · ${displayPhase}`
          : `Waiting for ${activePlayerLabel} · ${displayPhase}`
      : onlineSession.status === "connected" && onlineSession.role === "spectator"
        ? `${activePlayerLabel} to move · ${displayPhase}`
      : formatOnlineConnectionStatus(onlineSession.status);
    return `${roleLabel} · ${stateLabel}${onlineSession.lastError ? ` · ${onlineSession.lastError}` : ""}`;
  }, [currentPlayer, onlineSession, turnPhase]);
  const canOpenAnalysisBoard =
    !isAnalysisMode &&
    (!onlineSession || onlineSession.role === "spectator" || !!onlineSession.result);
  const canOpenOnlineAnalysis =
    !isAnalysisMode &&
    !!onlineSession &&
    (onlineSession.role === "spectator" || !!onlineSession.result);
  const currentSavePgn = React.useMemo(() => {
    if (!onSaveGameToLibrary) return "";
    try {
      return getPGN();
    } catch {
      return "";
    }
  }, [displayedWinner, getPGN, moveHistory.length, onSaveGameToLibrary, turnCounter]);
  const saveStatusLabel = React.useMemo(() => {
    if (!onSaveGameToLibrary) return undefined;
    if (lastLibrarySavedPgn && currentSavePgn && lastLibrarySavedPgn === currentSavePgn) {
      return "Saved to Library";
    }
    if (onlineSession) {
      return "Not in Library";
    }
    if (moveHistory.length > 0 || hasGameStarted || displayedWinner || isAnalysisMode) {
      return "Autosaved locally";
    }
    return "Ready to save locally";
  }, [
    currentSavePgn,
    displayedWinner,
    hasGameStarted,
    isAnalysisMode,
    lastLibrarySavedPgn,
    moveHistory.length,
    onlineSession,
    onSaveGameToLibrary,
  ]);

  React.useEffect(() => {
    const nextOnlineGameId = onlineSession?.gameId ?? null;
    if (lastOnlineGameIdRef.current === undefined) {
      lastOnlineGameIdRef.current = nextOnlineGameId;
      return;
    }
    if (lastOnlineGameIdRef.current !== nextOnlineGameId) {
      setLastLibrarySavedPgn(null);
      lastOnlineGameIdRef.current = nextOnlineGameId;
    }
  }, [onlineSession?.gameId]);

  // Reset overlay when game restarts
  React.useEffect(() => {
    if (!displayedVictoryMessage) {
        setOverlayDismissed(false);
    }
  }, [displayedVictoryMessage]);

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

  const closeNewGameConfirmation = React.useCallback(() => {
    setNewGameConfirmation(null);
    window.setTimeout(() => {
      focusBeforeDialogRef.current?.focus();
      focusBeforeDialogRef.current = null;
    }, 0);
  }, []);

  const confirmNewGame = React.useCallback(() => {
    focusBeforeDialogRef.current = null;
    setNewGameConfirmation(null);
    setLastLibrarySavedPgn(null);
    clearSave();
    clearUrlParams();
    onSetup();
  }, [clearSave, clearUrlParams, onSetup]);

  const handleNewGameDialogKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNewGameConfirmation();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      confirmDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!focusable.includes(active as HTMLElement)) {
      event.preventDefault();
      first.focus();
    }
  }, [closeNewGameConfirmation]);

  const rememberNewGameReturnFocus = () => {
    focusBeforeDialogRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const handleNewGame = () => {
    if (onlineSession && !onlineSession.result) {
      rememberNewGameReturnFocus();
      setNewGameConfirmation({
        title: "Leave this online game?",
        message: "Leave this game and configure a new one? Your current online seat or spectator view will be closed on this device.",
      });
      return;
    }

    const safeToReset = !hasGameStarted || displayedWinner || isAnalysisMode;

    if (safeToReset) {
      confirmNewGame();
      return;
    }

    setNewGameConfirmation({
      title: "Leave this game?",
      message: "Leave this game and configure a new one? Unsaved local progress will be discarded.",
    });
    rememberNewGameReturnFocus();
  };

  const handleEnterAnalysis = React.useCallback(() => {
    if (!onLoadGame) return;
    const piecesSnapshot = pieces.map((piece) => piece.clone());
    const analysisSnapshot: PositionSnapshot = {
      pieces: piecesSnapshot,
      pieceMap: createPieceMap(piecesSnapshot),
      castles: castles.map((castle) => castle.clone()),
      sanctuaries: sanctuaries.map((sanctuary) => sanctuary.clone()),
      sanctuaryPool: [...sanctuaryPool],
      turnCounter,
      graveyard: graveyard.map((piece) => piece.clone()),
      phoenixRecords: phoenixRecords.map((record) => ({ ...record })),
      victoryPoints: viewedVictoryPoints ? { ...viewedVictoryPoints } : undefined,
    };
    const hasCompleteMoveSnapshots = moveTreeHasCompleteSnapshots(moveTree);
    const analysisMoveTree = hasCompleteMoveSnapshots
      ? moveTree.clone()
      : createCurrentPositionAnalysisTree(analysisSnapshot);
    if (hasCompleteMoveSnapshots && viewNodeId) {
      const viewedNode = analysisMoveTree.findNodeById(viewNodeId);
      if (viewedNode) {
        analysisMoveTree.setCurrentNode(viewedNode);
      }
    }

    onLoadGame(
      {
        board: new Board({ ...board.config }, castles.map((castle) => castle.clone())),
        pieces: piecesSnapshot,
        turnCounter,
        sanctuaries: sanctuaries.map((sanctuary) => sanctuary.clone()),
        moveTree: analysisMoveTree,
        sanctuarySettings,
        initialPoolTypes: [...sanctuaryPool],
        graveyard: graveyard.map((piece) => piece.clone()),
        phoenixRecords: phoenixRecords.map((record) => ({ ...record })),
        promotionPending: promotionPending ? promotionPending.clone() : null,
        gameRules,
        pieceTheme,
        timeControl,
        victoryPoints: viewedVictoryPoints ? { ...viewedVictoryPoints } : undefined,
      },
      { source: "analysis" }
    );
  }, [
    onLoadGame,
    board,
    castles,
    pieces,
    turnCounter,
    sanctuaries,
    sanctuaryPool,
    moveTree,
    sanctuarySettings,
    graveyard,
    phoenixRecords,
    viewedVictoryPoints,
    promotionPending,
    gameRules,
    pieceTheme,
    timeControl,
    viewNodeId,
  ]);

  useInputHandler({
    onPass: isReadOnlyOnline || isOnlineActionPaused ? () => {} : handlePass,
    onFlipBoard: viewState.handleFlipBoard,
    onTakeback: handleTakeback,
    onResize: viewState.incrementResizeVersion,
    onNavigate: stepHistory,
    isHistoryNavigationEnabled: isAnalysisMode || !!onlineSession || !!displayedWinner,
    onNewGame: handleNewGame,
    isNewGameEnabled: !hasGameStarted || !!winner || !!onlineSession?.result,
  });

  const handleImportPGN = () => {
    const pgn = prompt("Paste PGN here:");
    if (pgn) {
        const result = loadPGN(pgn);
        if (isUsablePGNLoadResult(result) && onLoadGame) {
            onLoadGame({
              board: result.board,
              pieces: result.pieces,
              castles: result.castles,
              turnCounter: result.turnCounter,
              sanctuaries: result.sanctuaries,
              moveTree: result.moveTree,
              sanctuarySettings: result.sanctuarySettings,
              initialPoolTypes: result.sanctuaryPool,
              graveyard: result.graveyard,
              phoenixRecords: result.phoenixRecords,
              promotionPending: result.promotionPending,
              victoryPoints: result.victoryPoints,
            });
        } else {
            alert("Failed to load PGN. Check console for details.");
        }
    }
  };

  const handleExportPGN = () => {
    const pgn = getPGN();
    copyOnlineInviteUrl(pgn)
      .then(() => showStatusMessage("PGN copied."))
      .catch((error) => {
        console.error("Failed to copy PGN", error);
        showStatusMessage("Could not copy PGN. Try again from a secure browser session.");
      });
  };

  const handleSaveGameToLibrary = React.useCallback(async () => {
    if (!onSaveGameToLibrary) return;
    const status: SavedGameStatus = isAnalysisMode ? "analysis" : displayedWinner ? "complete" : "ongoing";
    const pgn = getPGN();
    try {
      const saveResult = await onSaveGameToLibrary(pgn, status);
      const didSave = typeof saveResult === "object" && saveResult !== null
        ? saveResult.saved
        : saveResult !== false;
      if (didSave) {
        setLastLibrarySavedPgn(pgn);
        const message = typeof saveResult === "object" && saveResult !== null && saveResult.message
          ? saveResult.message
          : "Saved to Library.";
        showStatusMessage(message);
      }
    } catch (error) {
      console.error("Failed to save game to library", error);
      showStatusMessage("Could not save game to library.");
    }
  }, [getPGN, isAnalysisMode, onSaveGameToLibrary, displayedWinner, showStatusMessage]);

  const dismissQuickStart = React.useCallback(() => {
    try {
      localStorage.setItem("hasSeenQuickStart", "true");
    } catch (error) {
      console.error("Failed to save quick-start preference", error);
    }
    setShowQuickStart(false);
  }, []);
  const openQuickStartTutorial = React.useCallback(() => {
    dismissQuickStart();
    onTutorial?.();
  }, [dismissQuickStart, onTutorial]);
  const dismissTooltipHint = () => setShowTooltipHint(false);

  React.useEffect(() => {
    if (!isTutorialMode || !onTutorialEvent) {
      tutorialSnapshotRef.current = null;
      return;
    }

    const currentSnapshot: TutorialEventSnapshot = {
      pieceCount: pieces.length,
      graveyardLength: graveyard.length,
      piecesByHex: Object.fromEntries(
        pieces.map((piece) => [piece.hex.getKey(), { color: piece.color, type: piece.type }])
      ) as TutorialEventSnapshot["piecesByHex"],
      castleOwnersByHex: Object.fromEntries(
        castles.map((castle) => [castle.hex.getKey(), castle.owner])
      ),
      castlesByHex: Object.fromEntries(
        castles.map((castle) => [
          castle.hex.getKey(),
          { color: castle.color, owner: castle.owner },
        ])
      ),
      sanctuariesByHex: Object.fromEntries(
        sanctuaries.map((sanctuary) => [
          sanctuary.hex.getKey(),
          { type: sanctuary.type, controller: sanctuary.controller },
        ])
      ),
    };
    const previousSnapshot = tutorialSnapshotRef.current;
    const latestMove = moveHistory.at(-1);
    const signature = latestMove
      ? `${moveHistory.length}:${latestMove.notation}:${latestMove.phase}:${latestMove.turnNumber}`
      : "";
    if (!latestMove || signature === lastTutorialMoveSignatureRef.current) {
      tutorialSnapshotRef.current = currentSnapshot;
      return;
    }
    lastTutorialMoveSignatureRef.current = signature;

    onTutorialEvent(
      buildTutorialGameEventFromMove({
        notation: latestMove.notation,
        phase: latestMove.phase,
        resultPhase: turnPhase,
        previousSnapshot,
        currentSnapshot,
        castleHexKeys: new Set(castles.map((castle) => castle.hex.getKey())),
      })
    );
    tutorialSnapshotRef.current = currentSnapshot;
  }, [castles, graveyard.length, isTutorialMode, moveHistory, onTutorialEvent, pieces.length, sanctuaries, turnPhase]);

  const [activeAbility, setActiveAbility] = React.useState<import('../Constants').AbilityType | null>(null);
  const shellClasses = [
    "game-shell",
    isTutorialMode ? "tutorial-game-shell" : "",
    onlineSession ? "has-online-session" : "",
    isNavigationMenuOpen ? "navigation-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClasses} ref={shellRef}>
      {showNavigationMenu && (
        <HamburgerMenu
          onExportPGN={handleExportPGN}
          onImportPGN={handleImportPGN}
          onFlipBoard={viewState.handleFlipBoard}
          onToggleCoordinates={viewState.toggleCoordinates}
          onShowRules={() => setShowRulesModal(true)}
          onNewGame={handleNewGame}
          onSaveGameToLibrary={onSaveGameToLibrary ? handleSaveGameToLibrary : undefined}
          onOpenLibrary={onOpenLibrary}
          onOpenOnlineBrowser={onOpenOnlineBrowser}
          onReturnFromAnalysis={onReturnFromAnalysis}
          analysisReturnLabel={analysisReturnLabel}
          onEditPosition={onEditPosition ? () => onEditPosition(initialBoard, pieces, sanctuaries) : undefined}
          onTutorial={onTutorial}
          onOpenChange={setNavigationMenuOpen}
          isAnalysisMode={isAnalysisMode}
          onEnableAnalysis={canOpenAnalysisBoard ? handleEnterAnalysis : undefined}
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
      )}

      {promotionPending && !isReadOnlyOnline && (
        <PromotionModal
          promotion={promotionPending}
          onSelect={handlePromotion}
          playerColor={currentPlayer}
        />
      )}

      <GameOverlays
        showRules={showRulesModal}
        onCloseRules={() => setShowRulesModal(false)}
        victoryMessage={displayedVictoryMessage}
        winner={displayedWinner}
        isOverlayDismissed={isOverlayDismissed}
        onDismissOverlay={() => setOverlayDismissed(true)}
        onRestart={onRestart}
        onSetup={onSetup}
        onRematch={onRematch}
        rematchLabel={rematchLabel}
        onEnableAnalysis={handleEnterAnalysis}
        canRestart={!onlineSession}
        showQuickStart={showQuickStart}
        onCloseQuickStart={dismissQuickStart}
        onOpenTutorial={onTutorial ? openQuickStartTutorial : undefined}
        showTooltipHint={showTooltipHint}
        onDismissTooltipHint={dismissTooltipHint}
        isAnalysisMode={isAnalysisMode}
      />

      {/* Game Panel (Right Side) - Hidden in tutorial mode */}
      {!isTutorialMode && (
        <ControlPanel
          currentPlayer={currentPlayer}
          turnPhase={turnPhase}
          turnCounter={turnCounter}
          onPass={isReadOnlyOnline || isOnlineActionPaused ? () => {} : handlePass}
          onResign={() => {
              if (isReadOnlyOnline || isOnlineActionPaused) return;
              handleResign(currentPlayer);
              onResign();
          }}
          onNewGame={handleNewGame}
          onShare={onlineSession ? undefined : handleShare}
          onCopyOpponentInvite={
            onlineSession?.role === "player" && onlineSession.opponentInviteUrl
              ? handleCopyOpponentInvite
              : undefined
          }
          onCopySpectator={onlineSession?.spectatorUrl ? handleCopySpectator : undefined}
          onlineVisibility={currentOnlineVisibility}
          onUpdateOnlineVisibility={
            onlineSession?.role === "player" && onlineSession.updateVisibility
              ? handleUpdateOnlineVisibility
              : undefined
          }
          isOnlineVisibilityPending={isOnlineVisibilityPending}
          onSaveGame={onSaveGameToLibrary ? handleSaveGameToLibrary : undefined}
          onOpenLibrary={onOpenLibrary}
          saveStatusLabel={saveStatusLabel}
          onReturnFromAnalysis={onReturnFromAnalysis}
          analysisReturnLabel={analysisReturnLabel}
          onEnableAnalysis={canOpenOnlineAnalysis ? handleEnterAnalysis : undefined}
          moveHistory={moveHistory || []}
          moveTree={moveTree}
          onJumpToNode={jumpToNode}
          hasGameStarted={hasGameStarted}
          winner={displayedWinner}
          timeControl={timeControl}
          onlineClock={onlineSession?.clock}
          isOnline={!!onlineSession}
          isReadOnly={isReadOnlyOnline}
          isActionPending={isOnlineActionPaused}
          viewNodeId={viewNodeId}
          victoryPoints={victoryPoints}
        />
      )}

      {newGameConfirmation && (
        <div className="confirm-dialog-backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-game-confirm-title"
            aria-describedby="new-game-confirm-description"
            ref={confirmDialogRef}
            onKeyDown={handleNewGameDialogKeyDown}
          >
            <h2 id="new-game-confirm-title">{newGameConfirmation.title}</h2>
            <p id="new-game-confirm-description">{newGameConfirmation.message}</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="confirm-dialog-button neutral"
                ref={keepPlayingButtonRef}
                onClick={closeNewGameConfirmation}
              >
                Keep Playing
              </button>
              <button
                type="button"
                className="confirm-dialog-button danger"
                onClick={confirmNewGame}
              >
                Leave Game
              </button>
            </div>
          </section>
        </div>
      )}

      {onlineSession && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="online-session-badge"
        >
          {onlineSessionLabel}
        </div>
      )}

      {statusMessage && !isNavigationMenuOpen && (
        <div
          role="status"
          className="game-status-toast"
          aria-live="polite"
        >
          {statusMessage}
        </div>
      )}

      {isTutorialMode && (
        <div
          role="status"
          aria-label="Current tutorial turn"
          className={`tutorial-turn-indicator ${currentPlayer}`}
        >
          <span className="tutorial-turn-player">{currentPlayer === "w" ? "White" : "Black"}</span>
          <TurnBanner color={currentPlayer} phase={turnPhase} phaseIndex={turnCounter % 5} />
          <span className="tutorial-turn-phase">{turnPhase === "Recruitment" ? "Castles" : turnPhase}</span>
        </div>
      )}

      {/* Board Container */}
      <div
        className="game-board-stage"
        data-board-orientation={viewState.isBoardRotated ? "rotated" : "default"}
      >
        <BoardContainer
          layout={initialLayout}
          pieceTheme={pieceTheme || "Castles"}
          isInitialLoad={isInitialLoad}
          tooltip={tooltip}
          viewState={viewState}
          activeAbility={activeAbility}
          onAbilitySelect={setActiveAbility}
          onActiveAbilityChange={setActiveAbility}
          onTutorialEvent={onTutorialEvent}
          containerStyle={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        />
      </div>

      <GameHUD
        tooltip={tooltip}
        activeAbility={activeAbility}
        onAbilitySelect={setActiveAbility}
        sanctuarySettings={sanctuarySettings}
        showDiscoveryHint={shouldShowTooltipHint && !isTutorialMode && !isNavigationMenuOpen && !onlineSession}
      />
    </div>
  );
};

const GameBoard: React.FC<GameBoardProps> = (props) => {
  return (
    <GameProvider
      config={{
        board: props.initialBoard,
        pieces: props.initialPieces,
        castles: props.initialCastles,
        turnCounter: props.initialTurnCounter,
        sanctuaries: props.initialSanctuaries,
        graveyard: props.initialGraveyard,
        phoenixRecords: props.initialPhoenixRecords,
        promotionPending: props.initialPromotionPending,
        victoryPoints: props.initialVictoryPoints,
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
        onlineSession: props.onlineSession,
      }}
    >
      <InnerGame {...props} />
    </GameProvider>
  );
};

export default GameBoard;
