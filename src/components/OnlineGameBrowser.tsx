import React from "react";
import AppShellNav, { AppShellDestination } from "./AppShellNav";
import {
  buildSpectatorUrl,
  copyOnlineInviteUrl,
  fetchOnlineGameDirectory,
  formatOnlineGameResult,
  type FetchOnlineGameSummariesOptions,
} from "../online/client";
import type {
  OnlineGameDirectoryResponse,
  OnlineGameSummary,
  OnlineGameSummaryParticipant,
} from "../online/readModel";
import "../css/OnlineGameBrowser.css";

type OnlineBrowserTab = "watch" | "archive";
type OnlineBrowserSort = "newest" | "moves";
type OnlineBrowserTimeFilter = "all" | "timed" | "casual";
type OnlineBrowserResultFilter =
  | "all"
  | "white"
  | "black"
  | "resignation"
  | "timeout"
  | "castle_control"
  | "victory_points"
  | "monarch_captured";

interface OnlineGameBrowserProps {
  loadGames?: (options?: FetchOnlineGameSummariesOptions) => Promise<OnlineGameDirectoryResponse>;
  onBack: () => void;
  onOpenGame?: () => void;
  onTutorial?: () => void;
  onOpenLibrary?: () => void;
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

const OnlineGameBrowser: React.FC<OnlineGameBrowserProps> = ({
  loadGames = fetchOnlineGameDirectory,
  onBack,
  onOpenGame,
  onTutorial,
  onOpenLibrary,
  onReplay,
  onSpectate,
  backLabel = "Back to game",
  initialTab = "watch",
}) => {
  const [tab, setTab] = React.useState<OnlineBrowserTab>(initialTab);
  const [games, setGames] = React.useState<OnlineGameSummary[]>([]);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<OnlineBrowserSort>("newest");
  const [timeFilter, setTimeFilter] = React.useState<OnlineBrowserTimeFilter>("all");
  const [resultFilter, setResultFilter] = React.useState<OnlineBrowserResultFilter>("all");
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>();
  const [copyMessage, setCopyMessage] = React.useState("");
  const requestIdRef = React.useRef(0);

  const directoryState = tab === "watch" ? "active" : "archived";

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
    void loadPage("replace");
  }, [loadPage]);

  const loadMoreGames = React.useCallback(() => {
    if (!nextCursor) return;
    void loadPage("append", nextCursor);
  }, [loadPage, nextCursor]);

  React.useEffect(() => {
    refreshGames();
  }, [refreshGames]);

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

  const emptyTitle =
    tab === "watch" ? "No public live games yet." : "No public completed games yet.";
  const hasActiveFilters =
    query.trim() !== "" || timeFilter !== "all" || (tab === "archive" && resultFilter !== "all");

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
    ...(onOpenLibrary ? [{ id: "library" as const, label: "Library", onClick: onOpenLibrary }] : []),
    { id: "watch", label: "Watch" },
  ];

  return (
    <div className="online-browser-page">
      <AppShellNav
        ariaLabel="Watch navigation"
        activeDestination="watch"
        title="Watch and Online Archive"
        kicker="Public games"
        description="Only games deliberately published for public viewing appear here; unlisted invite games are excluded."
        backLabel={backLabel}
        onBack={onBack}
        destinations={navDestinations}
      />

      <section className="online-browser-toolbar" aria-label="Online browser controls">
        <div className="online-browser-tabs" aria-label="Online game lists">
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
        <label className="online-browser-search">
          <span>Search</span>
          <input
            type="search"
            aria-label="Search public games"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Player or game id"
          />
        </label>
      </section>

      <div className="online-browser-status-line" role="status" aria-live="polite">
        {status === "loading"
          ? "Loading public games..."
          : status === "error"
            ? "Could not load public games."
            : copyMessage ||
              `${visibleGames.length} public ${tab === "watch" ? "live" : "archived"} games shown${nextCursor ? "; more available" : ""}`}
      </div>

      {status === "error" ? (
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
