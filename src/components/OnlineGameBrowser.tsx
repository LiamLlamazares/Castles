import React from "react";
import {
  buildSpectatorUrl,
  copyOnlineInviteUrl,
  fetchOnlineGameSummaries,
  formatOnlineGameResult,
} from "../online/client";
import type { OnlineGameSummary, OnlineGameSummaryParticipant } from "../online/readModel";
import "../css/OnlineGameBrowser.css";

type OnlineBrowserTab = "watch" | "archive";

interface OnlineGameBrowserProps {
  loadGames?: () => Promise<OnlineGameSummary[]>;
  onBack: () => void;
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

const OnlineGameBrowser: React.FC<OnlineGameBrowserProps> = ({
  loadGames = fetchOnlineGameSummaries,
  onBack,
  onReplay,
  onSpectate,
  backLabel = "Back to game",
  initialTab = "watch",
}) => {
  const [tab, setTab] = React.useState<OnlineBrowserTab>(initialTab);
  const [games, setGames] = React.useState<OnlineGameSummary[]>([]);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [copyMessage, setCopyMessage] = React.useState("");

  const refreshGames = React.useCallback(async () => {
    setStatus("loading");
    setCopyMessage("");
    try {
      setGames(await loadGames());
      setStatus("ready");
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to load public games", error);
      setGames([]);
      setStatus("error");
    }
  }, [loadGames]);

  React.useEffect(() => {
    refreshGames();
  }, [refreshGames]);

  const publicGames = React.useMemo(
    () => games.filter((game) => game.visibility === "public"),
    [games]
  );

  const visibleGames = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return publicGames.filter((game) => {
      const tabMatches =
        tab === "watch"
          ? game.status === "active"
          : game.status === "complete" && game.archiveState === "archived";
      if (!tabMatches) return false;
      return !normalizedQuery || searchText(game).includes(normalizedQuery);
    });
  }, [publicGames, query, tab]);

  const activeCount = publicGames.filter((game) => game.status === "active").length;
  const archiveCount = publicGames.filter(
    (game) => game.status === "complete" && game.archiveState === "archived"
  ).length;
  const emptyTitle =
    tab === "watch" ? "No public live games yet." : "No public completed games yet.";

  const copySpectatorLink = async (gameId: string) => {
    try {
      await copyOnlineInviteUrl(buildSpectatorUrl(window.location.href, gameId));
      setCopyMessage("Spectator link copied.");
    } catch {
      setCopyMessage("Could not copy the spectator link.");
    }
  };

  return (
    <div className="online-browser-page">
      <header className="online-browser-header">
        <div>
          <div className="online-browser-kicker">Public games</div>
          <h1>Watch and Online Archive</h1>
          <p>
            Only games deliberately published for public viewing appear here; unlisted invite games are excluded.
          </p>
        </div>
        <button type="button" className="online-browser-button neutral" onClick={onBack}>
          {backLabel}
        </button>
      </header>

      <section className="online-browser-toolbar" aria-label="Online browser controls">
        <div className="online-browser-tabs" aria-label="Online game lists">
          <button
            type="button"
            aria-pressed={tab === "watch"}
            className={tab === "watch" ? "active" : ""}
            onClick={() => setTab("watch")}
          >
            Watch <span aria-hidden="true">{activeCount}</span>
          </button>
          <button
            type="button"
            aria-pressed={tab === "archive"}
            className={tab === "archive" ? "active" : ""}
            onClick={() => setTab("archive")}
          >
            Online Archive <span aria-hidden="true">{archiveCount}</span>
          </button>
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
            : copyMessage || `${visibleGames.length} public ${tab === "watch" ? "live" : "archived"} games`}
      </div>

      {status === "error" ? (
        <button type="button" className="online-browser-button neutral" onClick={refreshGames}>
          Retry
        </button>
      ) : (
        <main className="online-browser-list" aria-label={tab === "watch" ? "Public live games" : "Public archived games"}>
          {visibleGames.length === 0 && status === "ready" ? (
            <section className="online-browser-empty">
              <h2>{emptyTitle}</h2>
              <p>
                Private and unlisted games stay off this page. Shared spectator links still work for people who already have them.
              </p>
            </section>
          ) : (
            visibleGames.map((game) => {
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
                    <button
                      type="button"
                      className="online-browser-button neutral"
                      onClick={() => copySpectatorLink(game.gameId)}
                      aria-label={`Copy spectator link for ${game.gameId}`}
                    >
                      Copy Link
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </main>
      )}
    </div>
  );
};

export default OnlineGameBrowser;
