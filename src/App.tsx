import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameBoard from './components/Game';
import MainMenu from './components/MainMenu';
import GameSetup from './components/GameSetup';
import BoardEditor from './components/BoardEditor';
import Tutorial from './components/Tutorial';
import GameLibrary from './components/GameLibrary';
import OnlineGameBrowser from './components/OnlineGameBrowser';
import InstallAppHint from './components/InstallAppHint';
import RulesManualPage from './components/RulesManualPage';
import AppShellNav, { AppShellDestination } from './components/AppShellNav';
import { Board } from './Classes/Core/Board';
import { Piece } from './Classes/Entities/Piece';
import { LayoutService } from './Classes/Systems/LayoutService';
import { MoveTree } from './Classes/Core/MoveTree';
import { SanctuaryType, PieceTheme } from './Constants';
import { Sanctuary } from './Classes/Entities/Sanctuary';
import { getStartingLayout } from './ConstantImports';
import { AIOpponentConfig } from './hooks/useAIOpponent';
import { useOnlineGameConnection } from './hooks/useOnlineGameConnection';
import { useOnlineSpectatorConnection } from './hooks/useOnlineSpectatorConnection';
import {
  createMoveTreeFromHistory,
  createInitialStateFromSetupDTO,
  hydrateGameStateDTO,
  hydrateOnlineGameSetupDTO,
  serializeOnlineGameSetup,
} from './online/serialization';
import {
  buildSpectatorUrl,
  acceptOnlineChallenge,
  cancelOnlineChallenge,
  createOnlineChallenge,
  declineOnlineChallenge,
  fetchOnlineGameSummaries,
  fetchOnlineChallenge,
  createOnlineGame,
  fetchOnlineSpectatorSnapshot,
  formatOnlinePendingConnectionMessage,
  forgetOnlineChallengeParams,
  forgetOnlineJoinParams,
  forgetOnlineOpponentInviteUrl,
  rememberOnlineChallengeParams,
  rememberOnlineJoinParams,
  rememberOnlineOpponentInviteUrl,
  removeOnlineChallengeTokenFromUrl,
  removeOnlineTokenFromUrl,
  resolveOnlineChallengeParams,
  parseOnlineSpectatorParams,
  resolveOnlineOpponentInviteUrl,
  resolveOnlineJoinParams,
  updateOnlineGameVisibility,
  OnlineChallengeParams,
  OnlineChallengeResponse,
  OnlineChallengeGameInvite,
  OnlineJoinParams,
  OnlineSpectatorParams,
} from './online/client';
import type { OnlineClientSession, OnlineGameSnapshotDTO } from './online/types';
import type { OnlineGameVisibility, OnlinePlayerSettableGameVisibility } from './online/visibility';
import { ThemeProvider } from './contexts/ThemeContext';
import {
  BrowserGameLibraryRepository,
  SavedGameRecord,
  SavedGameStatus,
  createDefaultSavedGameName,
  createSavedGameRecord,
} from './Classes/Services/GameLibraryRepository';
import { loadPGNText } from './Classes/Services/PGNLoadService';
import { PGNService } from './Classes/Services/PGNService';
import type { PhoenixRecord } from './Classes/Core/GameState';

type ViewState = 'menu' | 'setup' | 'game' | 'editor' | 'tutorial' | 'library' | 'challenge' | 'watch';

interface GameConfig {
  board?: Board;
  pieces?: Piece[];
  layout?: LayoutService;
  moveTree?: MoveTree;
  turnCounter?: number;
  sanctuaries?: Sanctuary[];
  timeControl?: { initial: number, increment: number };
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  initialPoolTypes?: SanctuaryType[];
  graveyard?: Piece[];
  phoenixRecords?: PhoenixRecord[];
  promotionPending?: Piece | null;
  victoryPoints?: { w: number; b: number };
  pieceTheme?: PieceTheme;
  isAnalysisMode?: boolean;
  opponentConfig?: AIOpponentConfig;
}

interface EditorConfig {
  board?: Board;
  pieces?: Piece[];
  sanctuaries?: Sanctuary[];
}

function gameSettingsFromSetup(setup: ReturnType<typeof hydrateOnlineGameSetupDTO>) {
  return setup.sanctuarySettings
    ? {
        sanctuaryUnlockTurn: setup.sanctuarySettings.unlockTurn,
        sanctuaryRechargeTurns: setup.sanctuarySettings.cooldown,
      }
    : undefined;
}

function createGameConfigFromOnlineSnapshot(
  snapshot: OnlineGameSnapshotDTO,
  isAnalysisMode: boolean
): GameConfig {
  const setup = hydrateOnlineGameSetupDTO(snapshot.setup);
  const moveTree = createMoveTreeFromHistory(snapshot.moveHistory, snapshot.state);
  const state = hydrateGameStateDTO(snapshot.state, snapshot.setup, moveTree);
  const layout = getStartingLayout(setup.board);

  return {
    board: setup.board,
    pieces: state.pieces,
    layout,
    moveTree: state.moveTree,
    turnCounter: state.turnCounter,
    sanctuaries: state.sanctuaries,
    sanctuarySettings: setup.sanctuarySettings,
    gameRules: setup.gameRules,
    initialPoolTypes: state.sanctuaryPool,
    graveyard: state.graveyard,
    phoenixRecords: state.phoenixRecords,
    promotionPending: state.promotionPending,
    victoryPoints: state.victoryPoints,
    pieceTheme: setup.pieceTheme,
    timeControl: setup.timeControl,
    isAnalysisMode,
  };
}

function createReplayMoveTreeFromOnlineSnapshot(snapshot: OnlineGameSnapshotDTO): MoveTree {
  const { state } = createInitialStateFromSetupDTO(snapshot.setup);
  for (const record of snapshot.moveHistory) {
    state.moveTree.addMove(record);
  }
  return state.moveTree;
}

function createReplayGameConfigFromOnlineSnapshot(snapshot: OnlineGameSnapshotDTO): GameConfig {
  const setup = hydrateOnlineGameSetupDTO(snapshot.setup);
  const hydratedConfig = createGameConfigFromOnlineSnapshot(snapshot, true);
  if (snapshot.moveHistory.length > 0) {
    try {
      const replayMoveTree = createReplayMoveTreeFromOnlineSnapshot(snapshot);
      const replayPgn = PGNService.generatePGN(
        setup.board,
        setup.pieces,
        snapshot.moveHistory,
        setup.sanctuaries,
        {},
        replayMoveTree,
        gameSettingsFromSetup(setup)
      );
      const replay = loadPGNText(replayPgn);
      if (replay && (!replay.diagnostics || replay.diagnostics.length === 0)) {
        return {
          ...hydratedConfig,
          board: replay.board,
          pieces: replay.pieces,
          layout: getStartingLayout(replay.board),
          moveTree: replay.moveTree,
          turnCounter: replay.turnCounter,
          sanctuaries: replay.sanctuaries,
          sanctuarySettings: replay.sanctuarySettings ?? setup.sanctuarySettings,
          initialPoolTypes: replay.sanctuaryPool ?? hydratedConfig.initialPoolTypes,
          isAnalysisMode: true,
        };
      }
    } catch (error) {
      console.warn("Could not rebuild archived game replay from move history", error);
    }
  }

  return hydratedConfig;
}

function App() {
  const [view, setView] = useState<ViewState>('game');
  const [gameConfig, setGameConfig] = useState<GameConfig>({});
  const [editorConfig, setEditorConfig] = useState<EditorConfig>({});
  const [previousView, setPreviousView] = useState<ViewState>('game');
  const [viewStack, setViewStack] = useState<ViewState[]>([]);
  const [gameLibraryRepository] = useState(() => new BrowserGameLibraryRepository());
  const [onlineJoin, setOnlineJoin] = useState<OnlineJoinParams | null>(() =>
    resolveOnlineJoinParams(window.location.href)
  );
  const [onlineSpectator, setOnlineSpectator] = useState<OnlineSpectatorParams | null>(() =>
    parseOnlineSpectatorParams(window.location.href)
  );
  const [onlineSnapshot, setOnlineSnapshot] = useState<OnlineGameSnapshotDTO | null>(null);
  const [onlineOpponentInviteUrl, setOnlineOpponentInviteUrl] = useState<string | null>(() =>
    onlineJoin?.seat === "w" ? resolveOnlineOpponentInviteUrl(onlineJoin.gameId) : null
  );
  const [onlineVisibilityByGameId, setOnlineVisibilityByGameId] = useState<Record<string, OnlineGameVisibility>>({});
  const [onlineChallenge, setOnlineChallenge] = useState<OnlineChallengeParams | null>(() =>
    resolveOnlineChallengeParams(window.location.href)
  );
  const [onlineChallengeResponse, setOnlineChallengeResponse] = useState<OnlineChallengeResponse | null>(null);
  const [onlineChallengeShareUrl, setOnlineChallengeShareUrl] = useState<string | null>(null);
  const [onlineChallengeStatus, setOnlineChallengeStatus] = useState<"idle" | "loading" | "acting" | "error">("idle");
  const [onlineChallengeError, setOnlineChallengeError] = useState<string | null>(null);
  const replayRequestIdRef = useRef(0);

  const cancelPendingReplay = () => {
    replayRequestIdRef.current += 1;
  };

  const clearAutosave = () => {
    localStorage.removeItem('castles_autosave');
  };

  const clearOnlineUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("onlineGame");
    url.searchParams.delete("seat");
    url.searchParams.delete("token");
    url.searchParams.delete("onlineChallenge");
    url.searchParams.delete("challengeRole");
    url.searchParams.delete("challengeToken");
    url.searchParams.delete("view");
    url.searchParams.delete("pgn");
    url.searchParams.delete("game");
    url.hash = "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };

  const clearOnlineTokenFromUrl = () => {
    if (!window.location.search.includes("token=")) return;
    const url = new URL(removeOnlineTokenFromUrl(window.location.href));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const clearOnlineChallengeTokenFromUrl = () => {
    if (!window.location.hash.includes("challengeToken=")) return;
    const url = new URL(removeOnlineChallengeTokenFromUrl(window.location.href));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    if (!onlineJoin) return;
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    rememberOnlineJoinParams(onlineJoin);
    clearOnlineTokenFromUrl();
  }, [onlineJoin]);

  useEffect(() => {
    if (!onlineJoin) return;
    let cancelled = false;
    fetchOnlineGameSummaries()
      .then((summaries) => {
        if (cancelled) return;
        const summary = summaries.find((candidate) => candidate.gameId === onlineJoin.gameId);
        setOnlineVisibilityByGameId(prev => {
          if (summary) {
            return { ...prev, [onlineJoin.gameId]: summary.visibility };
          }
          if (prev[onlineJoin.gameId]) {
            return prev;
          }
          return { ...prev, [onlineJoin.gameId]: "unlisted" };
        });
      })
      .catch(() => {
        if (cancelled) return;
        setOnlineVisibilityByGameId(prev =>
          prev[onlineJoin.gameId]
            ? prev
            : { ...prev, [onlineJoin.gameId]: "unlisted" }
        );
      });
    return () => {
      cancelled = true;
    };
  }, [onlineJoin]);

  useEffect(() => {
    if (!onlineChallenge) return;
    setView('challenge');
    rememberOnlineChallengeParams(onlineChallenge);
    clearOnlineChallengeTokenFromUrl();
    let cancelled = false;
    setOnlineChallengeStatus("loading");
    setOnlineChallengeError(null);
    fetchOnlineChallenge(onlineChallenge)
      .then((response) => {
        if (cancelled) return;
        setOnlineChallengeResponse(response);
        setOnlineChallengeStatus("idle");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load online challenge", error);
        setOnlineChallengeStatus("error");
        setOnlineChallengeError(
          error instanceof Error && error.message.includes("(404)")
            ? "Access denied."
            : "Could not load this challenge."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [onlineChallenge]);

  const handleNewGameClick = () => {
    cancelPendingReplay();
    clearAutosave();
    clearOnlineUrl();
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
    }
    if (onlineJoin) {
      forgetOnlineJoinParams(onlineJoin);
      forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
    }
    if (onlineSnapshot) {
      forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
    }
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    const backTarget = view === 'game' || view === 'setup' ? 'game' : view;
    setPreviousView(backTarget);
    setViewStack([backTarget]);
    setView('setup');
  };

  const handleTutorialClick = () => {
    cancelPendingReplay();
    if (view !== 'tutorial') {
      setViewStack(prev => [...prev, view]);
      setPreviousView(view);
    }
    setView('tutorial');
  };

  const handleOpenLibrary = () => {
    cancelPendingReplay();
    if (view !== 'library') {
      setViewStack(prev => [...prev, view]);
      setPreviousView(view);
    }
    setView('library');
  };

  const handleOpenOnlineBrowser = () => {
    cancelPendingReplay();
    if (view !== 'watch') {
      setViewStack(prev => [...prev, view]);
      setPreviousView(view);
    }
    setView('watch');
  };

  const handleOpenGame = () => {
    cancelPendingReplay();
    setViewStack([]);
    setPreviousView('game');
    setView('game');
  };

  const returnToPreviousView = () => {
    cancelPendingReplay();
    setViewStack(prev => {
      if (prev.length === 0) {
        const fallback = previousView === 'library' || previousView === 'tutorial' || previousView === 'watch' ? 'game' : previousView;
        setView(fallback);
        setPreviousView('game');
        return [];
      }

      const next = [...prev];
      const target = next.pop() ?? 'game';
      setView(target);
      setPreviousView(next[next.length - 1] ?? 'game');
      return next;
    });
  };

  const currentBackLabel =
    previousView === 'setup'
      ? 'Back to setup'
      : previousView === 'watch'
        ? 'Back to Watch'
        : previousView === 'tutorial'
          ? 'Back to Learn'
          : previousView === 'library'
            ? 'Back to Library'
            : 'Back to game';

  const handleStartGame = (
    board: Board, 
    pieces: Piece[], 
    timeControl?: { initial: number, increment: number },
    sanctuaries?: Sanctuary[],
    selectedSanctuaryTypes?: SanctuaryType[],
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    gameRules?: { vpModeEnabled: boolean },
    initialPoolTypes?: SanctuaryType[],
    pieceTheme?: PieceTheme,
    opponentConfig?: AIOpponentConfig
  ) => {
    cancelPendingReplay();
    const layout = getStartingLayout(board);

    clearAutosave();
    clearOnlineUrl();
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
    }
    if (onlineJoin) {
      forgetOnlineJoinParams(onlineJoin);
      forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
    }
    if (onlineSnapshot) {
      forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
    }
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl, sanctuarySettings, gameRules, initialPoolTypes, pieceTheme, isAnalysisMode: false, opponentConfig });
    setGameKey(prev => prev + 1);
    setView('game');
  };

  const handleCreateOnlineGame = async (
    board: Board,
    pieces: Piece[],
    timeControl?: { initial: number, increment: number },
    sanctuaries?: Sanctuary[],
    _selectedSanctuaryTypes?: SanctuaryType[],
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    gameRules?: { vpModeEnabled: boolean },
    initialPoolTypes?: SanctuaryType[],
    pieceTheme?: PieceTheme
  ) => {
    try {
      cancelPendingReplay();
      clearAutosave();
      if (onlineChallenge) {
        forgetOnlineChallengeParams(onlineChallenge);
      }
      setOnlineSpectator(null);
      setOnlineChallenge(null);
      setOnlineChallengeResponse(null);
      setOnlineChallengeShareUrl(null);
      const created = await createOnlineGame(
        serializeOnlineGameSetup({
          board,
          pieces,
          sanctuaries: sanctuaries ?? [],
          timeControl,
          sanctuarySettings,
          gameRules,
          initialPoolTypes,
          pieceTheme,
        })
      );

      const whiteJoin = {
        gameId: created.gameId,
        seat: "w" as const,
        token: created.white.token,
      };
      rememberOnlineJoinParams(whiteJoin);
      rememberOnlineOpponentInviteUrl(created.gameId, created.black.url);
      const whiteUrl = new URL(removeOnlineTokenFromUrl(created.white.url));
      window.history.pushState(
        {},
        "",
        `${window.location.pathname}?${whiteUrl.searchParams.toString()}`
      );
      setOnlineJoin(whiteJoin);
      setOnlineSpectator(null);
      setOnlineSnapshot(null);
      setOnlineOpponentInviteUrl(created.black.url);
      setOnlineVisibilityByGameId(prev => ({
        ...prev,
        [created.gameId]: "unlisted",
      }));
      setView('game');
    } catch (error) {
      console.error("Failed to create online game", error);
      alert("Could not create an online game. Make sure the Node server is running.");
    }
  };

  const enterOnlineGameFromInvite = (invite: OnlineChallengeGameInvite) => {
    cancelPendingReplay();
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
    }
    const join = {
      gameId: invite.gameId,
      seat: invite.seat,
      token: invite.token,
    };
    rememberOnlineJoinParams(join);
    const joinUrl = new URL(removeOnlineTokenFromUrl(invite.url));
    window.history.pushState(
      {},
      "",
      `${window.location.pathname}?${joinUrl.searchParams.toString()}`
    );
    setOnlineJoin(join);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setOnlineVisibilityByGameId(prev => ({
      ...prev,
      [join.gameId]: "unlisted",
    }));
    setView('game');
  };

  const handleSpectateOnlineGame = (gameId: string) => {
    cancelPendingReplay();
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
    }
    const url = new URL(buildSpectatorUrl(window.location.href, gameId));
    window.history.pushState(
      {},
      "",
      `${window.location.pathname}?${url.searchParams.toString()}`
    );
    setOnlineJoin(null);
    setOnlineSpectator({ gameId });
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setPreviousView('watch');
    setView('game');
  };

  const handleReplayOnlineGame = async (gameId: string) => {
    const requestId = replayRequestIdRef.current + 1;
    replayRequestIdRef.current = requestId;
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
    }
    clearOnlineUrl();
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);

    try {
      const snapshot = await fetchOnlineSpectatorSnapshot(gameId);
      if (replayRequestIdRef.current !== requestId) return;
      const replayConfig = createReplayGameConfigFromOnlineSnapshot(snapshot);
      setGameConfig(replayConfig);
      setGameKey(prev => prev + 1);
      setPreviousView('watch');
      setView('game');
    } catch (error) {
      if (replayRequestIdRef.current !== requestId) return;
      console.error("Failed to open archived online replay", error);
      alert("Could not open this archived replay. Refresh public games and try again.");
    }
  };

  const handleCreateOnlineChallenge = async (
    board: Board,
    pieces: Piece[],
    timeControl?: { initial: number, increment: number },
    sanctuaries?: Sanctuary[],
    _selectedSanctuaryTypes?: SanctuaryType[],
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    gameRules?: { vpModeEnabled: boolean },
    initialPoolTypes?: SanctuaryType[],
    pieceTheme?: PieceTheme
  ) => {
    try {
      cancelPendingReplay();
      clearAutosave();
      const created = await createOnlineChallenge(
        serializeOnlineGameSetup({
          board,
          pieces,
          sanctuaries: sanctuaries ?? [],
          timeControl,
          sanctuarySettings,
          gameRules,
          initialPoolTypes,
          pieceTheme,
        }),
        { challengerSeat: "w", visibility: "unlisted" }
      );
      const challenge = resolveOnlineChallengeParams(created.challenger.url);
      if (!challenge) {
        throw new Error("Challenge creator link was malformed.");
      }
      rememberOnlineChallengeParams(challenge);
      const challengeUrl = new URL(removeOnlineChallengeTokenFromUrl(created.challenger.url));
      window.history.pushState(
        {},
        "",
        `${window.location.pathname}?${challengeUrl.searchParams.toString()}`
      );
      setOnlineJoin(null);
      setOnlineSpectator(null);
      setOnlineSnapshot(null);
      setOnlineOpponentInviteUrl(null);
      setOnlineChallenge(challenge);
      setOnlineChallengeResponse({
        role: "challenger",
        summary: created.summary,
      });
      setOnlineChallengeShareUrl(created.challenged.url);
      setOnlineChallengeStatus("idle");
      setOnlineChallengeError(null);
      setView('challenge');
    } catch (error) {
      console.error("Failed to create online challenge", error);
      alert("Could not create an online challenge. Make sure the Node server is running.");
    }
  };

  const handleAcceptOnlineChallenge = async () => {
    if (!onlineChallenge) return;
    cancelPendingReplay();
    setOnlineChallengeStatus("acting");
    setOnlineChallengeError(null);
    try {
      const response = await acceptOnlineChallenge(onlineChallenge);
      setOnlineChallengeResponse(response);
      setOnlineChallengeStatus("idle");
      if (response.gameInvite) {
        enterOnlineGameFromInvite(response.gameInvite);
      }
    } catch (error) {
      console.error("Failed to accept online challenge", error);
      setOnlineChallengeStatus("error");
      setOnlineChallengeError("Could not accept this challenge.");
    }
  };

  const handleDeclineOnlineChallenge = async () => {
    if (!onlineChallenge) return;
    cancelPendingReplay();
    setOnlineChallengeStatus("acting");
    setOnlineChallengeError(null);
    try {
      const response = await declineOnlineChallenge(onlineChallenge);
      forgetOnlineChallengeParams(onlineChallenge);
      setOnlineChallengeResponse(response);
      setOnlineChallengeShareUrl(null);
      setOnlineChallengeStatus("idle");
    } catch (error) {
      console.error("Failed to decline online challenge", error);
      setOnlineChallengeStatus("error");
      setOnlineChallengeError(
        error instanceof Error && error.message.includes("(404)")
          ? "Access denied."
          : "Could not decline this challenge."
      );
    }
  };

  const handleCancelOnlineChallenge = async () => {
    if (!onlineChallenge) return;
    cancelPendingReplay();
    setOnlineChallengeStatus("acting");
    setOnlineChallengeError(null);
    try {
      const response = await cancelOnlineChallenge(onlineChallenge);
      forgetOnlineChallengeParams(onlineChallenge);
      setOnlineChallengeResponse(response);
      setOnlineChallengeShareUrl(null);
      setOnlineChallengeStatus("idle");
    } catch (error) {
      console.error("Failed to cancel online challenge", error);
      setOnlineChallengeStatus("error");
      setOnlineChallengeError(
        error instanceof Error && error.message.includes("(404)")
          ? "Access denied."
          : "Could not cancel this challenge."
      );
    }
  };

  const handleRefreshOnlineChallenge = async () => {
    if (!onlineChallenge) return;
    cancelPendingReplay();
    setOnlineChallengeStatus("loading");
    setOnlineChallengeError(null);
    try {
      const response = await fetchOnlineChallenge(onlineChallenge);
      setOnlineChallengeResponse(response);
      setOnlineChallengeStatus("idle");
    } catch (error) {
      console.error("Failed to refresh online challenge", error);
      setOnlineChallengeStatus("error");
      setOnlineChallengeError("Could not refresh this challenge.");
    }
  };

  const handleRestartGame = () => {
    cancelPendingReplay();
    clearAutosave();
    setGameKey(prev => prev + 1);
  };

  const handleLoadGame = (data: {
    board: Board, 
    pieces: Piece[], 
    turnCounter: number, 
    sanctuaries: Sanctuary[], 
    moveTree?: MoveTree,
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    initialPoolTypes?: SanctuaryType[],
    graveyard?: Piece[],
    phoenixRecords?: PhoenixRecord[],
    promotionPending?: Piece | null,
    gameRules?: { vpModeEnabled: boolean },
    pieceTheme?: PieceTheme,
    timeControl?: { initial: number, increment: number },
    victoryPoints?: { w: number; b: number }
  }) => {
    cancelPendingReplay();
    const {
      board,
      pieces,
      turnCounter,
      sanctuaries,
      moveTree,
      sanctuarySettings,
      initialPoolTypes,
      graveyard,
      phoenixRecords,
      promotionPending,
      gameRules,
      pieceTheme,
      timeControl,
      victoryPoints,
    } = data;
    // Reset layout based on new board size
    const layout = getStartingLayout(board);
    // PGN imports should always start in analysis mode so users can navigate the game
    clearOnlineUrl();
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
    }
    if (onlineJoin) {
      forgetOnlineJoinParams(onlineJoin);
      forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
    }
    if (onlineSnapshot) {
      forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
    }
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setGameConfig({
      board,
      pieces,
      layout,
      moveTree,
      turnCounter,
      sanctuaries,
      sanctuarySettings,
      initialPoolTypes,
      graveyard,
      phoenixRecords,
      promotionPending,
      gameRules,
      pieceTheme,
      timeControl,
      victoryPoints,
      isAnalysisMode: true,
    });
    setGameKey(prev => prev + 1); // Force remount
    setView('game');
  };

  const handleLoadSavedGame = (record: SavedGameRecord) => {
    const result = loadPGNText(record.pgn);
    if (!result || (result.diagnostics && result.diagnostics.length > 0)) {
      alert("Saved game could not be loaded. The PGN may be damaged.");
      return;
    }

    handleLoadGame({
      board: result.board,
      pieces: result.pieces,
      turnCounter: result.turnCounter,
      sanctuaries: result.sanctuaries,
      moveTree: result.moveTree,
      sanctuarySettings: result.sanctuarySettings,
      initialPoolTypes: result.sanctuaryPool
    });
  };

  const handleSaveGameToLibrary = async (pgn: string, status: SavedGameStatus): Promise<boolean> => {
    const defaultName = createDefaultSavedGameName(pgn);
    const name = prompt("Save game as:", defaultName);
    if (!name?.trim()) return false;

    try {
      await gameLibraryRepository.saveGame(createSavedGameRecord({
        pgn,
        name: name.trim(),
        status
      }));
      return true;
    } catch (error) {
      console.error("Failed to save game to library", error);
      throw error;
    }
  };

  const handleImportPGNToLibrary = async (pgn: string, name: string) => {
    const result = loadPGNText(pgn);
    if (!result || (result.diagnostics && result.diagnostics.length > 0)) {
      throw new Error("PGN could not be imported. Check that it replays correctly.");
    }

    await gameLibraryRepository.saveGame(createSavedGameRecord({
      pgn,
      name,
      status: "analysis"
    }));
  };
  
  const [gameKey, setGameKey] = useState(0);
  const isRulesPage = window.location.pathname === '/rules';

  const handleOnlineSnapshot = useCallback((snapshot: OnlineGameSnapshotDTO) => {
    setOnlineSnapshot(snapshot);
    setGameConfig(createGameConfigFromOnlineSnapshot(snapshot, false));
    setGameKey(prev => prev + 1);
    setView('game');
  }, []);

  const activeOnlineSpectator = onlineJoin ? null : onlineSpectator;
  const onlineConnection = useOnlineGameConnection(onlineJoin, handleOnlineSnapshot);
  const onlineSpectatorConnection = useOnlineSpectatorConnection(
    activeOnlineSpectator?.gameId ?? null,
    handleOnlineSnapshot
  );
  const handleUpdateOnlineVisibility = useCallback(
    async (visibility: OnlinePlayerSettableGameVisibility) => {
      if (!onlineJoin) {
        throw new Error("No active online game is available.");
      }
      const summary = await updateOnlineGameVisibility(onlineJoin, visibility);
      setOnlineVisibilityByGameId(prev => ({
        ...prev,
        [summary.gameId]: summary.visibility,
      }));
      return summary;
    },
    [onlineJoin]
  );
  const onlineSession = useMemo<OnlineClientSession | undefined>(() => {
    if (onlineJoin && onlineSnapshot) {
      return {
        gameId: onlineJoin.gameId,
        role: "player",
        playerColor: onlineJoin.seat,
        version: onlineSnapshot.version,
        status: onlineConnection.status,
        lastError: onlineConnection.lastError,
        isActionPending: onlineConnection.isActionPending,
        clock: onlineSnapshot.clock,
        result: onlineSnapshot.result,
        visibility: onlineVisibilityByGameId[onlineJoin.gameId] ?? "unlisted",
        opponentInviteUrl: onlineJoin.seat === "w" ? onlineOpponentInviteUrl ?? undefined : undefined,
        spectatorUrl: buildSpectatorUrl(window.location.href, onlineJoin.gameId),
        submitAction: onlineConnection.submitAction,
        updateVisibility: handleUpdateOnlineVisibility,
      };
    }

    if (activeOnlineSpectator && onlineSnapshot) {
      return {
        gameId: activeOnlineSpectator.gameId,
        role: "spectator",
        version: onlineSnapshot.version,
        status: onlineSpectatorConnection.status,
        lastError: onlineSpectatorConnection.lastError,
        clock: onlineSnapshot.clock,
        result: onlineSnapshot.result,
        spectatorUrl: buildSpectatorUrl(window.location.href, activeOnlineSpectator.gameId),
      };
    }

    return undefined;
  }, [
    onlineJoin,
    activeOnlineSpectator,
    onlineSnapshot,
    onlineOpponentInviteUrl,
    onlineVisibilityByGameId,
    onlineConnection,
    onlineSpectatorConnection,
    handleUpdateOnlineVisibility,
  ]);

  const pendingOnlineConnection = onlineJoin ? onlineConnection : onlineSpectatorConnection;
  const pendingOnlineMessage = formatOnlinePendingConnectionMessage(
    pendingOnlineConnection.status
  );
  const canRecoverPendingOnlineConnection =
    pendingOnlineConnection.status === "access-denied" ||
    pendingOnlineConnection.status === "protocol-error" ||
    pendingOnlineConnection.status === "server-error" ||
    pendingOnlineConnection.status === "terminal";

  const clearTransientOnlineState = useCallback(() => {
    cancelPendingReplay();
    clearAutosave();
    clearOnlineUrl();
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
    }
    if (onlineJoin) {
      forgetOnlineJoinParams(onlineJoin);
      forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
    }
    if (onlineSnapshot) {
      forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
    }
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
  }, [cancelPendingReplay, onlineChallenge, onlineJoin, onlineSnapshot]);

  const handleOnlineStateBackToPlay = useCallback(() => {
    clearTransientOnlineState();
    setViewStack(['game']);
    setPreviousView('game');
    setView('setup');
  }, [clearTransientOnlineState]);

  const handleOnlineStateTutorial = useCallback(() => {
    clearTransientOnlineState();
    setViewStack(['setup']);
    setPreviousView('setup');
    setView('tutorial');
  }, [clearTransientOnlineState]);

  const handleOnlineStateLibrary = useCallback(() => {
    clearTransientOnlineState();
    setViewStack(['setup']);
    setPreviousView('setup');
    setView('library');
  }, [clearTransientOnlineState]);

  const handleOnlineStateWatch = useCallback(() => {
    clearTransientOnlineState();
    setViewStack(['setup']);
    setPreviousView('setup');
    setView('watch');
  }, [clearTransientOnlineState]);

  const onlineStateDestinations = useMemo<AppShellDestination[]>(() => [
    { id: "play", label: "Play" },
    { id: "learn", label: "Learn", onClick: handleOnlineStateTutorial },
    { id: "library", label: "Library", onClick: handleOnlineStateLibrary },
    { id: "watch", label: "Watch", onClick: handleOnlineStateWatch },
  ], [handleOnlineStateTutorial, handleOnlineStateLibrary, handleOnlineStateWatch]);

  // Editor handlers
  const handleEditPosition = (board?: Board, pieces?: Piece[], sanctuaries?: Sanctuary[]) => {
    cancelPendingReplay();
    clearAutosave();
    setPreviousView(view);
    setEditorConfig({ board, pieces, sanctuaries });
    setView('editor');
  };

  const handleEditorBack = () => {
    cancelPendingReplay();
    setView(previousView);
  };

  const handlePlayFromEditor = (board: Board, pieces: Piece[], sanctuaries: Sanctuary[]) => {
    cancelPendingReplay();
    clearAutosave();
    const layout = getStartingLayout(board);
    clearOnlineUrl();
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl: undefined, isAnalysisMode: false });
    setGameKey(prev => prev + 1);
    setView('game');
  };

  return (
    <ThemeProvider>
    <div className="App">
      {isRulesPage ? (
        <RulesManualPage />
      ) : (
        <>
      {view === 'menu' && (
        <MainMenu 
          onPlay={handleNewGameClick} 
        />
      )}
      
      {view === 'setup' && (
        <GameSetup 
          onPlay={handleStartGame} 
          onCreateOnlineGame={handleCreateOnlineGame}
          onCreateOnlineChallenge={handleCreateOnlineChallenge}
          onBack={returnToPreviousView}
          backLabel={currentBackLabel}
          onTutorial={handleTutorialClick}
          onOpenLibrary={handleOpenLibrary}
          onOpenOnlineBrowser={handleOpenOnlineBrowser}
        />
      )}

      {view === 'challenge' && (
        <div className="online-state-page">
          <section className="online-state-panel" aria-label="Online challenge">
            <AppShellNav
              ariaLabel="Challenge navigation"
              activeDestination="play"
              title="Online Challenge"
              kicker="Challenge"
              description="Accept, cancel, or join a private game invite."
              backLabel="Back to play"
              onBack={handleOnlineStateBackToPlay}
              destinations={onlineStateDestinations}
            />
            <div className="online-state-status" role="status" aria-live="polite">
              {onlineChallengeStatus === "loading"
                ? "Loading challenge..."
                : onlineChallengeStatus === "acting"
                  ? "Updating challenge..."
                  : onlineChallengeError ?? `Status: ${onlineChallengeResponse?.summary.status ?? "pending"}`}
            </div>
            {onlineChallengeShareUrl && (
              <label className="online-state-field">
                Challenge link
                <input
                  readOnly
                  value={onlineChallengeShareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="online-state-input"
                />
              </label>
            )}
            {onlineChallengeResponse?.summary.status === "pending" && onlineChallengeResponse.role === "challenged" && (
              <div className="online-state-actions">
                <button
                  type="button"
                  onClick={handleAcceptOnlineChallenge}
                  disabled={onlineChallengeStatus === "acting"}
                  className="online-state-button accept"
                >
                  Accept Challenge
                </button>
                <button
                  type="button"
                  onClick={handleDeclineOnlineChallenge}
                  disabled={onlineChallengeStatus === "acting"}
                  className="online-state-button danger"
                >
                  Decline Challenge
                </button>
              </div>
            )}
            {onlineChallengeResponse?.summary.status === "pending" && onlineChallengeResponse.role === "challenger" && (
              <div className="online-state-actions">
                <button
                  type="button"
                  onClick={handleRefreshOnlineChallenge}
                  disabled={onlineChallengeStatus === "loading"}
                  className="online-state-button neutral"
                >
                  Refresh Challenge
                </button>
                <button
                  type="button"
                  onClick={handleCancelOnlineChallenge}
                  disabled={onlineChallengeStatus === "acting"}
                  className="online-state-button danger"
                >
                  Cancel Challenge
                </button>
              </div>
            )}
            {onlineChallengeResponse?.gameInvite && (
              <button
                type="button"
                onClick={() => onlineChallengeResponse.gameInvite && enterOnlineGameFromInvite(onlineChallengeResponse.gameInvite)}
                className="online-state-button primary"
              >
                Join Game
              </button>
            )}
          </section>
        </div>
      )}

      {view === 'game' && (onlineJoin || activeOnlineSpectator) && !onlineSnapshot && (
        <div className="online-state-page">
          <section className="online-state-panel compact" aria-label="Online game connection">
            <AppShellNav
              ariaLabel="Online game navigation"
              activeDestination="play"
              title="Online Game"
              kicker="Connection"
              description="Reconnect, recover, or move to another Castles area."
              backLabel="Back to play"
              onBack={handleOnlineStateBackToPlay}
              destinations={onlineStateDestinations}
            />
            <div className="online-state-status" role="status" aria-live="polite" aria-atomic="true">
              {pendingOnlineMessage}{
                pendingOnlineConnection.lastError
                  ? `: ${pendingOnlineConnection.lastError}`
                  : '...'
              }
            </div>
            {canRecoverPendingOnlineConnection && (
              <button
                type="button"
                onClick={handleOnlineStateBackToPlay}
                className="online-state-button neutral"
              >
                Configure New Game
              </button>
            )}
          </section>
        </div>
      )}

      {view === 'game' && ((!onlineJoin && !activeOnlineSpectator) || onlineSnapshot) && (
        <div style={{ height: '100vh', width: '100vw' }}> {/* Ensure full screen for game */}
            <GameBoard 
              key={gameKey}
              initialBoard={gameConfig.board}
              initialPieces={gameConfig.pieces}
              initialLayout={gameConfig.layout}
              initialMoveTree={gameConfig.moveTree}
              initialTurnCounter={gameConfig.turnCounter}
              initialSanctuaries={gameConfig.sanctuaries}
              initialGraveyard={gameConfig.graveyard}
              initialPhoenixRecords={gameConfig.phoenixRecords}
              initialPromotionPending={gameConfig.promotionPending}
              initialVictoryPoints={gameConfig.victoryPoints}
              timeControl={gameConfig.timeControl}
              sanctuarySettings={gameConfig.sanctuarySettings}
              gameRules={gameConfig.gameRules}
              isAnalysisMode={gameConfig.isAnalysisMode}
              onResign={() => {}} // Controlled internally or via prop if we want to bubble up
              onSetup={handleNewGameClick}
              onRestart={handleRestartGame}
              onLoadGame={handleLoadGame}
              onEditPosition={handleEditPosition}
              onTutorial={handleTutorialClick}
              onOpenLibrary={handleOpenLibrary}
              onOpenOnlineBrowser={handleOpenOnlineBrowser}
              onSaveGameToLibrary={handleSaveGameToLibrary}
              pieceTheme={gameConfig.pieceTheme}
              opponentConfig={gameConfig.opponentConfig}
              onlineSession={onlineSession}
              initialPoolTypes={gameConfig.initialPoolTypes}
            />
        </div>
      )}

      {view === 'library' && (
        <GameLibrary
          repository={gameLibraryRepository}
          onBack={returnToPreviousView}
          onOpenGame={handleOpenGame}
          backLabel={currentBackLabel}
          onTutorial={handleTutorialClick}
          onOpenOnlineBrowser={handleOpenOnlineBrowser}
          onLoadGame={handleLoadSavedGame}
          onImportPGN={handleImportPGNToLibrary}
        />
      )}

      {view === 'editor' && (
        <BoardEditor
          initialBoard={editorConfig.board}
          initialPieces={editorConfig.pieces}
          initialSanctuaries={editorConfig.sanctuaries}
          onPlay={handlePlayFromEditor}
          onBack={handleEditorBack}
        />
      )}

      {view === 'tutorial' && (
        <Tutorial
          onBack={returnToPreviousView}
          onOpenGame={handleOpenGame}
          backLabel={currentBackLabel}
          onOpenLibrary={handleOpenLibrary}
          onOpenOnlineBrowser={handleOpenOnlineBrowser}
        />
      )}

      {view === 'watch' && (
        <OnlineGameBrowser
          onBack={returnToPreviousView}
          onOpenGame={handleOpenGame}
          backLabel={currentBackLabel}
          onTutorial={handleTutorialClick}
          onOpenLibrary={handleOpenLibrary}
          onSpectate={handleSpectateOnlineGame}
          onReplay={handleReplayOnlineGame}
        />
      )}

      <InstallAppHint />
        </>
      )}
    </div>
    </ThemeProvider>
  );
}

export default App;

