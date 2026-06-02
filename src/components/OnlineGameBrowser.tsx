import React from "react";
import AppShellNav, { AppShellDestination } from "./AppShellNav";
import {
  buildSpectatorUrl,
  copyOnlineInviteUrl,
  fetchOpenSeekDirectory,
  fetchOnlineGameDirectory,
  formatOnlineGameResult,
  type FetchOpenSeekDirectoryOptions,
  type FetchOnlineGameSummariesOptions,
  type OpenSeekResponse,
} from "../online/client";
import type {
  OnlineGameDirectoryResponse,
  OnlineGameSummaryBoardPreviewHex,
  OnlineGameSummary,
  OnlineGameSummaryParticipant,
} from "../online/readModel";
import type {
  OpenSeekDirectoryResponse,
  OpenSeekSummary,
} from "../online/seeks";
import type { RecentOnlineGameRecord } from "../online/recentGames";
import { PieceType } from "../Constants";
import "../css/OnlineGameBrowser.css";

type OnlineBrowserTab = "lobby" | "watch" | "archive";
type OnlineBrowserSort = "newest" | "moves";
type OnlineBrowserTimeFilter = "all" | "timed" | "casual";
type OpenSeekSideFilter = "all" | OpenSeekSummary["creatorSeat"];
type OpenSeekClockFilter = "all" | "timed" | "casual";
type OpenSeekVpFilter = "all" | "enabled" | "disabled";
type OnlineBrowserResultFilter =
  | "all"
  | "white"
  | "black"
  | "resignation"
  | "timeout"
  | "castle_control"
  | "victory_points"
  | "monarch_captured";
type QuickMatchStatus = "idle" | "pending" | "matched" | "waiting" | "error";
type QuickMatchOutcome = "matched" | "waiting" | void;

interface QuickMatchSetupSummary {
  boardRadius: number;
  clock: string;
  scoring: string;
}

const LOBBY_AUTO_REFRESH_MS = 30_000;
const LOBBY_RATE_LIMIT_BACKOFF_MS = 60_000;
const AUTO_REFRESH_PAUSED_MESSAGE = "Auto refresh paused after a rate limit. Use Refresh to check now.";

interface OnlineGameBrowserProps {
  loadGames?: (options?: FetchOnlineGameSummariesOptions) => Promise<OnlineGameDirectoryResponse>;
  loadOpenSeeks?: (options?: FetchOpenSeekDirectoryOptions) => Promise<OpenSeekDirectoryResponse>;
  onBack: () => void;
  onOpenGame?: () => void;
  onConfigureSetup?: () => void;
  onTutorial?: () => void;
  onOpenLibrary?: () => void;
  onCreateSeek?: () => void | Promise<void>;
  onQuickMatch?: () => QuickMatchOutcome | Promise<QuickMatchOutcome>;
  quickMatchSetupSummary?: QuickMatchSetupSummary;
  onAcceptSeek?: (seekId: string) => void | Promise<void>;
  onCancelSeek?: (seekId: string) => void | Promise<void>;
  ownedSeekResponse?: OpenSeekResponse | null;
  onRefreshOwnedSeek?: () => void | Promise<void>;
  onJoinOwnedSeek?: () => void;
  ownedSeekIds?: string[];
  onReplay: (gameId: string) => void;
  onSpectate: (gameId: string) => void;
  recentOnlineGames?: RecentOnlineGameRecord[];
  onClearRecentOnlineGames?: () => void;
  backLabel?: string;
  initialTab?: OnlineBrowserTab;
  activeTab?: OnlineBrowserTab;
  onTabChange?: (tab: OnlineBrowserTab) => void;
}

function participantName(
  participants: OnlineGameSummaryParticipant[],
  seat: "w" | "b"
): string {
  const participant = participants.find((candidate) => candidate.seat === seat);
  if (!participant) return seat === "w" ? "White" : "Black";
  if (participant.identity.kind === "registered" && participant.identity.displayName) {
    return participant.identity.displayName;
  }
  return seat === "w" ? "White" : "Black";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRecentOnlineGameTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRecentOnlineGameRole(record: RecentOnlineGameRecord): string {
  if (record.role === "spectator") return "Spectated";
  if (record.seat === "w") return "Played White";
  if (record.seat === "b") return "Played Black";
  return "Played";
}

function formatRecentOnlineGameScope(): string {
  return "Device-only replay";
}

function searchText(summary: OnlineGameSummary): string {
  const white = participantName(summary.participants, "w");
  const black = participantName(summary.participants, "b");
  const sideToMove = formatSideToMove(summary.livePreview.sideToMove);
  return [
    summary.gameId,
    white,
    black,
    summary.status,
    summary.archiveState,
    summary.result ? formatOnlineGameResult(summary.result) : "",
    sideToMove,
    summary.livePreview.turnPhase,
    summary.livePreview.lastMove?.notation ?? "",
  ].join(" ").toLowerCase();
}

function compareNewest(left: OnlineGameSummary, right: OnlineGameSummary): number {
  if (left.updatedAt !== right.updatedAt) return right.updatedAt.localeCompare(left.updatedAt);
  return left.gameId.localeCompare(right.gameId);
}

function compareMostMoves(left: OnlineGameSummary, right: OnlineGameSummary): number {
  if (left.livePreview.moveCount !== right.livePreview.moveCount) {
    return right.livePreview.moveCount - left.livePreview.moveCount;
  }
  return compareNewest(left, right);
}

function formatSideToMove(color: "w" | "b"): string {
  return color === "w" ? "White" : "Black";
}

function formatMoveCount(count: number): string {
  return `${count} ${count === 1 ? "move" : "moves"}`;
}

function formatPublicLiveCount(count: number): string {
  return `${count} public live ${count === 1 ? "game" : "games"}`;
}

function formatClockTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatClockSnapshot(summary: OnlineGameSummary): string {
  const clock = summary.livePreview.clock;
  if (!clock) return "Casual";
  return `Clock snapshot W ${formatClockTime(clock.remainingMs.w)} B ${formatClockTime(clock.remainingMs.b)}`;
}

const PIECE_PREVIEW_LABELS: Record<PieceType, string> = {
  [PieceType.Swordsman]: "S",
  [PieceType.Archer]: "A",
  [PieceType.Knight]: "N",
  [PieceType.Trebuchet]: "T",
  [PieceType.Eagle]: "E",
  [PieceType.Giant]: "G",
  [PieceType.Assassin]: "X",
  [PieceType.Dragon]: "D",
  [PieceType.Monarch]: "M",
  [PieceType.Wolf]: "W",
  [PieceType.Healer]: "H",
  [PieceType.Ranger]: "R",
  [PieceType.Wizard]: "Z",
  [PieceType.Necromancer]: "C",
  [PieceType.Phoenix]: "P",
};
const BOARD_PREVIEW_CELL_CACHE = new Map<number, OnlineGameSummaryBoardPreviewHex[]>();

function boardPreviewPoint(
  hex: OnlineGameSummaryBoardPreviewHex,
  radius: number
): { x: number; y: number } {
  const scale = 42 / Math.max(1, radius);
  return {
    x: 50 + (hex.q + hex.r / 2) * scale,
    y: 50 + hex.r * scale * 0.86,
  };
}

function boardPreviewCells(radius: number): OnlineGameSummaryBoardPreviewHex[] {
  const cached = BOARD_PREVIEW_CELL_CACHE.get(radius);
  if (cached) return cached;

  const cells: OnlineGameSummaryBoardPreviewHex[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r += 1) {
      cells.push({ q, r, s: -q - r });
    }
  }
  BOARD_PREVIEW_CELL_CACHE.set(radius, cells);
  return cells;
}

function boardPreviewImageLabel(game: OnlineGameSummary): string {
  const preview = game.livePreview.boardPreview;
  const whitePieces = preview.pieces.filter((piece) => piece.color === "w").length;
  const blackPieces = preview.pieces.length - whitePieces;
  const whiteCastles = preview.castles.filter((castle) => castle.owner === "w").length;
  const blackCastles = preview.castles.length - whiteCastles;
  return [
    "Board preview:",
    `${whitePieces} White pieces`,
    `${blackPieces} Black pieces`,
    `${whiteCastles} White-controlled castles`,
    `${blackCastles} Black-controlled castles`,
  ].join(" ");
}

function matchesResultFilter(summary: OnlineGameSummary, resultFilter: OnlineBrowserResultFilter): boolean {
  if (resultFilter === "all") return true;
  if (!summary.result) return false;
  if (resultFilter === "white") return summary.result.winner === "w";
  if (resultFilter === "black") return summary.result.winner === "b";
  return summary.result.reason === resultFilter;
}

function seekSearchText(summary: OpenSeekSummary): string {
  const sideLabel = formatSeekSideLabel(summary.creatorSeat);
  const sideDetail = formatSeekSideDetail(summary, false);
  const clock = formatSeekClock(summary);
  const scoring = formatSeekScoringLabel(summary);
  return [
    summary.seekId,
    summary.creatorSeat,
    sideLabel,
    sideDetail,
    summary.status,
    summary.setup.board.config.nSquares,
    clock,
    summary.setup.timeControl ? `${summary.setup.timeControl.initial}+${summary.setup.timeControl.increment}` : "casual",
    scoring,
  ].join(" ").toLowerCase();
}

function formatSeekClock(summary: OpenSeekSummary): string {
  const clock = summary.setup.timeControl;
  return clock ? `Timed ${clock.initial}+${clock.increment}` : "Casual";
}

function formatSeekScoringLabel(summary: OpenSeekSummary): string {
  return summary.setup.gameRules?.vpModeEnabled ? "Victory points" : "Castle control";
}

function formatSeekExpiresAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSeekStatus(status: OpenSeekSummary["status"]): string {
  switch (status) {
    case "open":
      return "Open";
    case "accepted":
      return "Accepted";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function formatSeekSideLabel(side: OpenSeekSummary["creatorSeat"]): string {
  switch (side) {
    case "w":
      return "White";
    case "b":
      return "Black";
    case "random":
      return "Random";
    default:
      return side;
  }
}

function formatSeekSideDetail(summary: OpenSeekSummary, owned: boolean): string {
  if (summary.creatorSeat === "random") return "Creator side Random";
  const creatorSide = formatSeekSideLabel(summary.creatorSeat);
  if (owned) return `You play ${creatorSide}`;
  return summary.creatorSeat === "w"
    ? "Creator plays White; you play Black"
    : "Creator plays Black; you play White";
}

function formatOwnedSeekSideDetail(response: OpenSeekResponse): string {
  if (response.summary.creatorSeat !== "random") {
    return formatSeekSideDetail(response.summary, true);
  }
  if (!response.gameInvite) return "Creator side Random";
  return `You play ${formatSeekSideLabel(response.gameInvite.seat)}`;
}

function compareOpenSeekNewest(left: OpenSeekSummary, right: OpenSeekSummary): number {
  if (left.updatedAt !== right.updatedAt) return right.updatedAt.localeCompare(left.updatedAt);
  return left.seekId.localeCompare(right.seekId);
}

function formatLastChecked(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /429|rate.?limit(?:ed)?/i.test(error.message);
}

const OnlineGameBrowser: React.FC<OnlineGameBrowserProps> = ({
  loadGames = fetchOnlineGameDirectory,
  loadOpenSeeks = fetchOpenSeekDirectory,
  onBack,
  onOpenGame,
  onConfigureSetup,
  onTutorial,
  onOpenLibrary,
  onCreateSeek,
  onQuickMatch,
  quickMatchSetupSummary,
  onAcceptSeek,
  onCancelSeek,
  ownedSeekResponse,
  onRefreshOwnedSeek,
  onJoinOwnedSeek,
  ownedSeekIds = [],
  onReplay,
  onSpectate,
  recentOnlineGames = [],
  onClearRecentOnlineGames,
  backLabel = "Back to game",
  initialTab = "lobby",
  activeTab,
  onTabChange,
}) => {
  const [uncontrolledTab, setUncontrolledTab] = React.useState<OnlineBrowserTab>(initialTab);
  const tab = activeTab ?? uncontrolledTab;
  const [games, setGames] = React.useState<OnlineGameSummary[]>([]);
  const [openSeeks, setOpenSeeks] = React.useState<OpenSeekSummary[]>([]);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<OnlineBrowserSort>("newest");
  const [timeFilter, setTimeFilter] = React.useState<OnlineBrowserTimeFilter>("all");
  const [seekSideFilter, setSeekSideFilter] = React.useState<OpenSeekSideFilter>("all");
  const [seekClockFilter, setSeekClockFilter] = React.useState<OpenSeekClockFilter>("all");
  const [seekVpFilter, setSeekVpFilter] = React.useState<OpenSeekVpFilter>("all");
  const [resultFilter, setResultFilter] = React.useState<OnlineBrowserResultFilter>("all");
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>();
  const [copyMessage, setCopyMessage] = React.useState("");
  const [seekStatus, setSeekStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [seekActionById, setSeekActionById] = React.useState<Record<string, "accept" | "cancel" | undefined>>({});
  const [seekActionMessage, setSeekActionMessage] = React.useState("");
  const [quickMatchStatus, setQuickMatchStatus] = React.useState<QuickMatchStatus>("idle");
  const [createSeekPending, setCreateSeekPending] = React.useState(false);
  const [ownedSeekAction, setOwnedSeekAction] = React.useState<"refresh" | "join" | undefined>();
  const [lastSeekCheckedAt, setLastSeekCheckedAt] = React.useState("");
  const [isSeekLoadInFlight, setIsSeekLoadInFlight] = React.useState(false);
  const requestIdRef = React.useRef(0);
  const seekRequestIdRef = React.useRef(0);
  const gameLoadInFlightRef = React.useRef(false);
  const seekLoadInFlightRef = React.useRef(false);
  const ownedSeekRefreshInFlightRef = React.useRef(false);
  const seekAutoRefreshPausedUntilRef = React.useRef(0);
  const seekActionByIdRef = React.useRef(seekActionById);
  const queuedSeekLoadRef = React.useRef<"foreground" | "background" | undefined>();
  const quickMatchButtonRef = React.useRef<HTMLButtonElement>(null);
  const archiveTabButtonRef = React.useRef<HTMLButtonElement>(null);
  const ownedSeekPanelRef = React.useRef<HTMLElement>(null);
  const closedOwnedSeekPanelRef = React.useRef<HTMLElement>(null);
  const [recentClearMessage, setRecentClearMessage] = React.useState("");

  React.useEffect(() => {
    if (activeTab === undefined) {
      setUncontrolledTab(initialTab);
    }
  }, [activeTab, initialTab]);

  const setBrowserTab = React.useCallback((nextTab: OnlineBrowserTab) => {
    setRecentClearMessage("");
    if (activeTab === undefined) {
      setUncontrolledTab(nextTab);
    }
    onTabChange?.(nextTab);
  }, [activeTab, onTabChange]);

  React.useEffect(() => {
    setRecentClearMessage("");
  }, [tab]);

  React.useEffect(() => {
    seekActionByIdRef.current = seekActionById;
  }, [seekActionById]);

  const visibleOwnedSeekResponse = React.useMemo(() => {
    const status = ownedSeekResponse?.summary.status;
    return status === "open" || status === "accepted" ? ownedSeekResponse : null;
  }, [ownedSeekResponse]);
  const closedOwnedSeekResponse = React.useMemo(() => {
    const status = ownedSeekResponse?.summary.status;
    return status === "cancelled" || status === "expired" ? ownedSeekResponse : null;
  }, [ownedSeekResponse]);
  const terminalOwnedSeekMessage =
    closedOwnedSeekResponse
      ? "Your previous lobby listing is closed and no longer public."
      : "";

  const handleClearRecentOnlineGames = React.useCallback(() => {
    setRecentClearMessage("Recent device replay list cleared.");
    onClearRecentOnlineGames?.();
    archiveTabButtonRef.current?.focus();
  }, [onClearRecentOnlineGames]);

  React.useEffect(() => {
    if (quickMatchStatus !== "waiting") return;
    if (!visibleOwnedSeekResponse?.summary) return;
    ownedSeekPanelRef.current?.focus();
  }, [visibleOwnedSeekResponse?.summary, quickMatchStatus]);

  React.useEffect(() => {
    if (!closedOwnedSeekResponse?.summary) return;
    closedOwnedSeekPanelRef.current?.focus();
  }, [closedOwnedSeekResponse?.summary]);

  React.useEffect(() => {
    const status = ownedSeekResponse?.summary.status;
    if (!status || status === "open") return;
    if (quickMatchStatus === "waiting") {
      setQuickMatchStatus("idle");
    }
    setSeekActionMessage((current) =>
      current ||
      (status === "accepted"
        ? "Your lobby listing was accepted. Join the game from your lobby panel."
        : "Your previous lobby listing is closed and no longer public.")
    );
  }, [ownedSeekResponse?.summary.status, quickMatchStatus]);

  const directoryState = tab === "archive" ? "archived" : "active";

  React.useEffect(() => {
    if (tab === "watch" && resultFilter !== "all") {
      setResultFilter("all");
    }
  }, [resultFilter, tab]);

  const loadPage = React.useCallback(async (
    mode: "replace" | "append",
    cursor?: string,
    options: { background?: boolean } = {}
  ) => {
    const background = options.background === true;
    if (background && gameLoadInFlightRef.current) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    gameLoadInFlightRef.current = true;
    if (mode === "replace" && !background) {
      setStatus("loading");
    } else if (mode === "append") {
      setIsLoadingMore(true);
    }
    if (!background) {
      setCopyMessage("");
      setRecentClearMessage("");
    }
    try {
      const response = await loadGames({
        state: directoryState,
        limit: 50,
        cursor,
      });
      if (requestIdRef.current !== requestId) return;
      if (!response || !Array.isArray(response.games)) {
        throw new Error("Public game directory response was malformed.");
      }
      const loadedGames = response.games;
      setGames((current) => mode === "append" ? [...current, ...loadedGames] : loadedGames);
      setNextCursor(response.nextCursor);
      setStatus("ready");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      console.error("[OnlineGameBrowser] Failed to load public games", error);
      if (mode === "replace" && !background) {
        setGames([]);
        setNextCursor(undefined);
      }
      if (!background) {
        setStatus("error");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoadingMore(false);
        gameLoadInFlightRef.current = false;
      }
    }
  }, [directoryState, loadGames]);

  const refreshGames = React.useCallback(() => {
    void loadPage("replace");
  }, [loadPage]);

  const loadMoreGames = React.useCallback(() => {
    if (!nextCursor) return;
    void loadPage("append", nextCursor);
  }, [loadPage, nextCursor]);

  React.useEffect(() => {
    refreshGames();
  }, [refreshGames]);

  React.useEffect(() => {
    if (tab !== "lobby") return;
    const refreshLiveGamesIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadPage("replace", undefined, { background: true });
    };
    const interval = window.setInterval(refreshLiveGamesIfVisible, LOBBY_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshLiveGamesIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadPage, tab]);

  React.useEffect(() => {
    if (tab !== "watch") return;
    const refreshWatchIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadPage("replace", undefined, { background: true });
    };
    const interval = window.setInterval(refreshWatchIfVisible, LOBBY_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshWatchIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadPage, tab]);

  const seekDirectoryOptions = React.useMemo<FetchOpenSeekDirectoryOptions>(() => ({
    state: "open",
    limit: 50,
    ...(seekSideFilter !== "all" ? { creatorSeat: seekSideFilter } : {}),
    ...(seekClockFilter !== "all" ? { clock: seekClockFilter } : {}),
    ...(seekVpFilter !== "all" ? { vp: seekVpFilter } : {}),
  }), [seekClockFilter, seekSideFilter, seekVpFilter]);
  const seekDirectoryOptionsRef = React.useRef(seekDirectoryOptions);

  React.useEffect(() => {
    seekDirectoryOptionsRef.current = seekDirectoryOptions;
  }, [seekDirectoryOptions]);

  const mergePendingOpenSeeks = React.useCallback((
    nextSeeks: OpenSeekSummary[],
    currentSeeks: OpenSeekSummary[]
  ): OpenSeekSummary[] => {
    const pendingIds = new Set(
      Object.entries(seekActionByIdRef.current)
        .filter(([, action]) => action !== undefined)
        .map(([seekId]) => seekId)
    );
    if (pendingIds.size === 0) return nextSeeks;
    const nextIds = new Set(nextSeeks.map((seek) => seek.seekId));
    const pendingSeeks = currentSeeks.filter(
      (seek) => pendingIds.has(seek.seekId) && !nextIds.has(seek.seekId)
    );
    return [...nextSeeks, ...pendingSeeks].sort(compareOpenSeekNewest);
  }, []);

  const loadOpenSeekPage = React.useCallback(async function runOpenSeekLoad(
    options: { background?: boolean } = {}
  ) {
    const background = options.background === true;
    if (seekLoadInFlightRef.current) {
      if (!background) {
        queuedSeekLoadRef.current = "foreground";
      } else if (!queuedSeekLoadRef.current) {
        queuedSeekLoadRef.current = "background";
      }
      return;
    }
    seekLoadInFlightRef.current = true;
    setIsSeekLoadInFlight(true);
    const requestId = seekRequestIdRef.current + 1;
    seekRequestIdRef.current = requestId;
    if (!background) {
      setSeekStatus("loading");
      setSeekActionMessage("");
      setQuickMatchStatus("idle");
    }
    try {
      const response = await loadOpenSeeks(seekDirectoryOptionsRef.current);
      if (seekRequestIdRef.current !== requestId) return;
      setOpenSeeks((current) => mergePendingOpenSeeks(response.seeks, current));
      setLastSeekCheckedAt(formatLastChecked(new Date()));
      setSeekStatus("ready");
      setSeekActionMessage((current) => current === AUTO_REFRESH_PAUSED_MESSAGE ? "" : current);
    } catch (error) {
      if (seekRequestIdRef.current !== requestId) return;
      console.error("[OnlineGameBrowser] Failed to load open seeks", error);
      if (isRateLimitError(error)) {
        seekAutoRefreshPausedUntilRef.current = Date.now() + LOBBY_RATE_LIMIT_BACKOFF_MS;
      }
      if (!background) {
        setOpenSeeks([]);
        setSeekStatus("error");
      } else if (isRateLimitError(error)) {
        setSeekActionMessage(AUTO_REFRESH_PAUSED_MESSAGE);
      }
    } finally {
      seekLoadInFlightRef.current = false;
      const queuedLoad = queuedSeekLoadRef.current;
      queuedSeekLoadRef.current = undefined;
      if (queuedLoad) {
        void loadOpenSeekPage({ background: queuedLoad === "background" });
      } else {
        setIsSeekLoadInFlight(false);
      }
    }
  }, [loadOpenSeeks, mergePendingOpenSeeks]);

  React.useEffect(() => {
    if (tab !== "lobby") return;
    void loadOpenSeekPage({ background: false });
  }, [loadOpenSeekPage, seekDirectoryOptions, tab]);

  React.useEffect(() => {
    if (tab !== "lobby") return;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < seekAutoRefreshPausedUntilRef.current) return;
      void loadOpenSeekPage({ background: true });
    };
    const interval = window.setInterval(refreshIfVisible, LOBBY_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadOpenSeekPage, tab]);

  const publicGames = React.useMemo(
    () => games.filter((game) => game.visibility === "public"),
    [games]
  );

  const publicActiveGames = React.useMemo(() => {
    return publicGames
      .filter((game) => game.status === "active")
      .sort(compareMostMoves);
  }, [publicGames]);

  const visibleGames = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = publicGames.filter((game) => {
      const tabMatches =
        tab === "watch"
          ? game.status === "active"
          : game.status === "complete" && game.archiveState === "archived";
      if (!tabMatches) return false;
      if (timeFilter === "timed" && !game.hasTimeControl) return false;
      if (timeFilter === "casual" && game.hasTimeControl) return false;
      if (tab === "archive" && !matchesResultFilter(game, resultFilter)) return false;
      return !normalizedQuery || searchText(game).includes(normalizedQuery);
    });
    return filtered.sort(sort === "moves" ? compareMostMoves : compareNewest);
  }, [publicGames, query, resultFilter, sort, tab, timeFilter]);

  const lobbyLiveGames = React.useMemo(() => {
    return publicActiveGames.slice(0, 5);
  }, [publicActiveGames]);

  const watchMostActiveGame = React.useMemo(() => {
    if (tab !== "watch" || visibleGames.length === 0) return null;
    return [...visibleGames].sort(compareMostMoves)[0] ?? null;
  }, [tab, visibleGames]);

  const watchSecondaryGames = React.useMemo(() => {
    if (tab !== "watch" || !watchMostActiveGame) return [];
    return visibleGames.filter((game) => game.gameId !== watchMostActiveGame.gameId);
  }, [tab, visibleGames, watchMostActiveGame]);

  const recentArchivedGames = React.useMemo(() => {
    if (tab !== "archive") return [];
    const publicGameIds = new Set(publicGames.map((game) => game.gameId));
    return recentOnlineGames
      .filter((game) => game.status === "complete")
      .filter((game) => !publicGameIds.has(game.gameId))
      .slice(0, 6);
  }, [publicGames, recentOnlineGames, tab]);

  const visibleOpenSeeks = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return openSeeks
      .filter((seek) => seek.status === "open")
      .filter((seek) => !normalizedQuery || seekSearchText(seek).includes(normalizedQuery))
      .sort(compareOpenSeekNewest);
  }, [openSeeks, query]);

  const emptyTitle =
    tab === "watch" ? "No public games in progress." : "No public completed games yet.";
  const hasActiveSeekFilters =
    query.trim() !== "" ||
    seekSideFilter !== "all" ||
    seekClockFilter !== "all" ||
    seekVpFilter !== "all";
  const hasActiveFilters =
    query.trim() !== "" || timeFilter !== "all" || (tab === "archive" && resultFilter !== "all");
  const hasActiveOwnedSeek =
    ownedSeekIds.length > 0 &&
    (!ownedSeekResponse ||
      ownedSeekResponse.summary.status === "open" ||
      ownedSeekResponse.summary.status === "accepted");
  const hasCurrentSetupActions = !!onQuickMatch || !!onCreateSeek;
  const setupPromptAction = onConfigureSetup ?? onOpenGame ?? onBack;
  const quickMatchPending = quickMatchStatus === "pending";
  const quickMatchBlocking = quickMatchStatus === "pending" || quickMatchStatus === "matched";
  const quickMatchDisabled =
    !onQuickMatch ||
    quickMatchBlocking ||
    createSeekPending ||
    hasActiveOwnedSeek ||
    seekStatus === "loading" ||
    isSeekLoadInFlight;
  const createSeekDisabled =
    !onCreateSeek ||
    createSeekPending ||
    quickMatchBlocking ||
    hasActiveOwnedSeek ||
    seekStatus === "loading" ||
    isSeekLoadInFlight;
  const quickMatchMessage =
    quickMatchStatus === "pending"
      ? "Checking open lobby listings..."
      : quickMatchStatus === "matched"
        ? "Match found. Opening game..."
        : quickMatchStatus === "waiting"
          ? "No open listing for this setup found. Your setup is listed in the Lobby for someone to accept."
          : quickMatchStatus === "error"
            ? "Could not start quick match."
            : "";
  const createSeekMessage = createSeekPending ? "Creating lobby listing from current setup..." : "";

  const renderPublicGameRow = (
    game: OnlineGameSummary,
    options: { compact?: boolean; featured?: boolean; context?: "watch" | "archive" } = {}
  ) => {
    const white = participantName(game.participants, "w");
    const black = participantName(game.participants, "b");
    const resultLabel = game.result ? formatOnlineGameResult(game.result) : null;
    const context = options.context ?? tab;
    const isArchivedGame = context === "archive" && game.status === "complete" && game.archiveState === "archived";
    const primaryActionLabel = isArchivedGame ? "Analyze Replay" : "Spectate";
    const primaryActionAriaLabel = isArchivedGame
      ? `Analyze replay ${white} vs ${black}, ${game.gameId}`
      : `Spectate ${white} vs ${black}, ${game.gameId}`;
    const featuredKicker = isArchivedGame ? "Featured replay" : "Most active live game";
    const className = [
      "online-game-row",
      "online-public-game-row",
      options.compact ? "online-game-row-compact" : "",
      options.featured ? "online-game-row-featured" : "",
    ].filter(Boolean).join(" ");
    const boardPreview = game.livePreview.boardPreview;
    const previewCells = boardPreviewCells(boardPreview.radius);
    const boardPreviewLabel = boardPreviewImageLabel(game);

    return (
      <article
        key={game.gameId}
        className={className}
        aria-label={`${options.featured ? `${featuredKicker} ` : ""}${white} vs ${black} ${game.gameId}`}
      >
        <div className="online-game-board-preview">
          <svg viewBox="0 0 100 100" role="img" aria-label={boardPreviewLabel} focusable="false">
            <g className="online-game-board-preview-cells">
              {previewCells.map((hex) => {
                const point = boardPreviewPoint(hex, boardPreview.radius);
                return <circle key={`${hex.q},${hex.r},${hex.s}`} cx={point.x} cy={point.y} r="1.15" />;
              })}
            </g>
            <g className="online-game-board-preview-castles">
              {boardPreview.castles.map((castle) => {
                const point = boardPreviewPoint(castle, boardPreview.radius);
                return (
                  <rect
                    key={`${castle.q},${castle.r},${castle.s}`}
                    className={`owner-${castle.owner}`}
                    x={point.x - 2.2}
                    y={point.y - 2.2}
                    width="4.4"
                    height="4.4"
                    rx="0.8"
                  />
                );
              })}
            </g>
            <g className="online-game-board-preview-pieces">
              {boardPreview.pieces.map((piece) => {
                const point = boardPreviewPoint(piece, boardPreview.radius);
                return (
                  <g
                    key={`${piece.q},${piece.r},${piece.s},${piece.color},${piece.type}`}
                    className={`piece-${piece.color}`}
                  >
                    <circle cx={point.x} cy={point.y} r={piece.type === PieceType.Monarch ? 3.5 : 2.8} />
                    {piece.type === PieceType.Monarch && (
                      <text x={point.x} y={point.y + 1.35} textAnchor="middle">
                        {PIECE_PREVIEW_LABELS[piece.type]}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="online-game-row-main">
          <div className="online-game-players">
            {options.featured && <span className="online-game-kicker">{featuredKicker}</span>}
            <strong>{white} vs {black}</strong>
            <span>{game.gameId}</span>
          </div>
          <div className="online-game-meta">
            <span className={`online-game-pill ${game.status}`}>
              {game.status === "active" ? "Live" : "Complete"}
            </span>
            <span>{formatMoveCount(game.livePreview.moveCount)}</span>
            {options.featured && !isArchivedGame && <span>Most moves in current list</span>}
            {!isArchivedGame && (
              <span>
                {formatSideToMove(game.livePreview.sideToMove)} to move, {game.livePreview.turnPhase}
              </span>
            )}
            {game.livePreview.lastMove && <span>Last {game.livePreview.lastMove.notation}</span>}
            <span>{!isArchivedGame && game.hasTimeControl ? formatClockSnapshot(game) : game.hasTimeControl ? "Timed" : "Casual"}</span>
            <span>Updated {formatUpdatedAt(game.updatedAt)}</span>
          </div>
          {resultLabel && <div className="online-game-result">{resultLabel}</div>}
        </div>
        <div className="online-game-actions">
          <button
            type="button"
            className="online-browser-button primary"
            onClick={() => {
              if (isArchivedGame) {
                onReplay(game.gameId);
              } else {
                onSpectate(game.gameId);
              }
            }}
            aria-label={primaryActionAriaLabel}
          >
            {primaryActionLabel}
          </button>
          {!isArchivedGame && (
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => copySpectatorLink(game.gameId)}
              aria-label={`Copy spectator link for ${game.gameId}`}
            >
              Copy Link
            </button>
          )}
        </div>
      </article>
    );
  };

  const renderRecentOnlineGameRow = (record: RecentOnlineGameRecord) => {
    return (
      <article key={record.gameId} className="online-game-row online-recent-game-row">
        <div className="online-game-row-main">
          <div className="online-game-players">
            <span className="online-game-kicker">Recent on this device</span>
            <strong>{record.gameId}</strong>
            <span>{formatRecentOnlineGameRole(record)}</span>
          </div>
          <div className="online-game-meta">
            <span className="online-game-pill complete">Complete</span>
            <span>Last opened {formatRecentOnlineGameTime(record.lastSeenAt)}</span>
            <span>{formatRecentOnlineGameScope()}</span>
          </div>
        </div>
        <div className="online-game-actions">
          <button
            type="button"
            className="online-browser-button primary"
            onClick={() => onReplay(record.gameId)}
            aria-label={`Analyze recent online replay ${record.gameId}`}
          >
            Analyze Replay
          </button>
        </div>
      </article>
    );
  };

  const renderLiveOverview = (
    liveGameCount: number,
    featuredGame: OnlineGameSummary | null,
    label: string
  ) => {
    const featuredWhite = featuredGame ? participantName(featuredGame.participants, "w") : "";
    const featuredBlack = featuredGame ? participantName(featuredGame.participants, "b") : "";
    return (
      <div className="online-browser-live-overview" role="group" aria-label={label}>
        <div className="online-browser-live-stat">
          <span>Live now</span>
          <strong>{formatPublicLiveCount(liveGameCount)}</strong>
        </div>
        <div className="online-browser-live-stat">
          <span>Featured by</span>
          <strong>{featuredGame ? "Most moves" : liveGameCount > 0 ? "No visible game" : "No featured game"}</strong>
        </div>
        <div className="online-browser-live-stat online-browser-live-stat-wide">
          <span>Activity leader</span>
          <strong>
            {featuredGame
              ? `${featuredWhite} vs ${featuredBlack}, ${formatMoveCount(featuredGame.livePreview.moveCount)}`
              : liveGameCount > 0
                ? "No matching public games"
                : "Waiting for public games"}
          </strong>
        </div>
        <div className="online-browser-live-stat">
          <span>Visibility</span>
          <strong>Public only</strong>
        </div>
      </div>
    );
  };

  const runQuickMatch = async () => {
    if (!onQuickMatch || quickMatchDisabled) return;
    setQuickMatchStatus("pending");
    setSeekActionMessage("");
    let shouldRestoreFocus = false;
    try {
      const outcome = await onQuickMatch();
      setQuickMatchStatus(outcome === "matched" ? "matched" : "waiting");
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to start quick match", error);
      shouldRestoreFocus = true;
      setQuickMatchStatus("error");
    } finally {
      if (shouldRestoreFocus) {
        window.setTimeout(() => quickMatchButtonRef.current?.focus(), 0);
      }
    }
  };

  const runCreateSeek = async () => {
    if (!onCreateSeek || createSeekDisabled) return;
    setCreateSeekPending(true);
    setQuickMatchStatus("idle");
    setSeekActionMessage("");
    try {
      await onCreateSeek();
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to list current setup", error);
      setSeekActionMessage("Could not list the current setup.");
    } finally {
      setCreateSeekPending(false);
    }
  };

  const runSeekAction = async (seekId: string, action: "accept" | "cancel") => {
    const handler = action === "accept" ? onAcceptSeek : onCancelSeek;
    if (!handler) return;
    setSeekActionById((current) => {
      const next = { ...current, [seekId]: action };
      seekActionByIdRef.current = next;
      return next;
    });
    setQuickMatchStatus("idle");
    setSeekActionMessage("");
    try {
      await handler(seekId);
      setSeekActionMessage(action === "accept" ? "Opening accepted game..." : "Lobby listing cancelled.");
      if (action === "cancel") {
        setOpenSeeks((current) => current.filter((seek) => seek.seekId !== seekId));
      }
    } catch (error) {
      console.error(`[OnlineGameBrowser] Failed to ${action} open seek`, error);
      setSeekActionMessage(action === "accept" ? "Could not accept that lobby listing." : "Could not cancel that lobby listing.");
    } finally {
      setSeekActionById((current) => {
        const next = { ...current };
        delete next[seekId];
        seekActionByIdRef.current = next;
        return next;
      });
    }
  };

  const runOwnedSeekRefresh = React.useCallback(async (options: { background?: boolean } = {}) => {
    if (!onRefreshOwnedSeek) return;
    const background = options.background === true;
    if (ownedSeekRefreshInFlightRef.current) return;
    ownedSeekRefreshInFlightRef.current = true;
    if (!background) {
      setOwnedSeekAction("refresh");
      setQuickMatchStatus("idle");
      setSeekActionMessage("");
    }
    try {
      await onRefreshOwnedSeek();
      if (!background) {
        setSeekActionMessage("Your lobby listing was refreshed.");
      }
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to refresh owned open seek", error);
      if (isRateLimitError(error)) {
        seekAutoRefreshPausedUntilRef.current = Date.now() + LOBBY_RATE_LIMIT_BACKOFF_MS;
      }
      if (!background) {
        setSeekActionMessage("Could not refresh your lobby listing.");
      }
    } finally {
      ownedSeekRefreshInFlightRef.current = false;
      if (!background) {
        setOwnedSeekAction(undefined);
      }
    }
  }, [onRefreshOwnedSeek]);

  React.useEffect(() => {
    if (tab !== "lobby") return;
    if (ownedSeekResponse?.summary.status !== "open") return;
    if (!onRefreshOwnedSeek) return;
    const refreshOwnedIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < seekAutoRefreshPausedUntilRef.current) return;
      void runOwnedSeekRefresh({ background: true });
    };
    const interval = window.setInterval(refreshOwnedIfVisible, LOBBY_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshOwnedIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onRefreshOwnedSeek, ownedSeekResponse?.summary.status, runOwnedSeekRefresh, tab]);

  const runOwnedSeekJoin = () => {
    if (!onJoinOwnedSeek) return;
    setOwnedSeekAction("join");
    onJoinOwnedSeek();
  };

  const openWatchFromLobby = () => {
    setQuery("");
    setTimeFilter("all");
    setSort("moves");
    setBrowserTab("watch");
  };

  const copySpectatorLink = async (gameId: string) => {
    setRecentClearMessage("");
    try {
      await copyOnlineInviteUrl(buildSpectatorUrl(window.location.href, gameId));
      setCopyMessage("Spectator link copied.");
    } catch {
      setCopyMessage("Could not copy the spectator link.");
    }
  };

  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame ?? onBack },
    ...(onTutorial ? [{ id: "learn" as const, label: "Tutorial", onClick: onTutorial }] : []),
    { id: "online", label: "Online" },
    ...(onOpenLibrary ? [{ id: "library" as const, label: "Library", onClick: onOpenLibrary }] : []),
  ];

  return (
    <div className="online-browser-page">
      <AppShellNav
        ariaLabel="Online navigation"
        activeDestination="online"
        title="Online"
        kicker="Lobby, Watch, Archive"
        description="Create or accept lobby listings, watch live public games, and replay completed public games."
        backLabel={backLabel}
        onBack={onBack}
        destinations={navDestinations}
      />

      <section className={`online-browser-toolbar online-browser-toolbar-${tab}`} aria-label="Online browser controls">
        <div className="online-browser-tabs" role="group" aria-label="Online game lists">
          <button
            type="button"
            aria-label="Lobby games"
            aria-pressed={tab === "lobby"}
            className={tab === "lobby" ? "active" : ""}
            onClick={() => setBrowserTab("lobby")}
          >
            Lobby
          </button>
          <button
            type="button"
            aria-label="Live public games"
            aria-pressed={tab === "watch"}
            className={tab === "watch" ? "active" : ""}
            onClick={() => setBrowserTab("watch")}
          >
            Watch
          </button>
          <button
            type="button"
            aria-label="Online Archive"
            aria-pressed={tab === "archive"}
            className={tab === "archive" ? "active" : ""}
            onClick={() => setBrowserTab("archive")}
            ref={archiveTabButtonRef}
          >
            Archive
          </button>
        </div>
        {tab === "lobby" ? (
          <div className="online-browser-filter-panel" role="group" aria-label="Find lobby listings">
            <div className="online-browser-control-title">Find lobby listings</div>
            <div className="online-browser-filter-grid">
              <label className="online-browser-select">
                <span>Creator side</span>
                <select
                  aria-label="Lobby creator side filter"
                  value={seekSideFilter}
                  onChange={(event) => setSeekSideFilter(event.currentTarget.value as OpenSeekSideFilter)}
                >
                  <option value="all">All creator sides</option>
                  <option value="random">Random</option>
                  <option value="w">White</option>
                  <option value="b">Black</option>
                </select>
              </label>
              <label className="online-browser-select">
                <span>Clock</span>
                <select
                  aria-label="Lobby clock filter"
                  value={seekClockFilter}
                  onChange={(event) => setSeekClockFilter(event.currentTarget.value as OpenSeekClockFilter)}
                >
                  <option value="all">All clocks</option>
                  <option value="timed">Timed</option>
                  <option value="casual">Casual</option>
                </select>
              </label>
              <label className="online-browser-select">
                <span>Scoring</span>
                <select
                  aria-label="Lobby scoring filter"
                  value={seekVpFilter}
                  onChange={(event) => setSeekVpFilter(event.currentTarget.value as OpenSeekVpFilter)}
                >
                  <option value="all">All scoring</option>
                  <option value="enabled">Victory points</option>
                  <option value="disabled">Castle control</option>
                </select>
              </label>
              <button
                type="button"
                className="online-browser-button neutral"
                onClick={() => void loadOpenSeekPage({ background: false })}
                disabled={seekStatus === "loading" || isSeekLoadInFlight || quickMatchBlocking}
                aria-label="Refresh lobby listings"
              >
                {seekStatus === "loading" ? "Refreshing..." : "Refresh listings"}
              </button>
            </div>
          </div>
        ) : (
          <div className="online-browser-filter-panel" role="group" aria-label={tab === "watch" ? "Browse live public games" : "Browse archived public games"}>
            <div className="online-browser-control-title">{tab === "watch" ? "Browse live games" : "Browse archive"}</div>
            <div className="online-browser-filter-grid">
              <label className="online-browser-select">
                <span>Sort</span>
                <select
                  aria-label="Sort public games"
                  value={sort}
                  onChange={(event) => setSort(event.currentTarget.value as OnlineBrowserSort)}
                >
                  <option value="newest">Newest</option>
                  <option value="moves">Most moves</option>
                </select>
              </label>
              <label className="online-browser-select">
                <span>Clock</span>
                <select
                  aria-label="Time control filter"
                  value={timeFilter}
                  onChange={(event) => setTimeFilter(event.currentTarget.value as OnlineBrowserTimeFilter)}
                >
                  <option value="all">All clocks</option>
                  <option value="timed">Timed</option>
                  <option value="casual">Casual</option>
                </select>
              </label>
              {tab === "archive" && (
                <label className="online-browser-select">
                  <span>Result</span>
                  <select
                    aria-label="Result filter"
                    value={resultFilter}
                    onChange={(event) => setResultFilter(event.currentTarget.value as OnlineBrowserResultFilter)}
                  >
                    <option value="all">All results</option>
                    <option value="white">White wins</option>
                    <option value="black">Black wins</option>
                    <option value="resignation">Resignation</option>
                    <option value="timeout">Timeout</option>
                    <option value="castle_control">Castle control</option>
                    <option value="victory_points">Victory points</option>
                    <option value="monarch_captured">Monarch captured</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
        <label className="online-browser-search">
          <span>Search</span>
          <input
            type="search"
            aria-label={tab === "lobby" ? "Search lobby listings" : "Search public games"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "lobby" ? "Listing id, creator side, clock, or scoring" : "Player, game id, or move"}
          />
        </label>
      </section>

      <div className="online-browser-status-line" role="status" aria-live="polite">
        {tab === "lobby"
          ? seekStatus === "loading"
            ? "Loading lobby listings..."
            : seekStatus === "error"
              ? "Could not load lobby listings."
              : copyMessage || seekActionMessage || quickMatchMessage || createSeekMessage || terminalOwnedSeekMessage || (
                <>
                  {visibleOpenSeeks.length} lobby listings shown
                  {lastSeekCheckedAt ? <span aria-hidden="true">; last checked {lastSeekCheckedAt}</span> : null}
                </>
              )
          : status === "loading"
            ? "Loading public games..."
            : status === "error"
              ? "Could not load public games."
              : copyMessage || (tab === "archive" ? recentClearMessage : "") ||
                `${visibleGames.length} public ${tab === "watch" ? "live" : "archived"} games shown${nextCursor ? "; more available" : ""}`}
      </div>
      {tab === "lobby" && seekStatus === "ready" && lastSeekCheckedAt ? (
        <div className="online-browser-visually-hidden" aria-live="off">
          Last checked {lastSeekCheckedAt}
        </div>
      ) : null}

      {tab === "lobby" ? (
        seekStatus === "error" ? (
          <button
            type="button"
            className="online-browser-button neutral"
            onClick={() => void loadOpenSeekPage()}
          >
            Retry
          </button>
        ) : (
          <main className="online-browser-list" aria-label="Online lobby">
            <section
              className={`online-browser-quick-match-panel ${hasCurrentSetupActions ? "" : "setup-needed"}`}
              aria-label={hasCurrentSetupActions ? "Play from current setup" : "Set up lobby play"}
            >
              <div className="online-browser-quick-match-copy">
                <span className="online-browser-section-kicker">
                  {hasCurrentSetupActions ? "Play from current setup" : "Setup needed"}
                </span>
                <strong>
                  {hasCurrentSetupActions
                    ? "Try open listings with your current Play setup"
                    : "Choose a Play setup before lobby play"}
                </strong>
                <p>
                  {hasCurrentSetupActions
                    ? "Quick Match tries open listings for this setup, then lists yours if none are available. Filters only change the listings below."
                    : "Quick Match and lobby listings use the board, pieces, clock, and scoring from Play."}
                </p>
              </div>
              {quickMatchSetupSummary && (
                <div className="online-browser-quick-match-summary" aria-label="Quick match setup summary">
                  <span>Radius {quickMatchSetupSummary.boardRadius}</span>
                  <span>{quickMatchSetupSummary.clock}</span>
                  <span>{quickMatchSetupSummary.scoring}</span>
                </div>
              )}
              <div className="online-browser-quick-match-actions">
                {hasCurrentSetupActions ? (
                  <>
                    {onQuickMatch && (
                      <button
                        type="button"
                        ref={quickMatchButtonRef}
                        className="online-browser-button primary online-browser-quick-match"
                        onClick={() => void runQuickMatch()}
                        disabled={quickMatchDisabled}
                        aria-label="Quick Match: try open lobby listings or list yours"
                      >
                        {quickMatchPending ? "Matching..." : quickMatchStatus === "matched" ? "Opening..." : "Quick Match"}
                      </button>
                    )}
                    {onCreateSeek && (
                      <button
                        type="button"
                        className="online-browser-button neutral online-browser-create-seek"
                        onClick={() => void runCreateSeek()}
                        disabled={createSeekDisabled}
                        aria-label="Create public lobby listing from current Play setup"
                      >
                        {createSeekPending ? "Listing..." : "Create Lobby Listing"}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="online-browser-button primary online-browser-setup-action"
                    onClick={setupPromptAction}
                    aria-label="Configure a Play setup for online lobby"
                  >
                    Configure Setup
                  </button>
                )}
              </div>
            </section>
            {visibleOwnedSeekResponse?.summary && (
              <section
                className="online-seek-owner-panel"
                aria-label="Your lobby listing"
                ref={ownedSeekPanelRef}
                tabIndex={-1}
              >
                <div className="online-game-row-main">
                  <div className="online-game-players">
                    <strong>Your lobby listing</strong>
                    <span>{visibleOwnedSeekResponse.summary.seekId}</span>
                  </div>
                  <div className="online-game-meta">
                    <span className={`online-game-pill ${visibleOwnedSeekResponse.summary.status}`}>
                      {formatSeekStatus(visibleOwnedSeekResponse.summary.status)}
                    </span>
                    <span>{formatOwnedSeekSideDetail(visibleOwnedSeekResponse)}</span>
                    <span>{formatSeekClock(visibleOwnedSeekResponse.summary)}</span>
                    <span>{formatSeekScoringLabel(visibleOwnedSeekResponse.summary)}</span>
                    <span>Expires {formatSeekExpiresAt(visibleOwnedSeekResponse.summary.expiresAt)}</span>
                  </div>
                </div>
                <div className="online-game-actions">
                  {visibleOwnedSeekResponse.summary.status === "open" && (
                    <>
                      <button
                        type="button"
                        className="online-browser-button neutral"
                        onClick={() => void runOwnedSeekRefresh()}
                        disabled={!onRefreshOwnedSeek || ownedSeekAction !== undefined || quickMatchBlocking}
                        aria-label="Refresh your lobby listing"
                      >
                        {ownedSeekAction === "refresh" ? "Refreshing..." : "Refresh Listing"}
                      </button>
                      <button
                        type="button"
                        className="online-browser-button neutral"
                        onClick={() => void runSeekAction(visibleOwnedSeekResponse.summary.seekId, "cancel")}
                        disabled={!onCancelSeek || seekActionById[visibleOwnedSeekResponse.summary.seekId] !== undefined || quickMatchBlocking}
                        aria-label="Cancel your lobby listing"
                      >
                        {seekActionById[visibleOwnedSeekResponse.summary.seekId] === "cancel" ? "Cancelling..." : "Cancel"}
                      </button>
                    </>
                  )}
                  {visibleOwnedSeekResponse.summary.status === "accepted" && visibleOwnedSeekResponse.gameInvite && (
                    <button
                      type="button"
                      className="online-browser-button primary"
                      onClick={runOwnedSeekJoin}
                      disabled={!onJoinOwnedSeek || ownedSeekAction !== undefined || quickMatchBlocking}
                      aria-label="Join accepted game"
                    >
                      {ownedSeekAction === "join" ? "Joining..." : "Join Game"}
                    </button>
                  )}
                </div>
              </section>
            )}
            {closedOwnedSeekResponse?.summary && (
              <section
                className="online-browser-closed-listing"
                aria-label="Closed lobby listing"
                ref={closedOwnedSeekPanelRef}
                tabIndex={-1}
              >
                <div className="online-browser-quick-match-copy">
                  <span className="online-browser-section-kicker">Lobby listing closed</span>
                  <strong>This listing is no longer public</strong>
                  <p>
                    Cancelled and expired listings are removed from the Lobby. Create a new listing from your
                    current Play setup when you want another opponent.
                  </p>
                  <div className="online-game-meta">
                    <span className={`online-game-pill ${closedOwnedSeekResponse.summary.status}`}>
                      {formatSeekStatus(closedOwnedSeekResponse.summary.status)}
                    </span>
                    <span>{closedOwnedSeekResponse.summary.seekId}</span>
                  </div>
                </div>
              </section>
            )}
            <section className="online-browser-lobby-listings" aria-label="Open lobby listings">
              <div className="online-browser-section-header online-browser-section-header-compact">
                <div>
                  <span className="online-browser-section-kicker">Lobby</span>
                  <h2>Open listings</h2>
                  <p>
                    {seekStatus === "loading"
                      ? "Loading lobby listings..."
                      : `${visibleOpenSeeks.length} open ${visibleOpenSeeks.length === 1 ? "listing" : "listings"}`}
                  </p>
                </div>
              </div>
              {visibleOpenSeeks.length === 0 && seekStatus === "ready" ? (
                <div className="online-browser-empty">
                  <h2>{hasActiveSeekFilters ? "No lobby listings match these filters." : "No lobby listings yet."}</h2>
                  <p>
                    {hasActiveSeekFilters
                      ? "Try a different creator side, clock, scoring, or search setting."
                      : hasCurrentSetupActions
                        ? "Use Quick Match or Create Lobby Listing above, or change setup from Play."
                        : "Configure setup, then return here to find or create a lobby listing."}
                  </p>
                </div>
              ) : (
                visibleOpenSeeks.map((seek) => {
                  const owned = ownedSeekIds.includes(seek.seekId);
                  const pendingAction = seekActionById[seek.seekId];
                  const radius = seek.setup.board.config.nSquares;
                  return (
                    <article
                      key={seek.seekId}
                      className="online-game-row online-seek-row"
                      aria-label={`Lobby listing ${seek.seekId}`}
                    >
                      <div className="online-game-row-main">
                        <div className="online-game-players">
                          <strong>Lobby listing</strong>
                          <span>{seek.seekId}</span>
                        </div>
                        <div className="online-game-meta">
                          <span className="online-game-pill active">Open</span>
                          <span>{formatSeekSideDetail(seek, owned)}</span>
                          <span>Board Radius {radius}</span>
                          <span>Clock {formatSeekClock(seek)}</span>
                          <span>Scoring {formatSeekScoringLabel(seek)}</span>
                          <span>Expires {formatSeekExpiresAt(seek.expiresAt)}</span>
                        </div>
                      </div>
                      <div className="online-game-actions">
                        {owned ? (
                          <button
                            type="button"
                            className="online-browser-button neutral"
                            onClick={() => void runSeekAction(seek.seekId, "cancel")}
                            disabled={!onCancelSeek || pendingAction !== undefined || quickMatchBlocking}
                            aria-label={`Cancel lobby listing ${seek.seekId}`}
                          >
                            {pendingAction === "cancel" ? "Cancelling..." : "Cancel"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="online-browser-button primary"
                            onClick={() => void runSeekAction(seek.seekId, "accept")}
                            disabled={!onAcceptSeek || pendingAction !== undefined || quickMatchBlocking}
                            aria-label={`Accept lobby listing ${seek.seekId}`}
                          >
                            {pendingAction === "accept" ? "Accepting..." : "Accept"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </section>
            <section className="online-browser-live-section" aria-label="Current public games">
              <div className="online-browser-section-header">
                <div>
                  <span className="online-browser-section-kicker">Watch</span>
                  <h2>Current games</h2>
                  <p>
                    {status === "loading"
                      ? "Loading public games..."
                      : status === "error"
                        ? "Could not load live games."
                        : copyMessage || `${publicActiveGames.length} public games in progress`}
                  </p>
                </div>
                <div className="online-browser-section-actions">
                  <button
                    type="button"
                    className="online-browser-button subtle"
                    onClick={openWatchFromLobby}
                    aria-label="Open Watch tab"
                  >
                    Open Watch
                  </button>
                  <button
                    type="button"
                    className="online-browser-button subtle"
                    onClick={refreshGames}
                    disabled={status === "loading"}
                    aria-label="Refresh live public games"
                  >
                    {status === "loading" ? "Refreshing..." : "Refresh live games"}
                  </button>
                </div>
              </div>
              {renderLiveOverview(publicActiveGames.length, lobbyLiveGames[0] ?? null, "Lobby live games overview")}
              {status === "error" ? (
                <div className="online-browser-empty online-browser-empty-compact">
                  <h2>Live games are unavailable.</h2>
                  <p>Refresh live games to try again.</p>
                </div>
              ) : lobbyLiveGames.length === 0 && status === "ready" ? (
                <div className="online-browser-empty online-browser-empty-compact">
                  <h2>No public games in progress.</h2>
                  <p>Accepted lobby games appear here automatically.</p>
                </div>
              ) : (
                <div className="online-browser-live-list">
                  {lobbyLiveGames[0] && renderPublicGameRow(lobbyLiveGames[0], { featured: true, context: "watch" })}
                  {lobbyLiveGames.slice(1).map((game) =>
                    renderPublicGameRow(game, { compact: true, context: "watch" })
                  )}
                </div>
              )}
            </section>
          </main>
        )
      ) : status === "error" ? (
        <button type="button" className="online-browser-button neutral" onClick={refreshGames}>
          Retry
        </button>
      ) : tab === "watch" ? (
        <main className="online-browser-watch-surface" aria-label="Public live games">
          <section className="online-browser-live-section" aria-label="Watch public games summary">
            <div className="online-browser-section-header">
              <div>
                <span className="online-browser-section-kicker">Watch</span>
                <h2>Live public games</h2>
                <p>
                  {status === "loading"
                    ? "Loading public games..."
                    : copyMessage || `${visibleGames.length} public games shown`}
                </p>
              </div>
              <button
                type="button"
                className="online-browser-button subtle"
                onClick={refreshGames}
                disabled={status === "loading"}
                aria-label="Refresh live public games"
              >
                {status === "loading" ? "Refreshing..." : "Refresh live games"}
              </button>
            </div>
            {renderLiveOverview(publicActiveGames.length, watchMostActiveGame, "Watch live games overview")}
            {visibleGames.length === 0 && status === "ready" ? (
              <section className="online-browser-empty online-browser-empty-compact">
                <h2>{hasActiveFilters && publicGames.length > 0 ? "No public games match these filters." : emptyTitle}</h2>
                <p>
                  {hasActiveFilters && publicGames.length > 0
                    ? "Try a different search or clock setting."
                    : "Accepted public lobby games appear here automatically. Private and unlisted games stay off this page."}
                </p>
              </section>
            ) : (
              <div className="online-browser-watch-grid">
                {watchMostActiveGame && (
                  <section className="online-browser-featured-game" aria-label="Most active public live game">
                    {renderPublicGameRow(watchMostActiveGame, { featured: true, context: "watch" })}
                  </section>
                )}
                {watchSecondaryGames.length > 0 && (
                  <section className="online-browser-side-list" aria-label="Other public live games">
                    <div className="online-browser-side-list-header">
                      <span className="online-browser-section-kicker">More games</span>
                      <strong>{watchSecondaryGames.length} more public {watchSecondaryGames.length === 1 ? "game" : "games"}</strong>
                    </div>
                    {watchSecondaryGames.map((game) =>
                      renderPublicGameRow(game, { compact: true, context: "watch" })
                    )}
                  </section>
                )}
              </div>
            )}
            {nextCursor && status === "ready" && (
              <button
                type="button"
                className="online-browser-button neutral online-browser-load-more"
                onClick={loadMoreGames}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </section>
        </main>
      ) : (
        <main className="online-browser-list" aria-label="Public archived games">
          <>
            {recentArchivedGames.length > 0 && (
              <section className="online-browser-recent-games" aria-label="Recent online games on this device">
                <div className="online-browser-side-list-header">
                  <div className="online-browser-side-list-heading">
                    <span className="online-browser-section-kicker">On this device</span>
                    <strong>Recent completed online games</strong>
                  </div>
                  {onClearRecentOnlineGames && (
                    <button
                      type="button"
                      className="online-browser-button subtle online-browser-clear-recent"
                      onClick={handleClearRecentOnlineGames}
                      aria-label="Clear recent online replays on this device"
                    >
                      Clear Recent Replays
                    </button>
                  )}
                </div>
                <p>
                  Completed online games opened in this browser can be replayed here when they are not already in the public archive.
                </p>
                {recentArchivedGames.map(renderRecentOnlineGameRow)}
              </section>
            )}
            {visibleGames.length === 0 && status === "ready" ? (
              <section className="online-browser-empty">
                <h2>{hasActiveFilters && publicGames.length > 0 ? "No public games match these filters." : emptyTitle}</h2>
                <p>
                  {hasActiveFilters && publicGames.length > 0
                    ? "Try a different search, clock, or result setting."
                    : "Private and unlisted games stay off this page. Shared spectator links still work for people who already have them."}
                </p>
              </section>
            ) : visibleGames.map((game) => renderPublicGameRow(game, { context: tab === "archive" ? "archive" : "watch" }))}
            {nextCursor && status === "ready" && (
              <button
                type="button"
                className="online-browser-button neutral online-browser-load-more"
                onClick={loadMoreGames}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </>
        </main>
      )}
    </div>
  );
};

export default OnlineGameBrowser;
