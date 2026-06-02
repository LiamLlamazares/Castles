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
  OnlineGameSummary,
  OnlineGameSummaryParticipant,
} from "../online/readModel";
import type {
  OpenSeekDirectoryResponse,
  OpenSeekSummary,
} from "../online/seeks";
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
  onTutorial?: () => void;
  onOpenLibrary?: () => void;
  onCreateSeek?: () => void;
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

function searchText(summary: OnlineGameSummary): string {
  const white = participantName(summary.participants, "w");
  const black = participantName(summary.participants, "b");
  return [
    summary.gameId,
    white,
    black,
    summary.status,
    summary.archiveState,
    summary.result ? formatOnlineGameResult(summary.result) : "",
  ].join(" ").toLowerCase();
}

function compareNewest(left: OnlineGameSummary, right: OnlineGameSummary): number {
  if (left.updatedAt !== right.updatedAt) return right.updatedAt.localeCompare(left.updatedAt);
  return left.gameId.localeCompare(right.gameId);
}

function compareMostMoves(left: OnlineGameSummary, right: OnlineGameSummary): number {
  if (left.version !== right.version) return right.version - left.version;
  return compareNewest(left, right);
}

function matchesResultFilter(summary: OnlineGameSummary, resultFilter: OnlineBrowserResultFilter): boolean {
  if (resultFilter === "all") return true;
  if (!summary.result) return false;
  if (resultFilter === "white") return summary.result.winner === "w";
  if (resultFilter === "black") return summary.result.winner === "b";
  return summary.result.reason === resultFilter;
}

function seekSearchText(summary: OpenSeekSummary): string {
  return [
    summary.seekId,
    summary.creatorSeat,
    summary.status,
    summary.setup.board.config.nSquares,
    summary.setup.timeControl ? `${summary.setup.timeControl.initial}+${summary.setup.timeControl.increment}` : "casual",
    summary.setup.gameRules?.vpModeEnabled ? "victory points" : "",
  ].join(" ").toLowerCase();
}

function formatSeekClock(summary: OpenSeekSummary): string {
  const clock = summary.setup.timeControl;
  return clock ? `Timed ${clock.initial}+${clock.increment}` : "Casual";
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
  const [ownedSeekAction, setOwnedSeekAction] = React.useState<"refresh" | "join" | undefined>();
  const [lastSeekCheckedAt, setLastSeekCheckedAt] = React.useState("");
  const [isSeekLoadInFlight, setIsSeekLoadInFlight] = React.useState(false);
  const requestIdRef = React.useRef(0);
  const seekRequestIdRef = React.useRef(0);
  const seekLoadInFlightRef = React.useRef(false);
  const ownedSeekRefreshInFlightRef = React.useRef(false);
  const seekAutoRefreshPausedUntilRef = React.useRef(0);
  const seekActionByIdRef = React.useRef(seekActionById);
  const queuedSeekLoadRef = React.useRef<"foreground" | "background" | undefined>();
  const quickMatchButtonRef = React.useRef<HTMLButtonElement>(null);
  const ownedSeekPanelRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (activeTab === undefined) {
      setUncontrolledTab(initialTab);
    }
  }, [activeTab, initialTab]);

  const setBrowserTab = React.useCallback((nextTab: OnlineBrowserTab) => {
    if (activeTab === undefined) {
      setUncontrolledTab(nextTab);
    }
    onTabChange?.(nextTab);
  }, [activeTab, onTabChange]);

  React.useEffect(() => {
    seekActionByIdRef.current = seekActionById;
  }, [seekActionById]);

  const visibleOwnedSeekResponse = React.useMemo(() => {
    const status = ownedSeekResponse?.summary.status;
    return status === "open" || status === "accepted" ? ownedSeekResponse : null;
  }, [ownedSeekResponse]);
  const terminalOwnedSeekMessage =
    ownedSeekResponse?.summary.status === "cancelled" || ownedSeekResponse?.summary.status === "expired"
      ? "Your lobby listing is no longer open."
      : "";

  React.useEffect(() => {
    if (quickMatchStatus !== "waiting") return;
    if (!visibleOwnedSeekResponse?.summary) return;
    ownedSeekPanelRef.current?.focus();
  }, [visibleOwnedSeekResponse?.summary, quickMatchStatus]);

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
        : "Your lobby listing is no longer open.")
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
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (mode === "replace" && !background) {
      setStatus("loading");
    } else if (mode === "append") {
      setIsLoadingMore(true);
    }
    if (!background) {
      setCopyMessage("");
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
    return publicGames
      .filter((game) => game.status === "active")
      .sort(compareMostMoves)
      .slice(0, 5);
  }, [publicGames]);

  const visibleOpenSeeks = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return openSeeks
      .filter((seek) => seek.status === "open")
      .filter((seek) => !normalizedQuery || seekSearchText(seek).includes(normalizedQuery))
      .sort(compareOpenSeekNewest);
  }, [openSeeks, query]);

  const emptyTitle =
    tab === "watch" ? "No public live games yet." : "No public completed games yet.";
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
  const quickMatchPending = quickMatchStatus === "pending";
  const quickMatchBlocking = quickMatchStatus === "pending" || quickMatchStatus === "matched";
  const quickMatchDisabled =
    !onQuickMatch ||
    quickMatchBlocking ||
    hasActiveOwnedSeek ||
    seekStatus === "loading" ||
    isSeekLoadInFlight;
  const quickMatchMessage =
    quickMatchStatus === "pending"
      ? "Checking compatible lobby listings..."
      : quickMatchStatus === "matched"
        ? "Match found. Opening game..."
        : quickMatchStatus === "waiting"
          ? "No compatible lobby listing found. Your game is listed in the Lobby for someone to accept."
          : quickMatchStatus === "error"
            ? "Could not start quick match."
            : "";

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
    const className = [
      "online-game-row",
      options.compact ? "online-game-row-compact" : "",
      options.featured ? "online-game-row-featured" : "",
    ].filter(Boolean).join(" ");

    return (
      <article
        key={game.gameId}
        className={className}
        aria-label={`${options.featured ? "Featured live game " : ""}${white} vs ${black} ${game.gameId}`}
      >
        <div className="online-game-row-main">
          <div className="online-game-players">
            {options.featured && <span className="online-game-kicker">Featured live game</span>}
            <strong>{white} vs {black}</strong>
            <span>{game.gameId}</span>
          </div>
          <div className="online-game-meta">
            <span className={`online-game-pill ${game.status}`}>
              {game.status === "active" ? "Live" : "Complete"}
            </span>
            <span>{game.version} {game.version === 1 ? "move" : "moves"}</span>
            <span>{game.hasTimeControl ? "Timed" : "Casual"}</span>
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

  const copySpectatorLink = async (gameId: string) => {
    try {
      await copyOnlineInviteUrl(buildSpectatorUrl(window.location.href, gameId));
      setCopyMessage("Spectator link copied.");
    } catch {
      setCopyMessage("Could not copy the spectator link.");
    }
  };

  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame ?? onBack },
    ...(onTutorial ? [{ id: "learn" as const, label: "Learn", onClick: onTutorial }] : []),
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

      <section className="online-browser-toolbar" aria-label="Online browser controls">
        <div className="online-browser-tabs" aria-label="Online game lists">
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
          >
            Archive
          </button>
        </div>
        {tab === "lobby" ? (
          <div className="online-browser-filter-grid">
            <label className="online-browser-select">
              <span>Side</span>
              <select
                aria-label="Lobby side filter"
                value={seekSideFilter}
                onChange={(event) => setSeekSideFilter(event.currentTarget.value as OpenSeekSideFilter)}
              >
                <option value="all">All sides</option>
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
                aria-label="Lobby victory points filter"
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
            {onQuickMatch && (
              <button
                type="button"
                ref={quickMatchButtonRef}
                className="online-browser-button primary online-browser-quick-match"
                onClick={() => void runQuickMatch()}
                disabled={quickMatchDisabled}
                aria-label="Quick Match: accept a compatible lobby listing or list yours"
              >
                {quickMatchPending ? "Matching..." : quickMatchStatus === "matched" ? "Opening..." : "Quick Match"}
              </button>
            )}
            {onCreateSeek && (
              <button
                type="button"
                className="online-browser-button primary online-browser-create-seek"
                onClick={onCreateSeek}
                disabled={quickMatchBlocking || hasActiveOwnedSeek}
                aria-label="Create public lobby listing from current Play setup"
              >
                Create Listing
              </button>
            )}
          </div>
        ) : (
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
        )}
        <label className="online-browser-search">
          <span>Search</span>
          <input
            type="search"
            aria-label={tab === "lobby" ? "Search lobby listings" : "Search public games"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "lobby" ? "Listing id or rules" : "Player or game id"}
          />
        </label>
      </section>

      <div className="online-browser-status-line" role="status" aria-live="polite">
        {tab === "lobby"
          ? seekStatus === "loading"
            ? "Loading lobby listings..."
            : seekStatus === "error"
              ? "Could not load lobby listings."
              : copyMessage || seekActionMessage || quickMatchMessage || terminalOwnedSeekMessage || (
                <>
                  {visibleOpenSeeks.length} lobby listings shown
                  {lastSeekCheckedAt ? <span aria-hidden="true">; last checked {lastSeekCheckedAt}</span> : null}
                </>
              )
          : status === "loading"
            ? "Loading public games..."
            : status === "error"
              ? "Could not load public games."
              : copyMessage ||
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
          <main className="online-browser-list" aria-label="Lobby listings">
            {onQuickMatch && (
              <section className="online-browser-quick-match-panel" aria-label="Quick match setup">
                <div className="online-browser-quick-match-copy">
                  <strong>Uses your exact current Play setup</strong>
                  <p>Choose board and clock on Play. Filters only search open listings here; Quick Match and Create Listing use your current setup.</p>
                </div>
                {quickMatchSetupSummary && (
                  <div className="online-browser-quick-match-summary" aria-label="Quick match setup summary">
                    <span>Radius {quickMatchSetupSummary.boardRadius}</span>
                    <span>{quickMatchSetupSummary.clock}</span>
                    <span>{quickMatchSetupSummary.scoring}</span>
                  </div>
                )}
              </section>
            )}
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
                    <span>Side {visibleOwnedSeekResponse.summary.creatorSeat}</span>
                    <span>{formatSeekClock(visibleOwnedSeekResponse.summary)}</span>
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
                        : copyMessage || `${lobbyLiveGames.length} public games in progress`}
                  </p>
                </div>
                <button
                  type="button"
                  className="online-browser-button subtle"
                  onClick={refreshGames}
                  disabled={status === "loading"}
                  aria-label="Refresh live public games"
                >
                  {status === "loading" ? "Refreshing..." : "Refresh live"}
                </button>
              </div>
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
            {visibleOpenSeeks.length === 0 && seekStatus === "ready" ? (
              <section className="online-browser-empty">
                <h2>{hasActiveSeekFilters ? "No lobby listings match these filters." : "No lobby listings yet."}</h2>
                <p>
                  {hasActiveSeekFilters
                    ? "Try a different side, clock, scoring, or search setting."
                    : "Use Quick Match to find a compatible listing, or create a public listing from your current Play setup."}
                </p>
              </section>
            ) : visibleOpenSeeks.map((seek) => {
              const owned = ownedSeekIds.includes(seek.seekId);
              const pendingAction = seekActionById[seek.seekId];
              const sideLabel = seek.creatorSeat;
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
                      <span>Side {sideLabel}</span>
                      <span>Board Radius {radius}</span>
                      <span>Clock {formatSeekClock(seek)}</span>
                      {seek.setup.gameRules?.vpModeEnabled && <span>Scoring Victory points</span>}
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
            })}
          </main>
        )
      ) : status === "error" ? (
        <button type="button" className="online-browser-button neutral" onClick={refreshGames}>
          Retry
        </button>
      ) : (
        <main className="online-browser-list" aria-label={tab === "watch" ? "Public live games" : "Public archived games"}>
          <>
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
