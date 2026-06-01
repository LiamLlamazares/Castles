import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GameBoard from './components/Game';
import MainMenu from './components/MainMenu';
import GameSetup from './components/GameSetup';
import BoardEditor from './components/BoardEditor';
import Tutorial from './components/Tutorial';
import GameLibrary from './components/GameLibrary';
import OnlineGameBrowser from './components/OnlineGameBrowser';
import InstallAppHint from './components/InstallAppHint';
import RulesManualPage from './components/RulesManualPage';
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
  fetchOnlineChallenge,
  createOnlineGame,
  formatOnlinePendingConnectionMessage,
  forgetOnlineChallengeParams,
  rememberOnlineChallengeParams,
  rememberOnlineJoinParams,
  rememberOnlineOpponentInviteUrl,
  removeOnlineChallengeTokenFromUrl,
  removeOnlineTokenFromUrl,
  resolveOnlineChallengeParams,
  parseOnlineSpectatorParams,
  resolveOnlineOpponentInviteUrl,
  resolveOnlineJoinParams,
  OnlineChallengeParams,
  OnlineChallengeResponse,
  OnlineChallengeGameInvite,
  OnlineJoinParams,
  OnlineSpectatorParams,
} from './online/client';
import type { OnlineClientSession, OnlineGameSnapshotDTO } from './online/types';
import { ThemeProvider } from './contexts/ThemeContext';
import {
  BrowserGameLibraryRepository,
  SavedGameRecord,
  SavedGameStatus,
  createDefaultSavedGameName,
  createSavedGameRecord,
} from './Classes/Services/GameLibraryRepository';
import { loadPGNText } from './Classes/Services/PGNLoadService';
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
  const [onlineChallenge, setOnlineChallenge] = useState<OnlineChallengeParams | null>(() =>
    resolveOnlineChallengeParams(window.location.href)
  );
  const [onlineChallengeResponse, setOnlineChallengeResponse] = useState<OnlineChallengeResponse | null>(null);
  const [onlineChallengeShareUrl, setOnlineChallengeShareUrl] = useState<string | null>(null);
  const [onlineChallengeStatus, setOnlineChallengeStatus] = useState<"idle" | "loading" | "acting" | "error">("idle");
  const [onlineChallengeError, setOnlineChallengeError] = useState<string | null>(null);

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
    clearAutosave();
    clearOnlineUrl();
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
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
    if (view !== 'tutorial') {
      setViewStack(prev => [...prev, view]);
      setPreviousView(view);
    }
    setView('tutorial');
  };

  const handleOpenLibrary = () => {
    if (view !== 'library') {
      setViewStack(prev => [...prev, view]);
      setPreviousView(view);
    }
    setView('library');
  };

  const handleOpenOnlineBrowser = () => {
    if (view !== 'watch') {
      setViewStack(prev => [...prev, view]);
      setPreviousView(view);
    }
    setView('watch');
  };

  const returnToPreviousView = () => {
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

  const currentBackLabel = previousView === 'setup' ? 'Back to setup' : previousView === 'watch' ? 'Back to Watch' : 'Back to game';

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
    const layout = getStartingLayout(board);

    clearAutosave();
    clearOnlineUrl();
    if (onlineChallenge) {
      forgetOnlineChallengeParams(onlineChallenge);
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
      setView('game');
    } catch (error) {
      console.error("Failed to create online game", error);
      alert("Could not create an online game. Make sure the Node server is running.");
    }
  };

  const enterOnlineGameFromInvite = (invite: OnlineChallengeGameInvite) => {
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
    setView('game');
  };

  const handleSpectateOnlineGame = (gameId: string) => {
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

  const handleSaveGameToLibrary = async (pgn: string, status: SavedGameStatus) => {
    const defaultName = createDefaultSavedGameName(pgn);
    const name = prompt("Save game as:", defaultName);
    if (!name?.trim()) return;

    try {
      await gameLibraryRepository.saveGame(createSavedGameRecord({
        pgn,
        name: name.trim(),
        status
      }));
      alert("Game saved to library.");
    } catch (error) {
      console.error("Failed to save game to library", error);
      alert("Could not save game to library.");
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
    const setup = hydrateOnlineGameSetupDTO(snapshot.setup);
    const moveTree = createMoveTreeFromHistory(snapshot.moveHistory, snapshot.state);
    const state = hydrateGameStateDTO(snapshot.state, snapshot.setup, moveTree);
    const layout = getStartingLayout(setup.board);

    setOnlineSnapshot(snapshot);
    setGameConfig({
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
      isAnalysisMode: false,
    });
    setGameKey(prev => prev + 1);
    setView('game');
  }, []);

  const activeOnlineSpectator = onlineJoin ? null : onlineSpectator;
  const onlineConnection = useOnlineGameConnection(onlineJoin, handleOnlineSnapshot);
  const onlineSpectatorConnection = useOnlineSpectatorConnection(
    activeOnlineSpectator?.gameId ?? null,
    handleOnlineSnapshot
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
        opponentInviteUrl: onlineJoin.seat === "w" ? onlineOpponentInviteUrl ?? undefined : undefined,
        spectatorUrl: buildSpectatorUrl(window.location.href, onlineJoin.gameId),
        submitAction: onlineConnection.submitAction,
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
    onlineConnection,
    onlineSpectatorConnection,
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

  // Editor handlers
  const handleEditPosition = (board?: Board, pieces?: Piece[], sanctuaries?: Sanctuary[]) => {
    clearAutosave();
    setPreviousView(view);
    setEditorConfig({ board, pieces, sanctuaries });
    setView('editor');
  };

  const handleEditorBack = () => {
    setView(previousView);
  };

  const handlePlayFromEditor = (board: Board, pieces: Piece[], sanctuaries: Sanctuary[]) => {
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
          onTutorial={handleTutorialClick}
          onOpenLibrary={handleOpenLibrary}
          onOpenOnlineBrowser={handleOpenOnlineBrowser}
        />
      )}

      {view === 'challenge' && (
        <div
          style={{
            minHeight: '100vh',
            width: '100vw',
            background: '#151515',
            color: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
          }}
        >
          <section
            style={{
              width: 'min(640px, 100%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
            aria-label="Online challenge"
          >
            <button
              type="button"
              onClick={handleNewGameClick}
              style={{
                alignSelf: 'flex-start',
                minHeight: '38px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.24)',
                background: 'transparent',
                color: '#f5f5f5',
                cursor: 'pointer',
              }}
            >
              Back to play
            </button>
            <h1 style={{ margin: 0, fontSize: '1.6rem', letterSpacing: 0 }}>
              Online Challenge
            </h1>
            <div role="status" aria-live="polite">
              {onlineChallengeStatus === "loading"
                ? "Loading challenge..."
                : onlineChallengeStatus === "acting"
                  ? "Updating challenge..."
                  : onlineChallengeError ?? `Status: ${onlineChallengeResponse?.summary.status ?? "pending"}`}
            </div>
            {onlineChallengeShareUrl && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                Challenge link
                <input
                  readOnly
                  value={onlineChallengeShareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  style={{
                    minHeight: '42px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.24)',
                  }}
                />
              </label>
            )}
            {onlineChallengeResponse?.summary.status === "pending" && onlineChallengeResponse.role === "challenged" && (
              <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <button
                  type="button"
                  onClick={handleAcceptOnlineChallenge}
                  disabled={onlineChallengeStatus === "acting"}
                  style={{
                    minHeight: '44px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#2f855a',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Accept Challenge
                </button>
                <button
                  type="button"
                  onClick={handleDeclineOnlineChallenge}
                  disabled={onlineChallengeStatus === "acting"}
                  style={{
                    minHeight: '44px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.24)',
                    background: '#7f1d1d',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Decline Challenge
                </button>
              </div>
            )}
            {onlineChallengeResponse?.summary.status === "pending" && onlineChallengeResponse.role === "challenger" && (
              <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <button
                  type="button"
                  onClick={handleRefreshOnlineChallenge}
                  disabled={onlineChallengeStatus === "loading"}
                  style={{
                    minHeight: '44px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.24)',
                    background: '#f7f1d6',
                    color: '#141414',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Refresh Challenge
                </button>
                <button
                  type="button"
                  onClick={handleCancelOnlineChallenge}
                  disabled={onlineChallengeStatus === "acting"}
                  style={{
                    minHeight: '44px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.24)',
                    background: '#7f1d1d',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Cancel Challenge
                </button>
              </div>
            )}
            {onlineChallengeResponse?.gameInvite && (
              <button
                type="button"
                onClick={() => onlineChallengeResponse.gameInvite && enterOnlineGameFromInvite(onlineChallengeResponse.gameInvite)}
                style={{
                  minHeight: '44px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2b6cb0',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Join Game
              </button>
            )}
          </section>
        </div>
      )}

      {view === 'game' && (onlineJoin || activeOnlineSpectator) && !onlineSnapshot && (
        <div
          style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#151515',
            color: '#f5f5f5',
            fontSize: '1rem',
          }}
        >
          <div role="status" aria-live="polite" aria-atomic="true">
            {pendingOnlineMessage}{
              pendingOnlineConnection.lastError
                ? `: ${pendingOnlineConnection.lastError}`
                : '...'
            }
          </div>
          {canRecoverPendingOnlineConnection && (
            <button
              type="button"
              onClick={handleNewGameClick}
              style={{
                minHeight: '40px',
                padding: '10px 14px',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                borderRadius: '6px',
                background: '#f7f1d6',
                color: '#141414',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Configure New Game
            </button>
          )}
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
          backLabel={currentBackLabel}
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
          backLabel={currentBackLabel}
        />
      )}

      {view === 'watch' && (
        <OnlineGameBrowser
          onBack={returnToPreviousView}
          backLabel={currentBackLabel}
          onSpectate={handleSpectateOnlineGame}
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

