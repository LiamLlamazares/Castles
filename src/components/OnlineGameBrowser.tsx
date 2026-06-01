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
  onAcceptSeek,
  onCancelSeek,
  ownedSeekResponse,
  onRefreshOwnedSeek,
  onJoinOwnedSeek,
  ownedSeekIds = [],
  onReplay,
  onSpectate,
  backLabel = "Back to game",
  initialTab = "watch",
}) => {
  const [tab, setTab] = React.useState<OnlineBrowserTab>(initialTab);
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

  React.useEffect(() => {
    seekActionByIdRef.current = seekActionById;
  }, [seekActionById]);

  const directoryState = tab === "archive" ? "archived" : "active";

  React.useEffect(() => {
    if (tab === "watch" && resultFilter !== "all") {
      setResultFilter("all");
    }
  }, [resultFilter, tab]);

  const loadPage = React.useCallback(async (
    mode: "replace" | "append",
    cursor?: string
  ) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (mode === "replace") {
      setStatus("loading");
    } else {
      setIsLoadingMore(true);
    }
    setCopyMessage("");
    try {
      const response = await loadGames({
        state: directoryState,
        limit: 50,
        cursor,
      });
      if (requestIdRef.current !== requestId) return;
      setGames((current) => mode === "append" ? [...current, ...response.games] : response.games);
      setNextCursor(response.nextCursor);
      setStatus("ready");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      console.error("[OnlineGameBrowser] Failed to load public games", error);
      if (mode === "replace") {
        setGames([]);
        setNextCursor(undefined);
      }
      setStatus("error");
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoadingMore(false);
      }
    }
  }, [directoryState, loadGames]);

  const refreshGames = React.useCallback(() => {
    if (tab === "lobby") return;
    void loadPage("replace");
  }, [loadPage, tab]);

  const loadMoreGames = React.useCallback(() => {
    if (!nextCursor) return;
    void loadPage("append", nextCursor);
  }, [loadPage, nextCursor]);

  React.useEffect(() => {
    refreshGames();
  }, [refreshGames]);

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

  const runSeekAction = async (seekId: string, action: "accept" | "cancel") => {
    const handler = action === "accept" ? onAcceptSeek : onCancelSeek;
    if (!handler) return;
    setSeekActionById((current) => {
      const next = { ...current, [seekId]: action };
      seekActionByIdRef.current = next;
      return next;
    });
    setSeekActionMessage("");
    try {
      await handler(seekId);
      setSeekActionMessage(action === "accept" ? "Opening accepted game..." : "Open seek cancelled.");
      if (action === "cancel") {
        setOpenSeeks((current) => current.filter((seek) => seek.seekId !== seekId));
      }
    } catch (error) {
      console.error(`[OnlineGameBrowser] Failed to ${action} open seek`, error);
      setSeekActionMessage(action === "accept" ? "Could not accept that open seek." : "Could not cancel that open seek.");
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
      setSeekActionMessage("");
    }
    try {
      await onRefreshOwnedSeek();
      if (!background) {
        setSeekActionMessage("Your open seek was refreshed.");
      }
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to refresh owned open seek", error);
      if (isRateLimitError(error)) {
        seekAutoRefreshPausedUntilRef.current = Date.now() + LOBBY_RATE_LIMIT_BACKOFF_MS;
      }
      if (!background) {
        setSeekActionMessage("Could not refresh your open seek.");
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
    { id: "watch", label: "Watch" },
    ...(onOpenLibrary ? [{ id: "library" as const, label: "Library", onClick: onOpenLibrary }] : []),
  ];

  return (
    <div className="online-browser-page">
      <AppShellNav
        ariaLabel="Watch navigation"
        activeDestination="watch"
        title="Online Lobby"
        kicker="Public online"
        description="Create or accept open seeks, watch live public games, and replay completed public games."
        backLabel={backLabel}
        onBack={onBack}
        destinations={navDestinations}
      />

      <section className="online-browser-toolbar" aria-label="Online browser controls">
        <div className="online-browser-tabs" aria-label="Online game lists">
          <button
            type="button"
            aria-label="Open seek lobby"
            aria-pressed={tab === "lobby"}
            className={tab === "lobby" ? "active" : ""}
            onClick={() => setTab("lobby")}
          >
            Lobby
          </button>
          <button
            type="button"
            aria-label="Live public games"
            aria-pressed={tab === "watch"}
            className={tab === "watch" ? "active" : ""}
            onClick={() => setTab("watch")}
          >
            Watch
          </button>
          <button
            type="button"
            aria-pressed={tab === "archive"}
            className={tab === "archive" ? "active" : ""}
            onClick={() => setTab("archive")}
          >
            Online Archive
          </button>
        </div>
        {tab === "lobby" ? (
          <div className="online-browser-filter-grid">
            <label className="online-browser-select">
              <span>Side</span>
              <select
                aria-label="Open seek side filter"
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
                aria-label="Open seek clock filter"
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
                aria-label="Open seek victory points filter"
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
              disabled={seekStatus === "loading" || isSeekLoadInFlight}
              aria-label="Refresh open seeks"
            >
              {seekStatus === "loading" ? "Refreshing..." : "Refresh"}
            </button>
            {onCreateSeek && (
              <button
                type="button"
                className="online-browser-button primary online-browser-create-seek"
                onClick={onCreateSeek}
              >
                Create Open Seek
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
            aria-label={tab === "lobby" ? "Search open seeks" : "Search public games"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "lobby" ? "Seek id or rules" : "Player or game id"}
          />
        </label>
      </section>

      <div className="online-browser-status-line" role="status" aria-live="polite">
        {tab === "lobby"
          ? seekStatus === "loading"
            ? "Loading open seeks..."
            : seekStatus === "error"
              ? "Could not load open seeks."
              : seekActionMessage || (
                <>
                  {visibleOpenSeeks.length} open seeks shown
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
          <main className="online-browser-list" aria-label="Open seek lobby">
            {ownedSeekResponse?.summary && (
              <section
                className="online-seek-owner-panel"
                aria-label="Your open seek"
              >
                <div className="online-game-row-main">
                  <div className="online-game-players">
                    <strong>Your open seek</strong>
                    <span>{ownedSeekResponse.summary.seekId}</span>
                  </div>
                  <div className="online-game-meta">
                    <span className={`online-game-pill ${ownedSeekResponse.summary.status}`}>
                      {formatSeekStatus(ownedSeekResponse.summary.status)}
                    </span>
                    <span>Side {ownedSeekResponse.summary.creatorSeat}</span>
                    <span>{formatSeekClock(ownedSeekResponse.summary)}</span>
                    <span>Expires {formatSeekExpiresAt(ownedSeekResponse.summary.expiresAt)}</span>
                  </div>
                </div>
                <div className="online-game-actions">
                  <button
                    type="button"
                    className="online-browser-button neutral"
                    onClick={() => void runOwnedSeekRefresh()}
                    disabled={!onRefreshOwnedSeek || ownedSeekAction !== undefined}
                    aria-label="Refresh your open seek"
                  >
                    {ownedSeekAction === "refresh" ? "Refreshing..." : "Refresh"}
                  </button>
                  {ownedSeekResponse.summary.status === "open" && (
                    <button
                      type="button"
                      className="online-browser-button neutral"
                      onClick={() => void runSeekAction(ownedSeekResponse.summary.seekId, "cancel")}
                      disabled={!onCancelSeek || seekActionById[ownedSeekResponse.summary.seekId] !== undefined}
                      aria-label="Cancel your open seek"
                    >
                      {seekActionById[ownedSeekResponse.summary.seekId] === "cancel" ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                  {ownedSeekResponse.summary.status === "accepted" && ownedSeekResponse.gameInvite && (
                    <button
                      type="button"
                      className="online-browser-button primary"
                      onClick={runOwnedSeekJoin}
                      disabled={!onJoinOwnedSeek || ownedSeekAction !== undefined}
                      aria-label="Join accepted game"
                    >
                      {ownedSeekAction === "join" ? "Joining..." : "Join Game"}
                    </button>
                  )}
                </div>
              </section>
            )}
            {visibleOpenSeeks.length === 0 && seekStatus === "ready" ? (
              <section className="online-browser-empty">
                <h2>{hasActiveSeekFilters ? "No open seeks match these filters." : "No open seeks yet."}</h2>
                <p>
                  {hasActiveSeekFilters
                    ? "Try a different side, clock, scoring, or search setting."
                    : "Create a public seek from Play, or check again after someone creates one."}
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
                  aria-label={`Open seek ${seek.seekId}`}
                >
                  <div className="online-game-row-main">
                    <div className="online-game-players">
                      <strong>Open seek</strong>
                      <span>{seek.seekId}</span>
                    </div>
                    <div className="online-game-meta">
                      <span className="online-game-pill active">Open</span>
                      <span>Side {sideLabel}</span>
                      <span>Radius {radius}</span>
                      <span>{formatSeekClock(seek)}</span>
                      {seek.setup.gameRules?.vpModeEnabled && <span>Victory points</span>}
                      <span>Expires {formatSeekExpiresAt(seek.expiresAt)}</span>
                    </div>
                  </div>
                  <div className="online-game-actions">
                    {owned ? (
                      <button
                        type="button"
                        className="online-browser-button neutral"
                        onClick={() => void runSeekAction(seek.seekId, "cancel")}
                        disabled={!onCancelSeek || pendingAction !== undefined}
                        aria-label={`Cancel open seek ${seek.seekId}`}
                      >
                        {pendingAction === "cancel" ? "Cancelling..." : "Cancel"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="online-browser-button primary"
                        onClick={() => void runSeekAction(seek.seekId, "accept")}
                        disabled={!onAcceptSeek || pendingAction !== undefined}
                        aria-label={`Accept open seek ${seek.seekId}`}
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
            ) : visibleGames.map((game) => {
              const white = participantName(game.participants, "w");
              const black = participantName(game.participants, "b");
              const resultLabel = game.result ? formatOnlineGameResult(game.result) : null;
              const isArchivedGame = tab === "archive" && game.status === "complete" && game.archiveState === "archived";
              const primaryActionLabel = isArchivedGame ? "Analyze Replay" : "Spectate";
              const primaryActionAriaLabel = isArchivedGame
                ? `Analyze replay ${white} vs ${black}, ${game.gameId}`
                : `Spectate ${white} vs ${black}, ${game.gameId}`;
              return (
                <article
                  key={game.gameId}
                  className="online-game-row"
                  aria-label={`${white} vs ${black} ${game.gameId}`}
                >
                  <div className="online-game-row-main">
                    <div className="online-game-players">
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
                        className="online-browser-button neutral"
                        onClick={() => copySpectatorLink(game.gameId)}
                        aria-label={`Copy spectator link for ${game.gameId}`}
                      >
                        Copy Link
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
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
