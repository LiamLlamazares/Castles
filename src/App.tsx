import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameBoard, { type SaveGameToLibraryResult } from './components/Game';
import MainMenu from './components/MainMenu';
import GameSetup from './components/GameSetup';
import BoardEditor from './components/BoardEditor';
import Tutorial from './components/Tutorial';
import GameLibrary from './components/GameLibrary';
import OnlineGameBrowser from './components/OnlineGameBrowser';
import { OnlineAccountDialog } from './components/OnlineAccountControls';
import InstallAppHint from './components/InstallAppHint';
import RulesManualPage from './components/RulesManualPage';
import AppShellNav, { AppShellDestination } from './components/AppShellNav';
import { Board } from './Classes/Core/Board';
import { Piece } from './Classes/Entities/Piece';
import { LayoutService } from './Classes/Systems/LayoutService';
import { MoveTree } from './Classes/Core/MoveTree';
import { SanctuaryType, PieceTheme } from './Constants';
import { Sanctuary } from './Classes/Entities/Sanctuary';
import { Castle } from './Classes/Entities/Castle';
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
  acceptOnlineAccountChallenge,
  acceptOpenSeek,
  cancelOnlineChallenge,
  cancelOnlineAccountChallenge,
  cancelOpenSeek,
  copyOnlineInviteUrl,
  createOnlineAccount,
  createOnlineChallenge,
  createOpenSeek,
  deleteOnlineAccount,
  declineOnlineChallenge,
  declineOnlineAccountChallenge,
  blockOnlineAccount,
  fetchOpenSeek,
  fetchOpenSeekDirectory,
  fetchOnlineAccountChallenges,
  fetchOnlineAccountGameSnapshot,
  fetchOnlineAccountGames,
  fetchOnlineAccountHeadToHeadGames,
  fetchOnlineAccountFollowing,
  fetchOnlineAccountMe,
  fetchOnlineAccountOAuthProviders,
  fetchOnlineAccountPrivacy,
  fetchOnlineAccountProfile,
  fetchOnlineRatingLeaderboard,
  fetchOnlineAccountSessions,
  fetchOnlineGameSummaries,
  fetchOnlineChallenge,
  fetchOnlineSpectatorSnapshot,
  followOnlineAccount,
  formatOnlinePendingConnectionMessage,
  forgetOnlineAccountSession,
  forgetOnlineChallengeParams,
  forgetOnlineChallengeShareUrl,
  forgetOnlineJoinParams,
  forgetOnlineOpponentInviteUrl,
  forgetOpenSeekCreatorParams,
  ONLINE_ACCOUNT_SESSION_STORAGE_KEY,
  listOpenSeekCreatorParams,
  rememberOnlineAccountSession,
  rememberOnlineChallengeParams,
  rememberOnlineChallengeShareUrl,
  rememberOnlineJoinParams,
  rememberOnlineOpponentInviteUrl,
  rememberOpenSeekCreatorParams,
  reportOnlineAccount,
  rejoinOnlineAccountGame,
  revokeAllOnlineAccountSessions,
  revokeOnlineAccountSession,
  resolveOnlineAccountSession,
  removeOnlineChallengeTokenFromUrl,
  removeOnlineTokenFromUrl,
  resolveOnlineChallengeParams,
  resolveOnlineChallengeShareUrl,
  parseOnlineSpectatorParams,
  resolveOnlineOpponentInviteUrl,
  resolveOnlineJoinParams,
  resolveStoredOnlineJoinParams,
  signInOnlineAccount,
  startQuickMatch,
  unblockOnlineAccount,
  unfollowOnlineAccount,
  updateOnlineAccountPrivacy,
  updateOnlineGameVisibility,
  OnlineRequestError,
  OnlineChallengeParams,
  OnlineChallengeResponse,
  OnlineChallengeGameInvite,
  OpenSeekCreatorParams,
  OpenSeekResponse,
  OnlineJoinParams,
  OnlineSpectatorParams,
  StoredOnlineAccountSession,
  FetchOnlineAccountChallengesOptions,
  FetchOnlineAccountGamesOptions,
  FetchOpenSeekDirectoryOptions,
  OnlineAccountPrivacyPatch,
  OnlineAccountReportInput,
} from './online/client';
import type { OnlineAccount } from './online/accounts';
import type { OnlineGameSummary } from './online/readModel';
import type { OpenSeekVisibility } from './online/seeks';
import type { OnlineClientSession, OnlineGameSetupDTO, OnlineGameSnapshotDTO, OnlineRatingMode } from './online/types';
import {
  clearRecentOnlineGames,
  loadRecentOnlineGames,
  rememberRecentOnlineGame,
  type RecentOnlineGameRecord,
} from './online/recentGames';
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

type ViewState = 'menu' | 'setup' | 'game' | 'editor' | 'tutorial' | 'library' | 'challenge' | 'online';
type OnlineBrowserInitialTab = 'lobby' | 'watch' | 'archive';
type OnlineAccountUiStatus =
  | "signed-out"
  | "checking"
  | "creating"
  | "signing-in"
  | "signing-out"
  | "signing-out-all"
  | "deleting"
  | "ready"
  | "error";

interface CreatedChallengeFromSetup {
  challengedUrl: string;
}

interface OnlineRematchTarget {
  gameId: string;
  displayName: string;
  setup: OnlineGameSetupDTO;
}

const DEFAULT_QUICK_MATCH_TIME_CONTROL = { initial: 20, increment: 20 } as const;
const QUICK_MATCH_MATCHED_NAVIGATION_DELAY_MS = 600;
const FIRST_RUN_INTRO_STORAGE_KEY = "castles_first_run_intro_seen";
const QUICK_START_STORAGE_KEY = "hasSeenQuickStart";

interface GameConfig {
  board?: Board;
  pieces?: Piece[];
  castles?: Castle[];
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
  ratingMode?: OnlineRatingMode;
  isAnalysisMode?: boolean;
  opponentConfig?: AIOpponentConfig;
}

interface LoadGameData {
  board: Board;
  pieces: Piece[];
  castles?: Castle[];
  turnCounter: number;
  sanctuaries: Sanctuary[];
  moveTree?: MoveTree;
  sanctuarySettings?: { unlockTurn: number; cooldown: number };
  initialPoolTypes?: SanctuaryType[];
  graveyard?: Piece[];
  phoenixRecords?: PhoenixRecord[];
  promotionPending?: Piece | null;
  gameRules?: { vpModeEnabled: boolean };
  pieceTheme?: PieceTheme;
  timeControl?: { initial: number; increment: number };
  victoryPoints?: { w: number; b: number };
}

interface LoadGameOptions {
  source?: "analysis" | "import" | "library";
}

type AnalysisReturnState =
  | {
      kind: "local-game";
      label: string;
      config: GameConfig;
    }
  | {
      kind: "online-game";
      label: string;
      onlineJoin: OnlineJoinParams | null;
      onlineSpectator: OnlineSpectatorParams | null;
      onlineSnapshot: OnlineGameSnapshotDTO;
      opponentInviteUrl: string | null;
    }
  | {
      kind: "online-browser";
      label: string;
      tab: OnlineBrowserInitialTab;
    };

interface AccountChallengeOptions {
  intent?: "challenge" | "rematch";
  sourceGameId?: string;
}

interface EditorConfig {
  board?: Board;
  pieces?: Piece[];
  sanctuaries?: Sanctuary[];
}

function resolveRegisteredRematchOpponent(
  summary: OnlineGameSummary,
  account: OnlineAccount
): string | null {
  if (summary.status !== "complete") return null;
  const accountParticipant = summary.participants.find((participant) =>
    participant.identity.kind === "registered" &&
    participant.identity.id === account.identity.id
  );
  if (!accountParticipant) return null;
  const opponent = summary.participants.find((participant) => participant.seat !== accountParticipant.seat);
  if (opponent?.identity.kind !== "registered" || !opponent.identity.displayName) return null;
  return opponent.identity.displayName;
}

interface SaveGameDialogState {
  pgn: string;
  status: SavedGameStatus;
  name: string;
  isSaving: boolean;
  error: string | null;
  resolve: (result: SaveGameToLibraryResult) => void;
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
    castles: state.castles,
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
    ratingMode: setup.ratingMode,
    isAnalysisMode,
  };
}

function createGameConfigFromLoadData(data: LoadGameData, isAnalysisMode: boolean): GameConfig {
  return {
    board: data.board,
    pieces: data.pieces,
    castles: data.castles,
    layout: getStartingLayout(data.board),
    moveTree: data.moveTree,
    turnCounter: data.turnCounter,
    sanctuaries: data.sanctuaries,
    sanctuarySettings: data.sanctuarySettings,
    initialPoolTypes: data.initialPoolTypes,
    graveyard: data.graveyard,
    phoenixRecords: data.phoenixRecords,
    promotionPending: data.promotionPending,
    gameRules: data.gameRules,
    pieceTheme: data.pieceTheme,
    timeControl: data.timeControl,
    victoryPoints: data.victoryPoints,
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
          castles: replay.castles,
          layout: getStartingLayout(replay.board),
          moveTree: replay.moveTree,
          turnCounter: replay.turnCounter,
          sanctuaries: replay.sanctuaries,
          sanctuarySettings: replay.sanctuarySettings ?? setup.sanctuarySettings,
          initialPoolTypes: replay.sanctuaryPool ?? hydratedConfig.initialPoolTypes,
          graveyard: replay.graveyard,
          phoenixRecords: replay.phoenixRecords,
          promotionPending: replay.promotionPending,
          victoryPoints: replay.victoryPoints,
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
  const isRulesPage = window.location.pathname === '/rules';
  const [view, setView] = useState<ViewState>('game');
  const [gameConfig, setGameConfig] = useState<GameConfig>({});
  const [editorConfig, setEditorConfig] = useState<EditorConfig>({});
  const [viewStack, setViewStack] = useState<ViewState[]>([]);
  const [gameLibraryRepository] = useState(() => new BrowserGameLibraryRepository());
  const [saveGameDialog, setSaveGameDialog] = useState<SaveGameDialogState | null>(null);
  const [isFirstRunIntroOpen, setIsFirstRunIntroOpen] = useState(false);
  const appRootRef = useRef<HTMLDivElement>(null);
  const saveDialogRef = useRef<HTMLFormElement>(null);
  const saveNameInputRef = useRef<HTMLInputElement>(null);
  const saveDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const activeSaveDialogRequestRef = useRef<SaveGameDialogState | null>(null);
  const firstRunIntroDialogRef = useRef<HTMLElement>(null);
  const firstRunIntroPrimaryButtonRef = useRef<HTMLButtonElement>(null);
  const [onlineJoin, setOnlineJoin] = useState<OnlineJoinParams | null>(() =>
    resolveOnlineJoinParams(window.location.href)
  );
  const [onlineSpectator, setOnlineSpectator] = useState<OnlineSpectatorParams | null>(() =>
    parseOnlineSpectatorParams(window.location.href)
  );
  const [onlineSnapshot, setOnlineSnapshot] = useState<OnlineGameSnapshotDTO | null>(null);
  const [recentOnlineGames, setRecentOnlineGames] = useState<RecentOnlineGameRecord[]>(() =>
    loadRecentOnlineGames()
  );
  const [onlineOpponentInviteUrl, setOnlineOpponentInviteUrl] = useState<string | null>(() =>
    onlineJoin?.seat === "w" ? resolveOnlineOpponentInviteUrl(onlineJoin.gameId) : null
  );
  const [onlineVisibilityByGameId, setOnlineVisibilityByGameId] = useState<Record<string, OnlineGameVisibility>>({});
  const [onlineChallenge, setOnlineChallenge] = useState<OnlineChallengeParams | null>(() =>
    resolveOnlineChallengeParams(window.location.href)
  );
  const [onlineChallengeResponse, setOnlineChallengeResponse] = useState<OnlineChallengeResponse | null>(null);
  const [onlineChallengeShareUrl, setOnlineChallengeShareUrl] = useState<string | null>(() =>
    onlineChallenge?.role === "challenger"
      ? resolveOnlineChallengeShareUrl(onlineChallenge.challengeId)
      : null
  );
  const [onlineChallengeShareMessage, setOnlineChallengeShareMessage] = useState("");
  const [onlineChallengeStatus, setOnlineChallengeStatus] = useState<"idle" | "loading" | "acting" | "error">("idle");
  const [onlineChallengeError, setOnlineChallengeError] = useState<string | null>(null);
  const [openSeekCreator, setOpenSeekCreator] = useState<OpenSeekCreatorParams | null>(() =>
    listOpenSeekCreatorParams()[0] ?? null
  );
  const [openSeekResponse, setOpenSeekResponse] = useState<OpenSeekResponse | null>(null);
  const [onlineBrowserTab, setOnlineBrowserTab] = useState<OnlineBrowserInitialTab>("lobby");
  const [onlineAccountSession, setOnlineAccountSession] = useState<StoredOnlineAccountSession | null>(() =>
    resolveOnlineAccountSession()
  );
  const [onlineAccount, setOnlineAccount] = useState<OnlineAccount | null>(() =>
    resolveOnlineAccountSession()?.account ?? null
  );
  const [onlineAccountStatus, setOnlineAccountStatus] = useState<OnlineAccountUiStatus>(() =>
    resolveOnlineAccountSession() ? "checking" : "signed-out"
  );
  const [onlineAccountError, setOnlineAccountError] = useState<string | null>(null);
  const [isOnlineAccountDialogOpen, setOnlineAccountDialogOpen] = useState(false);
  const [onlineRematchTarget, setOnlineRematchTarget] = useState<OnlineRematchTarget | null>(null);
  const [rejoiningAccountGameId, setRejoiningAccountGameId] = useState<string | null>(null);
  const [analysisReturn, setAnalysisReturn] = useState<AnalysisReturnState | null>(null);
  const replayRequestIdRef = useRef(0);
  const onlineChallengePollInFlightRef = useRef(false);
  const isSaveDialogOpen = saveGameDialog !== null;
  const isFirstRunIntroVisible = isFirstRunIntroOpen && !isRulesPage;
  const isAppModalOpen = isSaveDialogOpen || isFirstRunIntroVisible || isOnlineAccountDialogOpen;
  const onlineSnapshotVisibility = onlineSnapshot
    ? onlineVisibilityByGameId[onlineSnapshot.gameId]
    : undefined;
  const onlineAccountAuth = useMemo(
    () => onlineAccountSession ? { token: onlineAccountSession.token } : undefined,
    [onlineAccountSession?.token]
  );

  useEffect(() => {
    const handleOnlineAccountStorageChange = (event: StorageEvent) => {
      if (event.key !== null && event.key !== ONLINE_ACCOUNT_SESSION_STORAGE_KEY) return;
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      setOnlineAccountSession(resolveOnlineAccountSession());
    };

    window.addEventListener("storage", handleOnlineAccountStorageChange);
    return () => {
      window.removeEventListener("storage", handleOnlineAccountStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!onlineAccountSession) {
      setOnlineAccount(null);
      setOnlineAccountStatus("signed-out");
      setOnlineAccountError(null);
      return;
    }

    let cancelled = false;
    if (onlineAccountSession.account) {
      setOnlineAccount(onlineAccountSession.account);
      setOnlineAccountStatus("ready");
    } else {
      setOnlineAccountStatus("checking");
    }

    fetchOnlineAccountMe({ token: onlineAccountSession.token })
      .then((response) => {
        if (cancelled) return;
        const nextSession = {
          sessionId: onlineAccountSession.sessionId,
          token: onlineAccountSession.token,
          account: response.account,
        };
        rememberOnlineAccountSession(nextSession);
        setOnlineAccountSession(nextSession);
        setOnlineAccount(response.account);
        setOnlineAccountStatus("ready");
        setOnlineAccountError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "";
        if (/\((401|403)\)/.test(message)) {
          forgetOnlineAccountSession();
          setOnlineAccountSession(null);
          setOnlineAccount(null);
          setOnlineAccountStatus("signed-out");
          setOnlineAccountError("Your online account session expired.");
          return;
        }
        setOnlineAccount(onlineAccountSession.account ?? null);
        setOnlineAccountStatus("error");
        setOnlineAccountError("Could not refresh online account. You can still play anonymously.");
      });

    return () => {
      cancelled = true;
    };
  }, [onlineAccountSession?.token]);

  useEffect(() => {
    if (isRulesPage || onlineJoin || onlineSpectator || onlineChallenge) return;
    try {
      if (localStorage.getItem(FIRST_RUN_INTRO_STORAGE_KEY) === "true") return;
    } catch {
      // If storage is unavailable, still show the one-session introduction.
    }
    setIsFirstRunIntroOpen(true);
  }, [isRulesPage, onlineJoin, onlineSpectator, onlineChallenge]);

  useEffect(() => {
    const root = appRootRef.current;
    if (!root || !isAppModalOpen) return;

    const backgroundChildren = Array.from(root.children).filter(
      (child) => !child.classList.contains("app-modal-backdrop")
    );

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
  }, [isAppModalOpen]);

  useEffect(() => {
    if (!isSaveDialogOpen) return;
    saveNameInputRef.current?.focus();
  }, [isSaveDialogOpen]);

  useEffect(() => {
    if (!isFirstRunIntroVisible) return;
    firstRunIntroPrimaryButtonRef.current?.focus();
  }, [isFirstRunIntroVisible]);

  useEffect(() => {
    return () => {
      activeSaveDialogRequestRef.current?.resolve(false);
      activeSaveDialogRequestRef.current = null;
    };
  }, []);

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

  const clearOpenSeekState = () => {
    if (openSeekCreator) {
      forgetOpenSeekCreatorParams(openSeekCreator);
    }
    setOpenSeekCreator(null);
    setOpenSeekResponse(null);
  };

  const clearAnalysisReturn = () => {
    setAnalysisReturn(null);
  };

  const forgetOnlineChallengeStorage = useCallback((challenge: OnlineChallengeParams | null) => {
    if (!challenge) return;
    forgetOnlineChallengeParams(challenge);
    forgetOnlineChallengeShareUrl(challenge.challengeId);
  }, []);

  useEffect(() => {
    setOnlineChallengeShareMessage("");
  }, [onlineChallengeShareUrl]);

  useEffect(() => {
    if (!onlineJoin) return;
    forgetOnlineChallengeStorage(onlineChallenge);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    rememberOnlineJoinParams(onlineJoin);
    clearOnlineTokenFromUrl();
  }, [forgetOnlineChallengeStorage, onlineChallenge, onlineJoin]);

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
    if (!onlineSnapshot || (!onlineJoin && !onlineSpectator)) return;
    if (onlineSnapshotVisibility === "private") return;
    setRecentOnlineGames(
      rememberRecentOnlineGame({
        gameId: onlineSnapshot.gameId,
        status: onlineSnapshot.result ? "complete" : "active",
        role: onlineJoin ? "player" : "spectator",
        seat: onlineJoin?.seat,
      })
    );
  }, [onlineJoin, onlineSnapshot?.gameId, onlineSnapshot?.result, onlineSnapshotVisibility, onlineSpectator]);

  useEffect(() => {
    const accountToken = onlineAccountSession?.token;
    if (!onlineJoin || !onlineSnapshot?.result || !onlineAccount || !accountToken) {
      setOnlineRematchTarget(null);
      return;
    }

    const gameId = onlineSnapshot.gameId;
    const setup = onlineSnapshot.setup;
    let cancelled = false;
    fetchOnlineAccountGames({ token: accountToken }, { state: "all" })
      .then((directory) => {
        if (cancelled) return;
        const summary = directory.games.find((game) => game.gameId === gameId);
        const displayName = summary ? resolveRegisteredRematchOpponent(summary, onlineAccount) : null;
        setOnlineRematchTarget(displayName ? { gameId, displayName, setup } : null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to resolve online rematch opponent", error);
        setOnlineRematchTarget(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    onlineAccount,
    onlineAccountSession?.token,
    onlineJoin,
    onlineSnapshot?.gameId,
    onlineSnapshot?.result,
    onlineSnapshot?.setup,
  ]);

  useEffect(() => {
    if (!onlineChallenge) return;
    setView('challenge');
    rememberOnlineChallengeParams(onlineChallenge);
    setOnlineChallengeShareUrl(
      onlineChallenge.role === "challenger"
        ? resolveOnlineChallengeShareUrl(onlineChallenge.challengeId)
        : null
    );
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

  useEffect(() => {
    if (
      !onlineChallenge ||
      onlineChallengeResponse?.summary.status !== "pending" ||
      onlineChallengeStatus === "loading" ||
      onlineChallengeStatus === "acting"
    ) {
      onlineChallengePollInFlightRef.current = false;
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(() => {
      if (onlineChallengePollInFlightRef.current) return;
      onlineChallengePollInFlightRef.current = true;
      fetchOnlineChallenge(onlineChallenge)
        .then((response) => {
          if (cancelled) return;
          setOnlineChallengeResponse(response);
          setOnlineChallengeError(null);
          setOnlineChallengeStatus((status) => (status === "error" ? "idle" : status));
        })
        .catch((error) => {
          if (!cancelled) {
            console.warn("Failed to auto-refresh online challenge", error);
          }
        })
        .finally(() => {
          if (!cancelled) {
            onlineChallengePollInFlightRef.current = false;
          }
        });
    }, 1000);

    return () => {
      cancelled = true;
      onlineChallengePollInFlightRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [onlineChallenge, onlineChallengeResponse?.summary.status, onlineChallengeStatus]);

  useEffect(() => {
    if (!openSeekCreator || openSeekResponse?.summary.seekId === openSeekCreator.seekId) return;
    let cancelled = false;
    fetchOpenSeek(openSeekCreator)
      .then((response) => {
        if (cancelled) return;
        if (response.summary.status === "cancelled" || response.summary.status === "expired") {
          forgetOpenSeekCreatorParams(openSeekCreator);
          setOpenSeekCreator(null);
          setOpenSeekResponse(null);
          return;
        }
        setOpenSeekResponse(response);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to restore open seek creator state", error);
        forgetOpenSeekCreatorParams(openSeekCreator);
        setOpenSeekCreator(null);
        setOpenSeekResponse(null);
      });
    return () => {
      cancelled = true;
    };
  }, [openSeekCreator, openSeekResponse?.summary.seekId]);

  const pushView = (nextView: ViewState) => {
    cancelPendingReplay();
    if (view === nextView) return;
    setViewStack(prev => [...prev, view]);
    setView(nextView);
  };

  const enterGameView = () => {
    cancelPendingReplay();
    setViewStack([]);
    setView('game');
  };

  const enterSetupView = (backTarget: ViewState) => {
    cancelPendingReplay();
    setViewStack([backTarget]);
    setView('setup');
  };

  const handleNewGameClick = () => {
    cancelPendingReplay();
    clearAnalysisReturn();
    clearAutosave();
    clearOnlineUrl();
    forgetOnlineChallengeStorage(onlineChallenge);
    if (onlineJoin) {
      forgetOnlineJoinParams(onlineJoin);
      forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
    }
    if (onlineSnapshot) {
      forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
    }
    clearOpenSeekState();
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    const backTarget = view === 'game' || view === 'setup' ? 'game' : view;
    enterSetupView(backTarget);
  };

  const handleTutorialClick = () => {
    pushView('tutorial');
  };

  const handleOpenLibrary = () => {
    pushView('library');
  };

  const handleOpenOnlineBrowser = () => {
    pushView('online');
  };

  const handleOpenGame = () => {
    enterGameView();
  };

  const returnToPreviousView = () => {
    cancelPendingReplay();
    const next = [...viewStack];
    const target = next.pop() ?? 'game';
    setViewStack(next);
    setView(target);
  };

  const markFirstRunIntroSeen = () => {
    try {
      localStorage.setItem(FIRST_RUN_INTRO_STORAGE_KEY, "true");
      localStorage.setItem(QUICK_START_STORAGE_KEY, "true");
    } catch {
      // Storage failures should not trap the player behind onboarding.
    }
    setIsFirstRunIntroOpen(false);
  };

  const handleFirstRunIntroPlay = () => {
    markFirstRunIntroSeen();
    enterSetupView('game');
    window.setTimeout(() => {
      appRootRef.current?.focus();
    }, 0);
  };

  const handleFirstRunIntroTutorial = () => {
    markFirstRunIntroSeen();
    pushView('tutorial');
  };

  const handleFirstRunIntroKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleFirstRunIntroPlay();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      firstRunIntroDialogRef.current?.querySelectorAll<HTMLElement>(
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
  };

  const currentBackTarget = viewStack[viewStack.length - 1] ?? 'game';
  const currentBackLabel =
    currentBackTarget === 'setup'
      ? 'Back to setup'
      : currentBackTarget === 'online'
        ? 'Back to Online'
        : currentBackTarget === 'tutorial'
          ? 'Back to Tutorial'
          : currentBackTarget === 'library'
            ? 'Back to Library'
            : currentBackTarget === 'menu'
              ? 'Back to menu'
              : 'Back to game';

  const quickMatchSetup = useMemo(() => {
    if (!gameConfig.board || !gameConfig.pieces) return null;
    const timeControl = gameConfig.timeControl ?? { ...DEFAULT_QUICK_MATCH_TIME_CONTROL };
    return serializeOnlineGameSetup({
      board: gameConfig.board,
      pieces: gameConfig.pieces,
      sanctuaries: gameConfig.sanctuaries ?? [],
      timeControl,
      sanctuarySettings: gameConfig.sanctuarySettings,
      gameRules: gameConfig.gameRules,
      initialPoolTypes: gameConfig.initialPoolTypes,
      pieceTheme: gameConfig.pieceTheme,
      ratingMode: gameConfig.ratingMode,
    });
  }, [
    gameConfig.board,
    gameConfig.gameRules,
    gameConfig.initialPoolTypes,
    gameConfig.pieceTheme,
    gameConfig.pieces,
    gameConfig.ratingMode,
    gameConfig.sanctuaries,
    gameConfig.sanctuarySettings,
    gameConfig.timeControl,
  ]);

  const onlineLobbySetup = useMemo(() => {
    if (gameConfig.isAnalysisMode || onlineJoin || onlineSpectator || onlineChallenge) return null;
    return quickMatchSetup;
  }, [gameConfig.isAnalysisMode, onlineChallenge, onlineJoin, onlineSpectator, quickMatchSetup]);

  const quickMatchSetupSummary = useMemo(() => {
    if (!onlineLobbySetup) return undefined;
    const clock = onlineLobbySetup.timeControl ?? DEFAULT_QUICK_MATCH_TIME_CONTROL;
    return {
      boardRadius: onlineLobbySetup.board.config.nSquares,
      clock: `Timed ${clock.initial}+${clock.increment}`,
      scoring: onlineLobbySetup.gameRules?.vpModeEnabled ? "Victory points" : "Castle control",
      rating: onlineLobbySetup.ratingMode === "rated" ? "Rated" : "Casual",
    };
  }, [onlineLobbySetup]);

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
    opponentConfig?: AIOpponentConfig,
    ratingMode?: OnlineRatingMode
  ) => {
    cancelPendingReplay();
    clearAnalysisReturn();
    const layout = getStartingLayout(board);

    clearAutosave();
    clearOnlineUrl();
    forgetOnlineChallengeStorage(onlineChallenge);
    if (onlineJoin) {
      forgetOnlineJoinParams(onlineJoin);
      forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
    }
    if (onlineSnapshot) {
      forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
    }
    clearOpenSeekState();
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl, sanctuarySettings, gameRules, initialPoolTypes, pieceTheme, ratingMode, isAnalysisMode: false, opponentConfig });
    setGameKey(prev => prev + 1);
    enterGameView();
  };

  const enterOnlineGameFromJoin = (
    join: OnlineJoinParams,
    urlSource?: string,
    knownVisibility?: OnlineGameVisibility
  ) => {
    cancelPendingReplay();
    clearAnalysisReturn();
    forgetOnlineChallengeStorage(onlineChallenge);
    clearOpenSeekState();
    rememberOnlineJoinParams(join);
    const joinUrl = urlSource
      ? new URL(removeOnlineTokenFromUrl(urlSource))
      : new URL(window.location.href);
    joinUrl.searchParams.delete("view");
    joinUrl.searchParams.delete("pgn");
    joinUrl.searchParams.delete("game");
    joinUrl.searchParams.delete("onlineChallenge");
    joinUrl.searchParams.delete("challengeRole");
    joinUrl.searchParams.delete("challengeToken");
    joinUrl.searchParams.set("onlineGame", join.gameId);
    joinUrl.searchParams.set("seat", join.seat);
    joinUrl.searchParams.delete("token");
    joinUrl.hash = "";
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
      [join.gameId]: knownVisibility ?? prev[join.gameId] ?? "unlisted",
    }));
    enterGameView();
  };

  const enterOnlineGameFromInvite = (invite: OnlineChallengeGameInvite) => {
    enterOnlineGameFromJoin(
      {
        gameId: invite.gameId,
        seat: invite.seat,
        token: invite.token,
      },
      invite.url
    );
  };

  const handleSpectateOnlineGame = (gameId: string) => {
    cancelPendingReplay();
    clearAnalysisReturn();
    forgetOnlineChallengeStorage(onlineChallenge);
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
    enterGameView();
  };

  const handleReplayOnlineGame = async (gameId: string) => {
    const requestId = replayRequestIdRef.current + 1;
    replayRequestIdRef.current = requestId;
    forgetOnlineChallengeStorage(onlineChallenge);
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
      setAnalysisReturn({
        kind: "online-browser",
        label: "Back to Online Archive",
        tab: "archive",
      });
      setGameConfig(replayConfig);
      setGameKey(prev => prev + 1);
      enterGameView();
    } catch (error) {
      if (replayRequestIdRef.current !== requestId) return;
      console.error("Failed to open archived online replay", error);
      alert("Could not open this replay. The game may no longer allow spectator replay.");
    }
  };

  const handleClearRecentOnlineGames = useCallback(() => {
    clearRecentOnlineGames();
    setRecentOnlineGames([]);
  }, []);

  const handleCreateOnlineAccount = useCallback(async (displayName: string, password: string) => {
    setOnlineAccountStatus("creating");
    setOnlineAccountError(null);
    try {
      const created = await createOnlineAccount(displayName, password);
      const nextSession = {
        sessionId: created.session.sessionId,
        token: created.session.token,
        account: created.account,
      };
      rememberOnlineAccountSession(nextSession);
      setOnlineAccountSession(nextSession);
      setOnlineAccount(created.account);
      setOnlineAccountStatus("ready");
    } catch (error) {
      console.error("Failed to create online account", error);
      setOnlineAccountStatus(onlineAccountSession ? "error" : "signed-out");
      setOnlineAccountError(
        error instanceof OnlineRequestError
          ? error.message
          : "Could not create that online account name."
      );
      throw error;
    }
  }, [onlineAccountSession]);

  const handleSignInOnlineAccount = useCallback(async (displayName: string, password: string) => {
    setOnlineAccountStatus("signing-in");
    setOnlineAccountError(null);
    try {
      const signedIn = await signInOnlineAccount(displayName, password);
      const nextSession = {
        sessionId: signedIn.session.sessionId,
        token: signedIn.session.token,
        account: signedIn.account,
      };
      rememberOnlineAccountSession(nextSession);
      setOnlineAccountSession(nextSession);
      setOnlineAccount(signedIn.account);
      setOnlineAccountStatus("ready");
    } catch (error) {
      console.error("Failed to sign in online account", error);
      setOnlineAccountStatus(onlineAccountSession ? "error" : "signed-out");
      setOnlineAccountError(
        error instanceof OnlineRequestError
          ? error.message
          : "Could not sign in with that display name and password."
      );
      throw error;
    }
  }, [onlineAccountSession]);

  const handleSignOutOnlineAccount = useCallback(async () => {
    const session = onlineAccountSession;
    if (!session) {
      forgetOnlineAccountSession();
      setOnlineAccount(null);
      setOnlineAccountStatus("signed-out");
      setOnlineAccountError(null);
      return;
    }

    setOnlineAccountStatus("signing-out");
    setOnlineAccountError(null);
    try {
      await revokeOnlineAccountSession({ token: session.token });
      forgetOnlineAccountSession();
      setOnlineAccountSession(null);
      setOnlineAccount(null);
      setOnlineAccountStatus("signed-out");
      setOnlineAccountError(null);
    } catch (error) {
      console.error("Failed to revoke online account session", error);
      const storedSession = resolveOnlineAccountSession();
      if (storedSession?.token !== session.token) {
        setOnlineAccountSession(storedSession);
        setOnlineAccount(storedSession?.account ?? null);
        setOnlineAccountStatus(
          storedSession ? (storedSession.account ? "ready" : "checking") : "signed-out"
        );
        setOnlineAccountError(null);
        return;
      }
      setOnlineAccount(session.account ?? onlineAccount);
      setOnlineAccountStatus("error");
      setOnlineAccountError(
        error instanceof OnlineRequestError
          ? error.message
          : "Could not sign out. Check your connection and try again."
      );
    }
  }, [onlineAccount, onlineAccountSession]);

  const handleSignOutAllOnlineAccountSessions = useCallback(async () => {
    const session = onlineAccountSession;
    if (!session) {
      forgetOnlineAccountSession();
      setOnlineAccountSession(null);
      setOnlineAccount(null);
      setOnlineAccountStatus("signed-out");
      setOnlineAccountError(null);
      return;
    }

    setOnlineAccountStatus("signing-out-all");
    setOnlineAccountError(null);
    try {
      await revokeAllOnlineAccountSessions({ token: session.token });
      forgetOnlineAccountSession();
      setOnlineAccountSession(null);
      setOnlineAccount(null);
      setOnlineAccountStatus("signed-out");
      setOnlineAccountError(null);
    } catch (error) {
      console.error("Failed to revoke all online account sessions", error);
      const storedSession = resolveOnlineAccountSession();
      if (storedSession?.token !== session.token) {
        setOnlineAccountSession(storedSession);
        setOnlineAccount(storedSession?.account ?? null);
        setOnlineAccountStatus(
          storedSession ? (storedSession.account ? "ready" : "checking") : "signed-out"
        );
        setOnlineAccountError(null);
        return;
      }
      setOnlineAccount(session.account ?? onlineAccount);
      setOnlineAccountStatus("error");
      setOnlineAccountError(
        error instanceof OnlineRequestError
          ? error.message
          : "Could not sign out everywhere. Check your connection and try again."
      );
      throw error;
    }
  }, [onlineAccount, onlineAccountSession]);

  const handleDeleteOnlineAccount = useCallback(async () => {
    const session = onlineAccountSession;
    if (!session) {
      forgetOnlineAccountSession();
      setOnlineAccountSession(null);
      setOnlineAccount(null);
      setOnlineAccountStatus("signed-out");
      setOnlineAccountError(null);
      return;
    }

    setOnlineAccountStatus("deleting");
    setOnlineAccountError(null);
    try {
      await deleteOnlineAccount({ token: session.token });
      forgetOnlineAccountSession();
      setOnlineAccountSession(null);
      setOnlineAccount(null);
      setOnlineAccountStatus("signed-out");
      setOnlineAccountError(null);
    } catch (error) {
      console.error("Failed to delete online account", error);
      const storedSession = resolveOnlineAccountSession();
      if (storedSession?.token !== session.token) {
        setOnlineAccountSession(storedSession);
        setOnlineAccount(storedSession?.account ?? null);
        setOnlineAccountStatus(
          storedSession ? (storedSession.account ? "ready" : "checking") : "signed-out"
        );
        setOnlineAccountError(null);
        return;
      }
      setOnlineAccount(session.account ?? onlineAccount);
      setOnlineAccountStatus("error");
      setOnlineAccountError(
        error instanceof OnlineRequestError
          ? error.message
          : "Could not delete account. Check your connection and try again."
      );
      throw error;
    }
  }, [onlineAccount, onlineAccountSession]);

  const handleLoadOnlineAccountGames = useCallback((options?: FetchOnlineAccountGamesOptions) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return fetchOnlineAccountGames({ token: onlineAccountSession.token }, options);
  }, [onlineAccountSession?.token]);

  const handleLoadOnlineAccountHeadToHeadGames = useCallback((
    displayName: string,
    options?: Omit<FetchOnlineAccountGamesOptions, "state">
  ) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return fetchOnlineAccountHeadToHeadGames({ token: onlineAccountSession.token }, displayName, options);
  }, [onlineAccountSession?.token]);

  const handleLoadOnlineAccountChallenges = useCallback((options?: FetchOnlineAccountChallengesOptions) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return fetchOnlineAccountChallenges({ token: onlineAccountSession.token }, options);
  }, [onlineAccountSession?.token]);

  const handleLoadOpenSeekDirectory = useCallback((options?: FetchOpenSeekDirectoryOptions) => {
    return fetchOpenSeekDirectory({
      ...options,
      account: onlineAccountAuth,
    });
  }, [onlineAccountAuth]);

  const handleAcceptOnlineAccountChallenge = useCallback(async (challengeId: string) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    const response = await acceptOnlineAccountChallenge(
      { token: onlineAccountSession.token },
      challengeId
    );
    if (response.gameInvite) {
      enterOnlineGameFromInvite(response.gameInvite);
    }
    return response;
  }, [enterOnlineGameFromInvite, onlineAccountSession?.token]);

  const handleDeclineOnlineAccountChallenge = useCallback((challengeId: string) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return declineOnlineAccountChallenge({ token: onlineAccountSession.token }, challengeId);
  }, [onlineAccountSession?.token]);

  const handleCancelOnlineAccountChallenge = useCallback((challengeId: string) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return cancelOnlineAccountChallenge({ token: onlineAccountSession.token }, challengeId);
  }, [onlineAccountSession?.token]);

  const handleLoadOnlineAccountProfile = useCallback((displayName: string) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return fetchOnlineAccountProfile({ token: onlineAccountSession.token }, displayName);
  }, [onlineAccountSession?.token]);

  const handleLoadOnlineAccountFollowing = useCallback(() => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return fetchOnlineAccountFollowing({ token: onlineAccountSession.token });
  }, [onlineAccountSession?.token]);

  const handleLoadOnlineRatingLeaderboard = useCallback((options: { limit?: number; scope?: "global" | "following" } = {}) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return fetchOnlineRatingLeaderboard(
      options.scope === "following"
        ? { ...options, account: { token: onlineAccountSession.token } }
        : options
    );
  }, [onlineAccountSession?.token]);

  const handleFollowOnlineAccount = useCallback((displayName: string) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return followOnlineAccount({ token: onlineAccountSession.token }, displayName);
  }, [onlineAccountSession?.token]);

  const handleUnfollowOnlineAccount = useCallback((displayName: string) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return unfollowOnlineAccount({ token: onlineAccountSession.token }, displayName);
  }, [onlineAccountSession?.token]);

  const handleBlockOnlineAccount = useCallback((displayName: string) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return blockOnlineAccount({ token: onlineAccountSession.token }, displayName);
  }, [onlineAccountSession?.token]);

  const handleUnblockOnlineAccount = useCallback((displayName: string) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return unblockOnlineAccount({ token: onlineAccountSession.token }, displayName);
  }, [onlineAccountSession?.token]);

  const handleReportOnlineAccount = useCallback((displayName: string, input: OnlineAccountReportInput) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return reportOnlineAccount({ token: onlineAccountSession.token }, displayName, input);
  }, [onlineAccountSession?.token]);

  const handleLoadOnlineAccountPrivacy = useCallback(() => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return fetchOnlineAccountPrivacy({ token: onlineAccountSession.token });
  }, [onlineAccountSession?.token]);

  const handleUpdateOnlineAccountPrivacy = useCallback((patch: OnlineAccountPrivacyPatch) => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return updateOnlineAccountPrivacy({ token: onlineAccountSession.token }, patch);
  }, [onlineAccountSession?.token]);

  const handleLoadOnlineAccountSessions = useCallback(() => {
    if (!onlineAccountSession) {
      throw new Error("No online account session is available.");
    }
    return fetchOnlineAccountSessions({ token: onlineAccountSession.token });
  }, [onlineAccountSession?.token]);

  const resolveAccountGameJoin = useCallback((game: OnlineGameSummary, seat: "w" | "b") => {
    return resolveStoredOnlineJoinParams(game.gameId, seat);
  }, []);

  const handleReturnToAccountGame = useCallback((join: OnlineJoinParams, visibility: OnlineGameVisibility) => {
    enterOnlineGameFromJoin(join, undefined, visibility);
  }, [enterOnlineGameFromJoin]);

  const handleRejoinAccountGame = useCallback(async (game: OnlineGameSummary) => {
    if (!onlineAccountSession) {
      alert("Sign in to rejoin this account game.");
      return;
    }
    setRejoiningAccountGameId(game.gameId);
    try {
      const response = await rejoinOnlineAccountGame(
        { token: onlineAccountSession.token },
        game.gameId
      );
      enterOnlineGameFromJoin(response.gameInvite, response.gameInvite.url, game.visibility);
    } catch (error) {
      console.error("Failed to rejoin account game", error);
      alert(
        error instanceof OnlineRequestError
          ? error.message
          : "Could not rejoin this account game. Try the original invite link if you still have it."
      );
    } finally {
      setRejoiningAccountGameId(null);
    }
  }, [enterOnlineGameFromJoin, onlineAccountSession?.token]);

  const handleRejoinAccountChallengeGame = useCallback(async (gameId: string, visibility: OnlineGameVisibility) => {
    if (!onlineAccountSession) {
      alert("Sign in to join this account challenge game.");
      return;
    }
    setRejoiningAccountGameId(gameId);
    try {
      const response = await rejoinOnlineAccountGame(
        { token: onlineAccountSession.token },
        gameId
      );
      enterOnlineGameFromJoin(response.gameInvite, response.gameInvite.url, visibility);
    } catch (error) {
      console.error("Failed to join accepted account challenge game", error);
      alert(
        error instanceof OnlineRequestError
          ? error.message
          : "Could not join this accepted challenge game. Try refreshing the challenge inbox."
      );
    } finally {
      setRejoiningAccountGameId(null);
    }
  }, [enterOnlineGameFromJoin, onlineAccountSession?.token]);

  const createChallengeFromSetup = async (
    setup: OnlineGameSetupDTO,
    options: { challengedDisplayName?: string } = {}
  ): Promise<CreatedChallengeFromSetup | null> => {
    try {
      cancelPendingReplay();
      clearAnalysisReturn();
      clearAutosave();
      clearOpenSeekState();
      const created = await createOnlineChallenge(
        setup,
        {
          challengerSeat: "w",
          visibility: "unlisted",
          account: onlineAccountAuth,
          ...(options.challengedDisplayName
            ? { challengedDisplayName: options.challengedDisplayName }
            : {}),
        }
      );
      const challenge = resolveOnlineChallengeParams(created.challenger.url);
      if (!challenge) {
        throw new Error("Challenge creator link was malformed.");
      }
      rememberOnlineChallengeParams(challenge);
      rememberOnlineChallengeShareUrl(challenge.challengeId, created.challenged.url);
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
      setOnlineChallengeShareMessage(
        options.challengedDisplayName
          ? `Challenge link ready for ${options.challengedDisplayName}.`
          : ""
      );
      setOnlineChallengeStatus("idle");
      setOnlineChallengeError(null);
      setView('challenge');
      return { challengedUrl: created.challenged.url };
    } catch (error) {
      console.error("Failed to create online challenge", error);
      const serverMessage = error instanceof OnlineRequestError ? error.message : null;
      alert(
        options.challengedDisplayName
          ? serverMessage ?? `Could not create a challenge for ${options.challengedDisplayName}. They may not accept challenges from this account.`
          : "Could not create an online challenge. Make sure the Node server is running."
      );
      if (options.challengedDisplayName && error instanceof OnlineRequestError) {
        throw error;
      }
      return null;
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
    pieceTheme?: PieceTheme,
    ratingMode?: OnlineRatingMode
  ) => {
    await createChallengeFromSetup(
      serializeOnlineGameSetup({
        board,
        pieces,
        sanctuaries: sanctuaries ?? [],
        timeControl,
        sanctuarySettings,
        gameRules,
        initialPoolTypes,
        pieceTheme,
        ratingMode,
      })
    );
  };

  const handleChallengeOnlineAccount = async (
    displayName: string,
    options: AccountChallengeOptions = {}
  ) => {
    if (!onlineAccountAuth) {
      alert("Sign in before challenging an account.");
      throw new Error("Online account sign-in is required before challenging an account.");
    }
    let setup = onlineLobbySetup;
    if (options.sourceGameId) {
      try {
        const snapshot = await fetchOnlineAccountGameSnapshot(onlineAccountAuth, options.sourceGameId);
        setup = snapshot.setup;
      } catch (error) {
        console.error("Failed to load source game setup for account rematch", error);
        alert("Could not load that game setup for a rematch.");
        throw error;
      }
    }
    if (!setup) {
      alert("Choose a Play setup before challenging an account.");
      throw new Error("A Play setup is required before challenging an account.");
    }
    const created = await createChallengeFromSetup(setup, { challengedDisplayName: displayName });
    if (!created) {
      throw new Error("Targeted online challenge was not created.");
    }
    if (options.intent === "rematch") {
      setOnlineChallengeShareMessage(`Rematch challenge created for ${displayName}.`);
    }
  };

  const handleCopyChallengeOnlineAccountInvite = async (displayName: string) => {
    if (!onlineAccountAuth) {
      alert("Sign in before challenging an account.");
      throw new Error("Online account sign-in is required before challenging an account.");
    }
    if (!onlineLobbySetup) {
      alert("Choose a Play setup before challenging an account.");
      throw new Error("A Play setup is required before challenging an account.");
    }
    const created = await createChallengeFromSetup(onlineLobbySetup, { challengedDisplayName: displayName });
    if (!created) {
      throw new Error("Targeted online challenge invite was not created.");
    }
    await copyOnlineInviteUrl(created.challengedUrl);
    setOnlineChallengeShareMessage(`Challenge invite copied for ${displayName}.`);
  };

  const handleCreateOnlineRematch = async () => {
    if (!onlineRematchTarget) return;
    const target = onlineRematchTarget;
    const created = await createChallengeFromSetup(target.setup, { challengedDisplayName: target.displayName });
    if (!created) {
      throw new Error("Rematch challenge was not created.");
    }
    setOnlineRematchTarget(null);
    setOnlineChallengeShareMessage(`Rematch challenge created for ${target.displayName}.`);
  };

  const createOpenSeekFromSetup = async (
    setup: OnlineGameSetupDTO,
    visibility: OpenSeekVisibility = "public",
    options: { rethrowTrustedError?: boolean; notifyOnError?: boolean } = {}
  ) => {
    try {
      cancelPendingReplay();
      clearAnalysisReturn();
      clearAutosave();
      clearOnlineUrl();
      forgetOnlineChallengeStorage(onlineChallenge);
      if (onlineJoin) {
        forgetOnlineJoinParams(onlineJoin);
        forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
      }
      if (onlineSnapshot) {
        forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
      }
      clearOpenSeekState();
      const created = await createOpenSeek(setup, { creatorSeat: "random", visibility, account: onlineAccountAuth });
      const creator = {
        seekId: created.seekId,
        token: created.creator.token,
      };
      rememberOpenSeekCreatorParams(creator);
      setOnlineJoin(null);
      setOnlineSpectator(null);
      setOnlineSnapshot(null);
      setOnlineOpponentInviteUrl(null);
      setOnlineChallenge(null);
      setOnlineChallengeResponse(null);
      setOnlineChallengeShareUrl(null);
      setOpenSeekCreator(creator);
      setOpenSeekResponse({
        role: "creator",
        summary: created.summary,
      });
      setOnlineBrowserTab("lobby");
      setViewStack(['game']);
      setView("online");
    } catch (error) {
      console.error("Failed to create open seek", error);
      const serverMessage = error instanceof OnlineRequestError ? error.message : null;
      if (options.notifyOnError !== false) {
        alert(serverMessage ?? "Could not create an open lobby seek. Make sure the Node server is running.");
      }
      if (options.rethrowTrustedError && error instanceof OnlineRequestError) {
        throw error;
      }
    }
  };

  const handleCreateOpenSeek = async (
    board: Board,
    pieces: Piece[],
    timeControl?: { initial: number, increment: number },
    sanctuaries?: Sanctuary[],
    _selectedSanctuaryTypes?: SanctuaryType[],
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    gameRules?: { vpModeEnabled: boolean },
    initialPoolTypes?: SanctuaryType[],
    pieceTheme?: PieceTheme,
    ratingMode?: OnlineRatingMode
  ) => {
    await createOpenSeekFromSetup(
      serializeOnlineGameSetup({
        board,
        pieces,
        sanctuaries: sanctuaries ?? [],
        timeControl,
        sanctuarySettings,
        gameRules,
        initialPoolTypes,
        pieceTheme,
        ratingMode,
      })
    );
  };

  const handleListCurrentSetupInLobby = async (visibility: OpenSeekVisibility = "public") => {
    if (!onlineLobbySetup) {
      alert("Choose a Play setup before listing a lobby game.");
      return;
    }
    await createOpenSeekFromSetup(onlineLobbySetup, visibility, {
      notifyOnError: false,
      rethrowTrustedError: true,
    });
  };

  const handleAcceptOpenSeek = async (seekId: string) => {
    cancelPendingReplay();
    clearAnalysisReturn();
    const response = await acceptOpenSeek(seekId, { account: onlineAccountAuth });
    enterOnlineGameFromInvite(response.gameInvite);
  };

  const handleQuickMatch = async () => {
    if (!quickMatchSetup) {
      throw new Error("No current game setup is available for quick match.");
    }
    cancelPendingReplay();
    clearAnalysisReturn();
    const response = await startQuickMatch(quickMatchSetup, { account: onlineAccountAuth });
    if (response.outcome === "matched") {
      window.setTimeout(() => {
        enterOnlineGameFromInvite(response.gameInvite);
      }, QUICK_MATCH_MATCHED_NAVIGATION_DELAY_MS);
      return "matched" as const;
    }

    clearAutosave();
    clearOnlineUrl();
    forgetOnlineChallengeStorage(onlineChallenge);
    if (onlineJoin) {
      forgetOnlineJoinParams(onlineJoin);
      forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
    }
    if (onlineSnapshot) {
      forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
    }
    clearOpenSeekState();
    const creator = {
      seekId: response.seekId,
      token: response.creator.token,
    };
    rememberOpenSeekCreatorParams(creator);
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOpenSeekCreator(creator);
    setOpenSeekResponse({
      role: "creator",
      summary: response.summary,
    });
    setOnlineBrowserTab("lobby");
    setViewStack(['game']);
    setView("online");
    return "waiting" as const;
  };

  const handleCancelOpenSeek = async (seekId: string) => {
    const storedCreator = openSeekCreator?.seekId === seekId ? openSeekCreator : null;
    if (!storedCreator) {
      throw new Error("No creator token is available for this open seek.");
    }
    const response = await cancelOpenSeek(storedCreator);
    forgetOpenSeekCreatorParams(storedCreator);
    setOpenSeekCreator(null);
    setOpenSeekResponse(response.summary.status === "accepted" ? response : null);
  };

  const handleCopyOnlineChallengeShareUrl = useCallback(async () => {
    if (!onlineChallengeShareUrl) return;
    try {
      await copyOnlineInviteUrl(onlineChallengeShareUrl);
      setOnlineChallengeShareMessage("Challenge link copied.");
    } catch (error) {
      console.error("Failed to copy challenge link", error);
      setOnlineChallengeShareMessage("Could not copy the challenge link.");
    }
  }, [onlineChallengeShareUrl]);

  const handleRefreshOwnedOpenSeek = async () => {
    if (!openSeekCreator) return;
    const response = await fetchOpenSeek(openSeekCreator);
    if (response.summary.status === "cancelled" || response.summary.status === "expired") {
      forgetOpenSeekCreatorParams(openSeekCreator);
      setOpenSeekCreator(null);
      setOpenSeekResponse(null);
      return;
    }
    setOpenSeekResponse(response);
  };

  const handleJoinOwnedOpenSeek = () => {
    if (!openSeekResponse?.gameInvite) return;
    enterOnlineGameFromInvite(openSeekResponse.gameInvite);
  };

  const handleAcceptOnlineChallenge = async () => {
    if (!onlineChallenge) return;
    cancelPendingReplay();
    clearAnalysisReturn();
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
      forgetOnlineChallengeStorage(onlineChallenge);
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
      forgetOnlineChallengeStorage(onlineChallenge);
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
    clearAnalysisReturn();
    clearAutosave();
    setViewStack([]);
    setGameKey(prev => prev + 1);
  };

  const handleLoadGame = (data: LoadGameData, options: LoadGameOptions = {}) => {
    cancelPendingReplay();
    const nextAnalysisConfig = createGameConfigFromLoadData(data, true);
    const localReturnConfig = {
      ...createGameConfigFromLoadData(data, false),
      opponentConfig: gameConfig.opponentConfig,
    };
    if (options.source === "analysis" && onlineSnapshot && (onlineJoin || onlineSpectator)) {
      setAnalysisReturn({
        kind: "online-game",
        label: onlineJoin ? "Back to Online Game" : "Back to Live Game",
        onlineJoin,
        onlineSpectator: onlineJoin ? null : onlineSpectator,
        onlineSnapshot,
        opponentInviteUrl: onlineOpponentInviteUrl,
      });
    } else if (options.source === "analysis" && !gameConfig.isAnalysisMode) {
      setAnalysisReturn({
        kind: "local-game",
        label: "Return to Game",
        config: localReturnConfig,
      });
    } else {
      clearAnalysisReturn();
    }

    // PGN imports and analysis handoffs should start in analysis mode so users can navigate the game.
    clearOnlineUrl();
    forgetOnlineChallengeStorage(onlineChallenge);
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
    setGameConfig(nextAnalysisConfig);
    setGameKey(prev => prev + 1); // Force remount
    enterGameView();
  };

  const handleReturnFromAnalysis = useCallback(() => {
    if (!analysisReturn) return;
    cancelPendingReplay();

    if (analysisReturn.kind === "local-game") {
      clearOnlineUrl();
      setOnlineJoin(null);
      setOnlineSpectator(null);
      setOnlineSnapshot(null);
      setOnlineOpponentInviteUrl(null);
      setGameConfig(analysisReturn.config);
      clearAnalysisReturn();
      setGameKey(prev => prev + 1);
      enterGameView();
      return;
    }

    if (analysisReturn.kind === "online-game") {
      if (analysisReturn.onlineJoin) {
        rememberOnlineJoinParams(analysisReturn.onlineJoin);
        if (analysisReturn.opponentInviteUrl) {
          rememberOnlineOpponentInviteUrl(
            analysisReturn.onlineJoin.gameId,
            analysisReturn.opponentInviteUrl
          );
        }
        const url = new URL(window.location.href);
        url.searchParams.set("onlineGame", analysisReturn.onlineJoin.gameId);
        url.searchParams.set("seat", analysisReturn.onlineJoin.seat);
        url.searchParams.delete("view");
        url.searchParams.delete("token");
        url.searchParams.delete("onlineChallenge");
        url.searchParams.delete("challengeRole");
        url.searchParams.delete("challengeToken");
        url.searchParams.delete("pgn");
        url.searchParams.delete("game");
        url.hash = "";
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      } else if (analysisReturn.onlineSpectator) {
        const url = new URL(buildSpectatorUrl(window.location.href, analysisReturn.onlineSpectator.gameId));
        window.history.replaceState({}, "", `${window.location.pathname}?${url.searchParams.toString()}`);
      }

      setOnlineJoin(analysisReturn.onlineJoin);
      setOnlineSpectator(analysisReturn.onlineSpectator);
      setOnlineSnapshot(analysisReturn.onlineSnapshot);
      setOnlineOpponentInviteUrl(analysisReturn.opponentInviteUrl);
      setGameConfig(createGameConfigFromOnlineSnapshot(analysisReturn.onlineSnapshot, false));
      clearAnalysisReturn();
      setGameKey(prev => prev + 1);
      enterGameView();
      return;
    }

    setOnlineBrowserTab(analysisReturn.tab);
    clearAnalysisReturn();
    setViewStack(['game']);
    setView('online');
  }, [analysisReturn]);

  const handleLoadSavedGame = (record: SavedGameRecord) => {
    const result = loadPGNText(record.pgn);
    if (!result || (result.diagnostics && result.diagnostics.length > 0)) {
      alert("Saved game could not be loaded. The PGN may be damaged.");
      return;
    }

    handleLoadGame({
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
  };

  const handleSaveGameToLibrary = (pgn: string, status: SavedGameStatus): Promise<SaveGameToLibraryResult> => {
    if (activeSaveDialogRequestRef.current) {
      setSaveGameDialog(current => current ? {
        ...current,
        error: "Finish or cancel the current save before starting another.",
      } : current);
      return Promise.resolve(false);
    }

    const defaultName = createDefaultSavedGameName(pgn);
    return new Promise(resolve => {
      saveDialogReturnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const request = {
        pgn,
        status,
        name: defaultName,
        isSaving: false,
        error: null,
        resolve,
      };
      activeSaveDialogRequestRef.current = request;
      setSaveGameDialog(request);
    });
  };

  const finishSaveDialog = (result: SaveGameToLibraryResult) => {
    const request = activeSaveDialogRequestRef.current;
    activeSaveDialogRequestRef.current = null;
    request?.resolve(result);
    setSaveGameDialog(null);
    window.setTimeout(() => {
      saveDialogReturnFocusRef.current?.focus();
      saveDialogReturnFocusRef.current = null;
    }, 0);
  };

  const handleSaveDialogNameChange = (name: string) => {
    setSaveGameDialog(current => current ? { ...current, name, error: null } : current);
  };

  const handleCancelSaveDialog = () => {
    if (!saveGameDialog) return;
    finishSaveDialog(false);
  };

  const handleSubmitSaveDialog = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!saveGameDialog) return;

    const name = saveGameDialog.name.trim();
    if (!name) {
      setSaveGameDialog(current => current ? { ...current, error: "Enter a name for this save." } : current);
      return;
    }

    try {
      setSaveGameDialog(current => current ? { ...current, isSaving: true, error: null } : current);
      await gameLibraryRepository.saveGame(createSavedGameRecord({
        pgn: saveGameDialog.pgn,
        name,
        status: saveGameDialog.status
      }));
      finishSaveDialog({
        saved: true,
        message: `Saved "${name}" to Library.`,
      });
    } catch (error) {
      console.error("Failed to save game to library", error);
      setSaveGameDialog(current => current ? {
        ...current,
        isSaving: false,
        error: "Could not save game. Try again.",
      } : current);
    }
  };

  const handleSaveDialogKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (!saveGameDialog) return;

    if (event.key === "Escape" && !saveGameDialog.isSaving) {
      event.preventDefault();
      finishSaveDialog(false);
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      saveDialogRef.current?.querySelectorAll<HTMLElement>(
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

  const handleOnlineSnapshot = useCallback((snapshot: OnlineGameSnapshotDTO) => {
    setOnlineSnapshot(snapshot);
    setGameConfig(createGameConfigFromOnlineSnapshot(snapshot, false));
    setGameKey(prev => prev + 1);
    setViewStack([]);
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
      const visibility = onlineVisibilityByGameId[onlineJoin.gameId] ?? "unlisted";
      const isPrivate = visibility === "private";
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
        visibility,
        opponentInviteUrl: onlineJoin.seat === "w" ? onlineOpponentInviteUrl ?? undefined : undefined,
        spectatorUrl: isPrivate ? undefined : buildSpectatorUrl(window.location.href, onlineJoin.gameId),
        submitAction: onlineConnection.submitAction,
        updateVisibility: isPrivate ? undefined : handleUpdateOnlineVisibility,
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
  const onlineChallengeStatusLine = useMemo(() => {
    if (onlineChallengeStatus === "loading") return "Loading challenge...";
    if (onlineChallengeStatus === "acting") return "Updating challenge...";
    if (onlineChallengeError) return onlineChallengeError;

    const summaryStatus = onlineChallengeResponse?.summary.status ?? "pending";
    if (summaryStatus === "pending" && onlineChallengeResponse?.role === "challenger") {
      return "Status: pending; checking every second for acceptance.";
    }
    if (summaryStatus === "pending" && onlineChallengeResponse?.role === "challenged") {
      return "Status: pending; waiting for your response and checking for updates.";
    }
    return `Status: ${summaryStatus}`;
  }, [
    onlineChallengeError,
    onlineChallengeResponse?.role,
    onlineChallengeResponse?.summary.status,
    onlineChallengeStatus,
  ]);
  const canRecoverPendingOnlineConnection =
    pendingOnlineConnection.status === "access-denied" ||
    pendingOnlineConnection.status === "protocol-error" ||
    pendingOnlineConnection.status === "server-error" ||
    pendingOnlineConnection.status === "terminal";

  const clearTransientOnlineState = useCallback(() => {
    cancelPendingReplay();
    clearAnalysisReturn();
    clearAutosave();
    clearOnlineUrl();
    forgetOnlineChallengeStorage(onlineChallenge);
    if (onlineJoin) {
      forgetOnlineJoinParams(onlineJoin);
      forgetOnlineOpponentInviteUrl(onlineJoin.gameId);
    }
    if (onlineSnapshot) {
      forgetOnlineOpponentInviteUrl(onlineSnapshot.gameId);
    }
    if (openSeekCreator) {
      forgetOpenSeekCreatorParams(openSeekCreator);
    }
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setOpenSeekCreator(null);
    setOpenSeekResponse(null);
  }, [
    cancelPendingReplay,
    forgetOnlineChallengeStorage,
    onlineChallenge,
    onlineJoin,
    onlineSnapshot,
    openSeekCreator,
  ]);

  const handleOnlineStateBackToPlay = useCallback(() => {
    clearTransientOnlineState();
    setViewStack(['game']);
    setView('setup');
  }, [clearTransientOnlineState]);

  const handleOnlineStateTutorial = useCallback(() => {
    clearTransientOnlineState();
    setViewStack(['setup']);
    setView('tutorial');
  }, [clearTransientOnlineState]);

  const handleOnlineStateLibrary = useCallback(() => {
    clearTransientOnlineState();
    setViewStack(['setup']);
    setView('library');
  }, [clearTransientOnlineState]);

  const handleOnlineStateOnline = useCallback(() => {
    clearTransientOnlineState();
    setViewStack(['setup']);
    setOnlineBrowserTab("lobby");
    setView('online');
  }, [clearTransientOnlineState]);

  const onlineStateDestinations = useMemo<AppShellDestination[]>(() => [
    { id: "play", label: "Play" },
    { id: "learn", label: "Tutorial", onClick: handleOnlineStateTutorial },
    { id: "online", label: "Online", onClick: handleOnlineStateOnline },
    { id: "library", label: "Library", onClick: handleOnlineStateLibrary },
  ], [handleOnlineStateTutorial, handleOnlineStateLibrary, handleOnlineStateOnline]);

  // Editor handlers
  const handleEditPosition = (board?: Board, pieces?: Piece[], sanctuaries?: Sanctuary[]) => {
    cancelPendingReplay();
    clearAutosave();
    setViewStack(prev => [...prev, view]);
    setEditorConfig({ board, pieces, sanctuaries });
    setView('editor');
  };

  const handleEditorBack = () => {
    returnToPreviousView();
  };

  const handlePlayFromEditor = (board: Board, pieces: Piece[], sanctuaries: Sanctuary[]) => {
    cancelPendingReplay();
    clearAnalysisReturn();
    clearAutosave();
    const layout = getStartingLayout(board);
    clearOnlineUrl();
    forgetOnlineChallengeStorage(onlineChallenge);
    clearOpenSeekState();
    setOnlineJoin(null);
    setOnlineSpectator(null);
    setOnlineChallenge(null);
    setOnlineChallengeResponse(null);
    setOnlineChallengeShareUrl(null);
    setOnlineSnapshot(null);
    setOnlineOpponentInviteUrl(null);
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl: undefined, isAnalysisMode: false });
    setGameKey(prev => prev + 1);
    enterGameView();
  };

  return (
    <ThemeProvider>
    <div className="App" ref={appRootRef} tabIndex={-1}>
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
          onCreateOnlineChallenge={handleCreateOnlineChallenge}
          onCreateOpenSeek={handleCreateOpenSeek}
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
            <div
              className="online-state-status"
              role="status"
              aria-label="Challenge status"
              aria-live="polite"
            >
              {onlineChallengeStatusLine}
            </div>
            {onlineChallengeShareUrl && (
              <section className="online-state-field" aria-label="Challenge link">
                <div className="online-state-field-heading">Challenge link</div>
                <div className="online-state-share-row">
                  <code className="online-state-link-preview" title={onlineChallengeShareUrl}>
                    {onlineChallengeShareUrl}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyOnlineChallengeShareUrl}
                    className="online-state-button neutral online-state-copy-button"
                  >
                    Copy Challenge Link
                  </button>
                </div>
                <div
                  className="online-state-inline-status"
                  role="status"
                  aria-label="Challenge link status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {onlineChallengeShareMessage}
                </div>
              </section>
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
              initialCastles={gameConfig.castles}
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
              onRematch={onlineRematchTarget ? handleCreateOnlineRematch : undefined}
              rematchLabel={onlineRematchTarget ? `Rematch ${onlineRematchTarget.displayName}` : undefined}
              onLoadGame={handleLoadGame}
              onEditPosition={handleEditPosition}
              onTutorial={handleTutorialClick}
              onOpenLibrary={handleOpenLibrary}
              onOpenOnlineBrowser={handleOpenOnlineBrowser}
              onReturnFromAnalysis={analysisReturn ? handleReturnFromAnalysis : undefined}
              analysisReturnLabel={analysisReturn?.label}
              onSaveGameToLibrary={handleSaveGameToLibrary}
              pieceTheme={gameConfig.pieceTheme}
              opponentConfig={gameConfig.opponentConfig}
              onlineSession={onlineSession}
              onlineAccountDisplayName={onlineAccount?.displayName}
              onOpenOnlineAccount={() => setOnlineAccountDialogOpen(true)}
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

      {view === 'online' && (
        <OnlineGameBrowser
          onBack={returnToPreviousView}
          onOpenGame={handleOpenGame}
          onConfigureSetup={handleNewGameClick}
          backLabel={currentBackLabel}
          initialTab={onlineBrowserTab}
          activeTab={onlineBrowserTab}
          onTabChange={setOnlineBrowserTab}
          onTutorial={handleTutorialClick}
          onOpenLibrary={handleOpenLibrary}
          onCreateSeek={onlineLobbySetup ? handleListCurrentSetupInLobby : undefined}
          onQuickMatch={onlineLobbySetup ? handleQuickMatch : undefined}
          quickMatchSetupSummary={quickMatchSetupSummary}
          loadOpenSeeks={handleLoadOpenSeekDirectory}
          onAcceptSeek={handleAcceptOpenSeek}
          onCancelSeek={handleCancelOpenSeek}
          ownedSeekIds={openSeekCreator ? [openSeekCreator.seekId] : []}
          ownedSeekResponse={openSeekResponse}
          onRefreshOwnedSeek={handleRefreshOwnedOpenSeek}
          onJoinOwnedSeek={openSeekResponse?.gameInvite ? handleJoinOwnedOpenSeek : undefined}
          onSpectate={handleSpectateOnlineGame}
          onReplay={handleReplayOnlineGame}
          resolveAccountGameJoin={resolveAccountGameJoin}
          onReturnToAccountGame={handleReturnToAccountGame}
          onRejoinAccountGame={handleRejoinAccountGame}
          onRejoinAccountChallengeGame={handleRejoinAccountChallengeGame}
          rejoiningAccountGameId={rejoiningAccountGameId}
          recentOnlineGames={recentOnlineGames}
          onClearRecentOnlineGames={handleClearRecentOnlineGames}
          account={onlineAccount}
          accountStatus={onlineAccountStatus}
          accountError={onlineAccountError}
          onCreateAccount={handleCreateOnlineAccount}
          onSignInAccount={handleSignInOnlineAccount}
          loadAccountOAuthProviders={fetchOnlineAccountOAuthProviders}
          onSignOutAccount={handleSignOutOnlineAccount}
          accountSessionId={onlineAccountSession?.sessionId ?? null}
          loadAccountSessions={onlineAccountSession ? handleLoadOnlineAccountSessions : undefined}
          onSignOutAllAccountSessions={onlineAccountSession ? handleSignOutAllOnlineAccountSessions : undefined}
          onDeleteAccount={onlineAccountSession ? handleDeleteOnlineAccount : undefined}
          loadAccountGames={onlineAccountSession ? handleLoadOnlineAccountGames : undefined}
          loadAccountHeadToHeadGames={onlineAccountSession ? handleLoadOnlineAccountHeadToHeadGames : undefined}
          loadAccountChallenges={onlineAccountSession ? handleLoadOnlineAccountChallenges : undefined}
          onAcceptAccountChallenge={onlineAccountSession ? handleAcceptOnlineAccountChallenge : undefined}
          onDeclineAccountChallenge={onlineAccountSession ? handleDeclineOnlineAccountChallenge : undefined}
          onCancelAccountChallenge={onlineAccountSession ? handleCancelOnlineAccountChallenge : undefined}
          loadAccountProfile={onlineAccountSession ? handleLoadOnlineAccountProfile : undefined}
          loadAccountFollowing={onlineAccountSession ? handleLoadOnlineAccountFollowing : undefined}
          loadRatingLeaderboard={onlineAccountSession ? handleLoadOnlineRatingLeaderboard : undefined}
          onFollowAccount={onlineAccountSession ? handleFollowOnlineAccount : undefined}
          onUnfollowAccount={onlineAccountSession ? handleUnfollowOnlineAccount : undefined}
          onBlockAccount={onlineAccountSession ? handleBlockOnlineAccount : undefined}
          onUnblockAccount={onlineAccountSession ? handleUnblockOnlineAccount : undefined}
          onReportAccount={onlineAccountSession ? handleReportOnlineAccount : undefined}
          onChallengeAccount={onlineAccountSession ? handleChallengeOnlineAccount : undefined}
          onCopyChallengeAccountInvite={onlineAccountSession ? handleCopyChallengeOnlineAccountInvite : undefined}
          loadAccountPrivacy={onlineAccountSession ? handleLoadOnlineAccountPrivacy : undefined}
          onUpdateAccountPrivacy={onlineAccountSession ? handleUpdateOnlineAccountPrivacy : undefined}
        />
      )}

      <OnlineAccountDialog
        isOpen={isOnlineAccountDialogOpen}
        onClose={() => setOnlineAccountDialogOpen(false)}
        account={onlineAccount}
        accountStatus={onlineAccountStatus}
        accountError={onlineAccountError}
        onCreateAccount={handleCreateOnlineAccount}
        onSignInAccount={handleSignInOnlineAccount}
        loadAccountOAuthProviders={fetchOnlineAccountOAuthProviders}
        onSignOutAccount={handleSignOutOnlineAccount}
      />

      {isFirstRunIntroVisible && (
        <div className="confirm-dialog-backdrop app-modal-backdrop first-run-intro-backdrop">
          <section
            className="confirm-dialog first-run-intro-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="first-run-intro-title"
            aria-describedby="first-run-intro-description"
            onKeyDown={handleFirstRunIntroKeyDown}
            ref={firstRunIntroDialogRef}
          >
            <div className="first-run-intro-kicker">New to Castles?</div>
            <h2 id="first-run-intro-title">Welcome to Castles</h2>
            <p id="first-run-intro-description">
              Castles is a hex strategy game about controlling castles, using special units, and choosing the right phase actions.
              The fastest way to learn the rules is the guided tutorial.
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="confirm-dialog-button primary"
                onClick={handleFirstRunIntroTutorial}
                ref={firstRunIntroPrimaryButtonRef}
              >
                Start Tutorial
              </button>
              <button
                type="button"
                className="confirm-dialog-button neutral"
                onClick={handleFirstRunIntroPlay}
              >
                Set Up Game
              </button>
            </div>
          </section>
        </div>
      )}

      {saveGameDialog && (
        <div className="confirm-dialog-backdrop app-modal-backdrop save-dialog-backdrop">
          <form
            className="confirm-dialog save-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-game-dialog-title"
            aria-describedby="save-game-dialog-description"
            onSubmit={handleSubmitSaveDialog}
            onKeyDown={handleSaveDialogKeyDown}
            ref={saveDialogRef}
          >
            <h2 id="save-game-dialog-title">Save game</h2>
            <p id="save-game-dialog-description">
              Name this game so you can find it later in Library.
            </p>
            <label className="save-dialog-field">
              Save name
              <input
                value={saveGameDialog.name}
                onChange={(event) => handleSaveDialogNameChange(event.currentTarget.value)}
                disabled={saveGameDialog.isSaving}
                ref={saveNameInputRef}
                autoFocus
              />
            </label>
            {saveGameDialog.error && (
              <div className="save-dialog-error" role="alert">
                {saveGameDialog.error}
              </div>
            )}
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="confirm-dialog-button neutral"
                onClick={handleCancelSaveDialog}
                disabled={saveGameDialog.isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="confirm-dialog-button primary"
                disabled={saveGameDialog.isSaving}
              >
                {saveGameDialog.isSaving ? "Saving..." : "Save to Library"}
              </button>
            </div>
          </form>
        </div>
      )}

      <InstallAppHint />
        </>
      )}
    </div>
    </ThemeProvider>
  );
}

export default App;

