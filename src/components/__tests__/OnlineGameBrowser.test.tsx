import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnlineGameBrowser from "../OnlineGameBrowser";
import {
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
  type OnlineGameDirectoryResponse,
  type OnlineGameSummary,
} from "../../online/readModel";
import {
  ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
  ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
  type OpenSeekDirectoryResponse,
  type OpenSeekSummary,
} from "../../online/seeks";
import { PieceType } from "../../Constants";
import { ONLINE_RULESET_VERSION } from "../../online/events";

function summary(overrides: Partial<OnlineGameSummary> = {}): OnlineGameSummary {
  const gameId = overrides.gameId ?? "game_public_active";
  const hasTimeControl = overrides.hasTimeControl ?? true;
  return {
    schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
    gameId,
    rulesetVersion: ONLINE_RULESET_VERSION,
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:03:00.000Z",
    version: 3,
    status: "active",
    visibility: "public",
    archiveState: "active",
    hasTimeControl: true,
    participants: [
      { seat: "w", role: "white", identity: { kind: "registered", id: `${gameId}_w`, displayName: "Ada" } },
      { seat: "b", role: "black", identity: { kind: "registered", id: `${gameId}_b`, displayName: "Ben" } },
    ],
    livePreview: {
      sideToMove: "b",
      turnPhase: "Attack",
      moveCount: overrides.version ?? 3,
      lastMove: {
        notation: "G13G12",
        turnNumber: 1,
        color: "w",
        phase: "Movement",
      },
      boardPreview: {
        radius: 6,
        pieces: [
          { q: 0, r: 6, s: -6, color: "w", type: PieceType.Monarch },
          { q: 0, r: -6, s: 6, color: "b", type: PieceType.Monarch },
          { q: -1, r: 5, s: -4, color: "w", type: PieceType.Swordsman },
          { q: 1, r: -5, s: 4, color: "b", type: PieceType.Archer },
        ],
        castles: [
          { q: 0, r: 6, s: -6, owner: "w" },
          { q: 0, r: -6, s: 6, owner: "b" },
        ],
      },
      ...(hasTimeControl
        ? {
            clock: {
              timeControl: { initialMs: 1_200_000, incrementMs: 20_000 },
              remainingMs: { w: 1_198_000, b: 1_200_000 },
              activeColor: "b" as const,
              runningSince: 2_000,
              serverNow: 5_000,
            },
          }
        : {}),
    },
    lastEventId: `${gameId}_evt`,
    ...overrides,
  };
}

function directory(
  games: OnlineGameSummary[],
  nextCursor?: string
): OnlineGameDirectoryResponse {
  return {
    schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
    games,
    nextCursor,
  };
}

function openSeek(overrides: Partial<OpenSeekSummary> = {}): OpenSeekSummary {
  const seekId = overrides.seekId ?? "seek_public_open";
  return {
    schemaVersion: ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
    seekId,
    creatorIdentity: { kind: "session", id: `${seekId}_creator` },
    creatorSeat: "random",
    setup: {
      board: { config: { nSquares: 7 }, castles: [] },
      pieces: [],
      sanctuaries: [],
      timeControl: { initial: 20, increment: 20 },
      gameRules: { vpModeEnabled: true },
      initialPoolTypes: [],
    },
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-01T12:10:00.000Z",
    status: "open",
    lastEventId: `${seekId}_evt`,
    ...overrides,
  };
}

function seekDirectory(
  seeks: OpenSeekSummary[],
  nextCursor?: string
): OpenSeekDirectoryResponse {
  return {
    schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
    seeks,
    nextCursor,
  };
}

function deferredDirectory() {
  let resolve!: (value: OnlineGameDirectoryResponse) => void;
  const promise = new Promise<OnlineGameDirectoryResponse>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function deferredSeekDirectory() {
  let resolve!: (value: OpenSeekDirectoryResponse) => void;
  const promise = new Promise<OpenSeekDirectoryResponse>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("OnlineGameBrowser", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports tab changes without losing a controlled active tab", async () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <OnlineGameBrowser
        activeTab="lobby"
        onTabChange={onTabChange}
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Lobby games" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    expect(onTabChange).toHaveBeenCalledWith("archive");
    expect(screen.getByRole("button", { name: "Lobby games" })).toHaveAttribute("aria-pressed", "true");

    rerender(
      <OnlineGameBrowser
        activeTab="archive"
        onTabChange={onTabChange}
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Online Archive" })).toHaveAttribute("aria-pressed", "true");
  });

  it("creates an online account from the Online page account panel", async () => {
    const onCreateAccount = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onCreateAccount={onCreateAccount}
      />
    );

    await screen.findByText("No lobby listings yet.");
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Liam" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => expect(onCreateAccount).toHaveBeenCalledWith("Liam"));
    expect(await screen.findByText("Online account created.")).toBeInTheDocument();
  });

  it("shows signed-in account archive games without duplicating public archive rows", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_liam",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_liam", displayName: "Liam" },
    };
    const publicArchive = summary({
      gameId: "game_public_archive",
      status: "complete",
      archiveState: "archived",
      visibility: "public",
    });
    const accountArchive = summary({
      gameId: "game_private_account_archive",
      status: "complete",
      archiveState: "archived",
      visibility: "unlisted",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b" } },
      ],
    });
    const activeAccount = summary({
      gameId: "game_active_account",
      status: "active",
      archiveState: "active",
      visibility: "private",
      participants: [
        { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_w" } },
        { seat: "b", role: "black", identity: account.identity },
      ],
    });
    const loadAccountGames = vi.fn().mockResolvedValue(directory([activeAccount, accountArchive, publicArchive]));
    const onReturnToAccountGame = vi.fn();

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([publicArchive]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={loadAccountGames}
        resolveAccountGameJoin={(game, seat) =>
          game.gameId === "game_active_account" && seat === "b"
            ? { gameId: game.gameId, seat, token: "black-token" }
            : null
        }
        onReturnToAccountGame={onReturnToAccountGame}
        recentOnlineGames={[
          {
            gameId: "game_private_account_archive",
            role: "player",
            seat: "w",
            status: "complete",
            lastSeenAt: "2026-06-03T13:00:00.000Z",
          },
          {
            gameId: "game_device_only_archive",
            role: "spectator",
            status: "complete",
            lastSeenAt: "2026-06-03T13:05:00.000Z",
          },
        ]}
      />
    );

    const accountGames = await screen.findByRole("region", { name: "Your account games" });
    const activeGames = await screen.findByRole("region", { name: "Active account games" });
    const completedGames = await screen.findByRole("region", { name: "Completed account games" });
    const recentGames = await screen.findByRole("region", { name: "Recent online games on this device" });
    expect(loadAccountGames).toHaveBeenCalledWith({ state: "all", limit: 50 });
    expect(within(activeGames).getByText("game_active_account")).toBeInTheDocument();
    expect(within(activeGames).getByText("Your seat Black")).toBeInTheDocument();
    fireEvent.click(
      within(activeGames).getByRole("button", {
        name: "Return to account game White vs Liam, game_active_account",
      })
    );
    expect(onReturnToAccountGame).toHaveBeenCalledWith({
      gameId: "game_active_account",
      seat: "b",
      token: "black-token",
    }, "private");
    expect(within(completedGames).getByText("game_private_account_archive")).toBeInTheDocument();
    expect(within(accountGames).queryByText("game_public_archive")).not.toBeInTheDocument();
    expect(within(recentGames).getByText("game_device_only_archive")).toBeInTheDocument();
    expect(within(recentGames).queryByText("game_private_account_archive")).not.toBeInTheDocument();
    expect(screen.getByText("game_public_archive")).toBeInTheDocument();

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 active account game, 1 account replay, 1 public replay, 1 device replay shown"
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "does-not-match" },
    });
    await waitFor(() => {
      expect(within(accountGames).getByText("No account games match these filters.")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
    });
  });

  it("does not show device replay fallback while signed-in account archive is still loading", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_loading",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_loading", displayName: "Liam" },
    };
    const accountGames = deferredDirectory();

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockReturnValue(accountGames.promise)}
        recentOnlineGames={[
          {
            gameId: "game_device_only_waits",
            role: "player",
            seat: "b",
            status: "complete",
            lastSeenAt: "2026-06-03T13:00:00.000Z",
          },
        ]}
      />
    );

    expect(await screen.findByText("Loading account games...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("account games loading, 0 public replays shown");
    expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();

    await act(async () => {
      accountGames.resolve(directory([]));
      await Promise.resolve();
    });

    expect(await screen.findByRole("region", { name: "Recent online games on this device" })).toHaveTextContent(
      "game_device_only_waits"
    );
  });

  it("falls back safely when active account games do not have a local player token", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_active_fallback",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_active_fallback", displayName: "Liam" },
    };
    const onSpectate = vi.fn();
    const publicActive = summary({
      gameId: "game_public_active_account",
      status: "active",
      archiveState: "active",
      visibility: "unlisted",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b" } },
      ],
    });
    const privateActive = summary({
      gameId: "game_private_active_account",
      status: "active",
      archiveState: "active",
      visibility: "private",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b_private" } },
      ],
    });

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockResolvedValue(directory([publicActive, privateActive]))}
        resolveAccountGameJoin={vi.fn().mockReturnValue(null)}
      />
    );

    const activeGames = await screen.findByRole("region", { name: "Active account games" });
    expect(activeGames).toHaveTextContent("game_public_active_account");
    expect(activeGames).toHaveTextContent("game_private_active_account");
    expect(activeGames).toHaveTextContent("Player token not in this browser session");
    fireEvent.click(
      within(activeGames).getByRole("button", {
        name: "Spectate account game Liam vs Black, game_public_active_account",
      })
    );
    expect(onSpectate).toHaveBeenCalledWith("game_public_active_account");
    expect(activeGames).toHaveTextContent("Open from original browser session or invite link");
    expect(
      within(activeGames).queryByRole("button", {
        name: "Spectate account game Liam vs Black, game_private_active_account",
      })
    ).not.toBeInTheDocument();
  });

  it("offers account rejoin for active account games without a local player token", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_active_rejoin",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_active_rejoin", displayName: "Liam" },
    };
    const activeAccount = summary({
      gameId: "game_active_account_rejoin",
      status: "active",
      archiveState: "active",
      visibility: "private",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b" } },
      ],
    });
    const onRejoinAccountGame = vi.fn();

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockResolvedValue(directory([activeAccount]))}
        resolveAccountGameJoin={vi.fn().mockReturnValue(null)}
        onRejoinAccountGame={onRejoinAccountGame}
      />
    );

    const activeGames = await screen.findByRole("region", { name: "Active account games" });
    fireEvent.click(
      within(activeGames).getByRole("button", {
        name: "Rejoin account game Liam vs Black, game_active_account_rejoin",
      })
    );

    expect(onRejoinAccountGame).toHaveBeenCalledWith(activeAccount);
    expect(within(activeGames).queryByText("Open from original browser session or invite link")).not.toBeInTheDocument();
  });

  it("reports account archive errors without falling back to possibly duplicated device rows", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_error",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_error", displayName: "Liam" },
    };

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockRejectedValue(new Error("offline"))}
        recentOnlineGames={[
          {
            gameId: "game_device_only_account_error",
            role: "player",
            seat: "w",
            status: "complete",
            lastSeenAt: "2026-06-03T13:00:00.000Z",
          },
        ]}
      />
    );

    expect(await screen.findByText("Account games are unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("account games unavailable, 0 public replays shown");
    expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
  });

  it("loads lobby listings and public live games in the Lobby tab", async () => {
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([openSeek()]));
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({ gameId: "game_lobby_live", version: 8 }),
    ]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={loadGames}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: /Lobby listing seek_public_open/i });

    expect(loadOpenSeeks).toHaveBeenCalledWith({ state: "open", limit: 50 });
    expect(loadGames).toHaveBeenCalledWith({ state: "active", limit: 50, cursor: undefined });
    expect(row).toHaveTextContent("Creator side Random");
    expect(row).toHaveTextContent("Radius 7");
    expect(row).toHaveTextContent("Timed 20+20");
    expect(row).toHaveTextContent("Scoring Victory points");
    expect(within(row).getByRole("button", { name: "Accept lobby listing seek_public_open" })).toBeInTheDocument();
    const currentGames = screen.getByRole("region", { name: "Current public games" });
    const liveOverview = within(currentGames).getByRole("group", { name: "Lobby live games overview" });
    expect(liveOverview).toHaveTextContent("1 public live game");
    expect(liveOverview).toHaveTextContent("Most moves");
    expect(liveOverview).toHaveTextContent("Ada vs Ben, 8 moves");
    expect(liveOverview).toHaveTextContent("Public only");
    expect(within(currentGames).getByText("game_lobby_live")).toBeInTheDocument();
    expect(within(currentGames).getByRole("button", { name: "Spectate Ada vs Ben, game_lobby_live" })).toBeInTheDocument();
    expect(within(currentGames).getByRole("button", { name: "Open Watch tab" })).toBeInTheDocument();
    expect(within(currentGames).getByRole("button", { name: "Refresh live public games" })).toHaveTextContent("Refresh live games");
  });

  it("shows server-backed spectator counts for live public games", async () => {
    const watchedGame = summary({ gameId: "game_watched_live", version: 12 });
    watchedGame.livePreview = {
      ...watchedGame.livePreview,
      spectatorCount: 3,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([watchedGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const watch = await screen.findByRole("article", {
      name: /Most active live game Ada vs Ben game_watched_live/i,
    });

    expect(watch).toHaveTextContent("3 watching");
  });

  it("can scan Watch by current spectator count without claiming a global ranking", async () => {
    const manyMoves = summary({
      gameId: "game_many_moves_fewer_watchers",
      version: 14,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "mara_w", displayName: "Mara" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "noor_b", displayName: "Noor" } },
      ],
    });
    manyMoves.livePreview = {
      ...manyMoves.livePreview,
      spectatorCount: 1,
    };
    const mostWatched = summary({
      gameId: "game_most_watched_now",
      version: 4,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "iris_w", displayName: "Iris" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "jules_b", displayName: "Jules" } },
      ],
    });
    mostWatched.livePreview = {
      ...mostWatched.livePreview,
      spectatorCount: 6,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([manyMoves, mostWatched]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_many_moves_fewer_watchers");

    expect(screen.getByRole("region", { name: "Most active public live game" })).toHaveTextContent(
      "game_many_moves_fewer_watchers"
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "watchers" },
    });

    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    const featuredRegion = screen.getByRole("region", {
      name: "Most watched public live game in current list",
    });
    expect(liveOverview).toHaveTextContent("Most watched in current list");
    expect(liveOverview).toHaveTextContent("Iris vs Jules, 6 watching, 4 moves");
    expect(featuredRegion).toHaveTextContent("Most watched in current list");
    expect(featuredRegion).toHaveTextContent("Current-list watcher leader");
    expect(featuredRegion).toHaveTextContent("game_most_watched_now");
    expect(featuredRegion).toHaveTextContent("6 watching");
  });

  it("falls back to the most-moves Watch model when watcher counts are missing", async () => {
    const manyMoves = summary({
      gameId: "game_many_moves_no_watchers",
      version: 14,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "mara_w", displayName: "Mara" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "noor_b", displayName: "Noor" } },
      ],
    });
    const fewerMoves = summary({
      gameId: "game_fewer_moves_zero_watchers",
      version: 4,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "iris_w", displayName: "Iris" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "jules_b", displayName: "Jules" } },
      ],
    });
    fewerMoves.livePreview = {
      ...fewerMoves.livePreview,
      spectatorCount: 0,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([fewerMoves, manyMoves]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_many_moves_no_watchers");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "watchers" },
    });

    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    const featuredRegion = screen.getByRole("region", { name: "Most active public live game" });
    expect(liveOverview).toHaveTextContent("Most moves");
    expect(liveOverview).toHaveTextContent("Mara vs Noor, 14 moves");
    expect(featuredRegion).toHaveTextContent("Most active live game");
    expect(featuredRegion).toHaveTextContent("Most moves in current list");
    expect(featuredRegion).toHaveTextContent("game_many_moves_no_watchers");
    expect(featuredRegion).not.toHaveTextContent("watching");
  });

  it("orders Watch rows by watcher count before move-count fallback", async () => {
    const mostWatched = summary({
      gameId: "game_six_watchers",
      version: 4,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "iris_w", displayName: "Iris" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "jules_b", displayName: "Jules" } },
      ],
    });
    mostWatched.livePreview = {
      ...mostWatched.livePreview,
      spectatorCount: 6,
    };
    const fewerMovesMoreWatchers = summary({
      gameId: "game_three_watchers_two_moves",
      version: 2,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "kara_w", displayName: "Kara" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "luz_b", displayName: "Luz" } },
      ],
    });
    fewerMovesMoreWatchers.livePreview = {
      ...fewerMovesMoreWatchers.livePreview,
      spectatorCount: 3,
    };
    const tiedWatchersMoreMoves = summary({
      gameId: "game_two_watchers_twenty_moves",
      version: 20,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "mara_w", displayName: "Mara" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "noor_b", displayName: "Noor" } },
      ],
    });
    tiedWatchersMoreMoves.livePreview = {
      ...tiedWatchersMoreMoves.livePreview,
      spectatorCount: 2,
    };
    const tiedWatchersFewerMoves = summary({
      gameId: "game_two_watchers_nine_moves",
      version: 9,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "opal_w", displayName: "Opal" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "paz_b", displayName: "Paz" } },
      ],
    });
    tiedWatchersFewerMoves.livePreview = {
      ...tiedWatchersFewerMoves.livePreview,
      spectatorCount: 2,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          tiedWatchersFewerMoves,
          tiedWatchersMoreMoves,
          fewerMovesMoreWatchers,
          mostWatched,
        ]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_six_watchers");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "watchers" },
    });

    const spectateLabels = screen
      .getAllByRole("button", { name: /^Spectate / })
      .map((button) => button.getAttribute("aria-label"));
    expect(spectateLabels).toEqual([
      "Spectate Iris vs Jules, game_six_watchers",
      "Spectate Kara vs Luz, game_three_watchers_two_moves",
      "Spectate Mara vs Noor, game_two_watchers_twenty_moves",
      "Spectate Opal vs Paz, game_two_watchers_nine_moves",
    ]);
  });

  it("counts all public live games even when the Lobby preview is capped", async () => {
    const liveGames = Array.from({ length: 6 }, (_, index) =>
      summary({ gameId: `game_lobby_live_${index + 1}`, version: index + 1 })
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory(liveGames))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const currentGames = await screen.findByRole("region", { name: "Current public games" });
    const liveOverview = within(currentGames).getByRole("group", { name: "Lobby live games overview" });
    expect(within(currentGames).getByText("6 public games in progress")).toBeInTheDocument();
    expect(liveOverview).toHaveTextContent("6 public live games");
    expect(liveOverview).toHaveTextContent("Ada vs Ben, 6 moves");
    expect(within(currentGames).getByText("game_lobby_live_6")).toBeInTheDocument();
    expect(within(currentGames).queryByText("game_lobby_live_1")).not.toBeInTheDocument();
  });

  it("keeps listing filters adjacent to open listings even when live games exist", async () => {
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_before_filter" })]))
      .mockResolvedValue(seekDirectory([]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_live_below_listings", version: 10 }),
        ]))}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_before_filter");
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby creator side filter" }), {
      target: { value: "w" },
    });

    expect(await screen.findByText("No lobby listings match these filters.")).toBeInTheDocument();
    expect(screen.getByText("game_live_below_listings")).toBeInTheDocument();
    const listings = screen.getByRole("region", { name: "Open lobby listings" });
    const currentGames = screen.getByRole("region", { name: "Current public games" });
    expect(Boolean(listings.compareDocumentPosition(currentGames) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("renders and searches Castle-control listings explicitly", async () => {
    const castleControlSeek = openSeek({ seekId: "seek_castle_control" });
    castleControlSeek.setup.gameRules = { vpModeEnabled: false };
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([castleControlSeek]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: /Lobby listing seek_castle_control/i });
    expect(row).toHaveTextContent("Scoring Castle control");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "castle control" },
    });

    expect(screen.getByRole("article", { name: /Lobby listing seek_castle_control/i })).toBeInTheDocument();
  });

  it("explains fixed creator-side listings from the acceptor's point of view", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_creator_white", creatorSeat: "w" }),
          openSeek({ seekId: "seek_creator_black", creatorSeat: "b" }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("seek_creator_white")).toBeInTheDocument();
    expect(screen.getByText("Creator plays White; you play Black")).toBeInTheDocument();
    expect(screen.getByText("Creator plays Black; you play White")).toBeInTheDocument();
  });

  it("searches lobby listings by visible creator side and clock labels", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_creator_white_timed", creatorSeat: "w" }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("seek_creator_white_timed")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "creator plays white" },
    });

    expect(screen.getByRole("article", { name: /Lobby listing seek_creator_white_timed/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "timed" },
    });

    expect(screen.getByRole("article", { name: /Lobby listing seek_creator_white_timed/i })).toBeInTheDocument();
  });

  it("does not send Lobby listing search to current public game requests", async () => {
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({ gameId: "game_lobby_current" }),
    ]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={loadGames}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_creator_white_timed", creatorSeat: "w" }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("game_lobby_current")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "creator plays white" },
    });

    expect(loadGames.mock.calls.every(([options]) => options && !("query" in options))).toBe(true);
  });

  it("bounds public game search length without limiting Lobby listing search", async () => {
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("searchbox", { name: "Search lobby listings" })).not.toHaveAttribute("maxLength");

    rerender(
      <OnlineGameBrowser
        activeTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("searchbox", { name: "Search live public games" })).toHaveAttribute("maxLength", "80");
  });

  it("opens the Watch tab from the Lobby current-games section", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_lobby_watch_handoff", version: 8 }),
        ]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const currentGames = await screen.findByRole("region", { name: "Current public games" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "not-this-live-game" },
    });
    fireEvent.click(within(currentGames).getByRole("button", { name: "Open Watch tab" }));

    expect(screen.getByRole("button", { name: "Live public games" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox", { name: "Search live public games" })).toHaveValue("");
    expect(screen.getByRole("region", { name: "Most active public live game" })).toHaveTextContent("game_lobby_watch_handoff");
  });

  it("auto-refreshes current public games while the Lobby tab is visible", async () => {
    vi.useFakeTimers();
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_auto_live" })]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={loadGames}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("No public games in progress.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("game_auto_live")).toBeInTheDocument();
    expect(loadGames).toHaveBeenCalledTimes(2);
  });

  it("announces copied spectator links from Lobby current games", async () => {
    const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      render(
        <OnlineGameBrowser
          initialTab="lobby"
          loadGames={vi.fn().mockResolvedValue(directory([
            summary({ gameId: "game_copy_live" }),
          ]))}
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
        />
      );

      const currentGames = await screen.findByRole("region", { name: "Current public games" });
      fireEvent.click(within(currentGames).getByRole("button", { name: "Copy spectator link for game_copy_live" }));

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Spectator link copied.");
      });
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("onlineGame=game_copy_live"));
    } finally {
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });

  it("runs quick match from the lobby with exact setup copy and pending controls", async () => {
    let resolveQuickMatch!: () => void;
    const quickMatchPromise = new Promise<"waiting">((resolve) => {
      resolveQuickMatch = () => resolve("waiting");
    });
    const onQuickMatch = vi.fn().mockReturnValue(quickMatchPromise);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([openSeek()]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCreateSeek={vi.fn()}
        onQuickMatch={onQuickMatch}
        quickMatchSetupSummary={{
          boardRadius: 7,
          clock: "Timed 20+20",
          scoring: "Victory points",
        }}
      />
    );

    await screen.findByText("seek_public_open");
    expect(screen.getByRole("region", { name: "Play from current setup" })).toBeInTheDocument();
    expect(screen.getByText("Try open listings with your current Play setup")).toBeInTheDocument();
    const setupSummary = screen.getByLabelText("Quick match setup summary");
    expect(within(setupSummary).getByText("Radius 7")).toBeInTheDocument();
    expect(within(setupSummary).getByText("Timed 20+20")).toBeInTheDocument();
    expect(within(setupSummary).getByText("Victory points")).toBeInTheDocument();
    expect(screen.getByText(/Quick Match tries open listings for this setup, then lists yours/i))
      .toBeInTheDocument();

    const quickMatch = screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    });
    fireEvent.click(quickMatch);

    expect(onQuickMatch).toHaveBeenCalledOnce();
    expect(quickMatch).toBeDisabled();
    const createListing = screen.getByRole("button", { name: "Create public lobby listing from current Play setup" });
    expect(createListing).toHaveTextContent("Create Lobby Listing");
    expect(createListing).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Checking open lobby listings");

    await act(async () => {
      resolveQuickMatch();
      await quickMatchPromise;
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/setup is listed in the Lobby/i);
  });

  it("lists the current setup from the lobby without allowing duplicate clicks", async () => {
    let resolveCreate!: () => void;
    const createPromise = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });
    const onCreateSeek = vi.fn().mockReturnValue(createPromise);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onCreateSeek={onCreateSeek}
      />
    );

    await screen.findByText("No lobby listings yet.");
    const listButton = screen.getByRole("button", { name: "Create public lobby listing from current Play setup" });
    expect(listButton).toHaveTextContent("Create Lobby Listing");

    fireEvent.click(listButton);
    fireEvent.click(listButton);

    expect(onCreateSeek).toHaveBeenCalledOnce();
    expect(listButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Creating lobby listing from current setup...");

    await act(async () => {
      resolveCreate();
      await createPromise;
    });

    expect(listButton).not.toBeDisabled();
  });

  it("keeps conflicting lobby actions disabled after a matched quick match result", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([openSeek()]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCreateSeek={vi.fn()}
        onQuickMatch={vi.fn().mockResolvedValue("matched")}
      />
    );

    await screen.findByText("seek_public_open");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    }));

    expect(await screen.findByRole("status")).toHaveTextContent("Match found. Opening game...");
    expect(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create public lobby listing from current Play setup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh lobby listings" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept lobby listing seek_public_open" })).toBeDisabled();
  });

  it("starts quick match from the keyboard and moves focus to the owned seek after waiting", async () => {
    const user = userEvent.setup();
    const waitingSeek = openSeek({ seekId: "seek_keyboard_waiting" });

    function Harness() {
      const [ownedSeekResponse, setOwnedSeekResponse] = React.useState<{
        role: "creator";
        summary: OpenSeekSummary;
      } | null>(null);
      return (
        <OnlineGameBrowser
          initialTab="lobby"
          loadGames={vi.fn()}
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
          onAcceptSeek={vi.fn()}
          onCreateSeek={vi.fn()}
          ownedSeekIds={ownedSeekResponse ? [ownedSeekResponse.summary.seekId] : []}
          ownedSeekResponse={ownedSeekResponse}
          onQuickMatch={async (): Promise<"waiting"> => {
            setOwnedSeekResponse({ role: "creator", summary: waitingSeek });
            return "waiting";
          }}
        />
      );
    }

    render(<Harness />);

    await screen.findByText("No lobby listings yet.");
    const quickMatch = screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    });
    quickMatch.focus();
    await user.keyboard("{Enter}");

    const ownerPanel = await screen.findByRole("region", { name: "Your lobby listing" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "No open listing for this setup found. Your setup is listed in the Lobby for someone to accept."
    );
    expect(ownerPanel).toHaveFocus();
  });

  it("announces owned-seek actions after a waiting quick match", async () => {
    const waitingSeek = openSeek({ seekId: "seek_waiting_cancel" });

    function Harness() {
      const [ownedSeekResponse, setOwnedSeekResponse] = React.useState<{
        role: "creator";
        summary: OpenSeekSummary;
      } | null>(null);
      return (
        <OnlineGameBrowser
          initialTab="lobby"
          loadGames={vi.fn()}
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
          onAcceptSeek={vi.fn()}
          onCancelSeek={async () => setOwnedSeekResponse(null)}
          ownedSeekIds={ownedSeekResponse ? [ownedSeekResponse.summary.seekId] : []}
          ownedSeekResponse={ownedSeekResponse}
          onQuickMatch={async (): Promise<"waiting"> => {
            setOwnedSeekResponse({ role: "creator", summary: waitingSeek });
            return "waiting";
          }}
        />
      );
    }

    render(<Harness />);

    await screen.findByText("No lobby listings yet.");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(/listed in the Lobby for someone to accept/);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel your lobby listing" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Lobby listing cancelled.");
  });

  it("replaces waiting quick-match copy when a background refresh marks the owned seek accepted", async () => {
    const waitingSeek = openSeek({ seekId: "seek_waiting_accepted" });
    const acceptedSeek = openSeek({
      seekId: "seek_waiting_accepted",
      status: "accepted",
      updatedAt: "2026-06-01T12:02:00.000Z",
      acceptedAt: "2026-06-01T12:02:00.000Z",
      acceptedBy: { kind: "session", id: "acceptor" },
      gameId: "game_waiting_accepted",
      whiteIdentity: waitingSeek.creatorIdentity,
      blackIdentity: { kind: "session", id: "acceptor" },
      lastEventId: "seek_waiting_accepted_evt_accepted",
    });

    function Harness() {
      const [ownedSeekResponse, setOwnedSeekResponse] = React.useState<{
        role: "creator";
        summary: OpenSeekSummary;
        gameInvite?: { gameId: string; seat: "w" | "b"; token: string; url: string };
      } | null>(null);
      return (
        <>
          <OnlineGameBrowser
            initialTab="lobby"
            loadGames={vi.fn()}
            loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
            onBack={vi.fn()}
            onSpectate={vi.fn()}
            onReplay={vi.fn()}
            onAcceptSeek={vi.fn()}
            onJoinOwnedSeek={vi.fn()}
            ownedSeekIds={ownedSeekResponse ? [ownedSeekResponse.summary.seekId] : []}
            ownedSeekResponse={ownedSeekResponse}
            onQuickMatch={async (): Promise<"waiting"> => {
              setOwnedSeekResponse({ role: "creator", summary: waitingSeek });
              return "waiting";
            }}
          />
          <button
            type="button"
            onClick={() =>
              setOwnedSeekResponse({
                role: "creator",
                summary: acceptedSeek,
                gameInvite: {
                  gameId: "game_waiting_accepted",
                  seat: "w",
                  token: "join-token",
                  url: "https://castles.example/?onlineGame=game_waiting_accepted&seat=w",
                },
              })
            }
          >
            Mock accepted refresh
          </button>
        </>
      );
    }

    render(<Harness />);

    await screen.findByText("No lobby listings yet.");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(/listed in the Lobby for someone to accept/);

    fireEvent.click(screen.getByRole("button", { name: "Mock accepted refresh" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your lobby listing was accepted. Join the game from your lobby panel."
      );
    });
    expect(screen.getByRole("button", { name: "Join accepted game" })).toBeInTheDocument();
  });

  it("restores quick match focus after failures", async () => {
    const onQuickMatch = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCreateSeek={vi.fn()}
        onQuickMatch={onQuickMatch}
      />
    );

    await screen.findByText("No lobby listings yet.");
    const quickMatch = screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    });
    quickMatch.focus();
    fireEvent.click(quickMatch);

    expect(await screen.findByRole("status")).toHaveTextContent("Could not start quick match.");
    expect(quickMatch).toHaveFocus();
  });

  it("disables quick match while an owned seek is restoring, open, or accepted", async () => {
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([]));
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={null}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onQuickMatch={vi.fn()}
      />
    );

    await screen.findByText("No lobby listings yet.");
    expect(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).toBeDisabled();

    rerender(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({ seekId: "seek_mine" }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onQuickMatch={vi.fn()}
      />
    );
    expect(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).toBeDisabled();

    rerender(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({
            seekId: "seek_mine",
            status: "accepted",
            acceptedAt: "2026-06-01T12:04:00.000Z",
            acceptedBy: { kind: "session", id: "acceptor" },
            gameId: "game_mine",
            whiteIdentity: { kind: "session", id: "creator" },
            blackIdentity: { kind: "session", id: "acceptor" },
          }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onQuickMatch={vi.fn()}
      />
    );
    expect(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).toBeDisabled();
  });

  it("refreshes the public lobby listing list on demand", async () => {
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([]))
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_after_refresh" })]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("No lobby listings yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh lobby listings" }));

    expect(await screen.findByText("seek_after_refresh")).toBeInTheDocument();
    expect(loadOpenSeeks).toHaveBeenCalledTimes(2);
  });

  it("loads lobby seek filters from the server and reports filtered empty states honestly", async () => {
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_initial" })]))
      .mockResolvedValue(seekDirectory([]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_initial");
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby creator side filter" }), {
      target: { value: "w" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby clock filter" }), {
      target: { value: "timed" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby scoring filter" }), {
      target: { value: "enabled" },
    });

    await waitFor(() => {
      expect(loadOpenSeeks).toHaveBeenLastCalledWith({
        state: "open",
        limit: 50,
        creatorSeat: "w",
        clock: "timed",
        vp: "enabled",
      });
    });
    expect(await screen.findByText("No lobby listings match these filters.")).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/checked/i);
    expect(status.querySelector("[aria-hidden='true']")).toHaveTextContent(/checked/i);
    expect(document.querySelector(".online-browser-visually-hidden[aria-live='off']")).toHaveTextContent(/last checked/i);
    expect(status).not.toHaveTextContent(/present|waiting|ready/i);
  });

  it("auto-refreshes the active visible lobby without clearing rows on rate limits", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_initial" })]))
      .mockRejectedValueOnce(new Error("Could not fetch lobby listings (429)"))
      .mockResolvedValue(seekDirectory([openSeek({ seekId: "seek_after_backoff" })]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_initial");

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    await waitFor(() => expect(loadOpenSeeks).toHaveBeenCalledTimes(2));
    expect(screen.getByText("seek_initial")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("Loading lobby listings");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(loadOpenSeeks).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    await waitFor(() => expect(loadOpenSeeks).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("seek_after_backoff")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("Auto refresh paused");
  });

  it("pauses lobby auto-refresh while hidden and checks once when visible again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let visibilityState: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_initial" })]))
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_visible_again" })]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_initial");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(loadOpenSeeks).toHaveBeenCalledTimes(1);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(await screen.findByText("seek_visible_again")).toBeInTheDocument();
    expect(loadOpenSeeks).toHaveBeenCalledTimes(2);
  });

  it("preserves a pending accept row and focus while background refresh omits it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveAccept!: () => void;
    const acceptPromise = new Promise<void>((resolve) => {
      resolveAccept = resolve;
    });
    const onAcceptSeek = vi.fn().mockReturnValue(acceptPromise);
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_acceptable" })]))
      .mockResolvedValue(seekDirectory([]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
      />
    );

    const row = await screen.findByRole("article", { name: /seek_acceptable/i });
    const accept = within(row).getByRole("button", { name: "Accept lobby listing seek_acceptable" });
    accept.focus();
    fireEvent.click(accept);

    await waitFor(() => expect(accept).toBeDisabled());
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(loadOpenSeeks.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole("article", { name: /seek_acceptable/i })).toBeInTheDocument();
    expect(accept).toHaveFocus();

    await act(async () => {
      resolveAccept();
      await acceptPromise;
    });
    await waitFor(() => expect(accept).not.toBeDisabled());
  });

  it("preserves a pending accept row when an older background refresh resolves after the click", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backgroundRefresh = deferredSeekDirectory();
    let resolveAccept!: () => void;
    const acceptPromise = new Promise<void>((resolve) => {
      resolveAccept = resolve;
    });
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_background_race" })]))
      .mockReturnValueOnce(backgroundRefresh.promise);
    const onAcceptSeek = vi.fn().mockReturnValue(acceptPromise);

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
      />
    );

    const row = await screen.findByRole("article", { name: /seek_background_race/i });
    const accept = within(row).getByRole("button", { name: "Accept lobby listing seek_background_race" });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(loadOpenSeeks).toHaveBeenCalledTimes(2));

    accept.focus();
    fireEvent.click(accept);
    await waitFor(() => expect(accept).toBeDisabled());

    await act(async () => {
      backgroundRefresh.resolve(seekDirectory([]));
      await backgroundRefresh.promise;
    });

    expect(screen.getByRole("article", { name: /seek_background_race/i })).toBeInTheDocument();
    expect(accept).toHaveFocus();

    await act(async () => {
      resolveAccept();
      await acceptPromise;
    });
  });

  it("does not overlap a manual lobby refresh with an in-flight background refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backgroundRefresh = deferredSeekDirectory();
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_before_refresh" })]))
      .mockReturnValueOnce(backgroundRefresh.promise)
      .mockResolvedValue(seekDirectory([openSeek({ seekId: "seek_after_refresh" })]));

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_before_refresh");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(loadOpenSeeks).toHaveBeenCalledTimes(2));

    const refresh = screen.getByRole("button", { name: "Refresh lobby listings" });
    expect(refresh).toBeDisabled();
    fireEvent.click(refresh);
    expect(loadOpenSeeks).toHaveBeenCalledTimes(2);

    await act(async () => {
      backgroundRefresh.resolve(seekDirectory([openSeek({ seekId: "seek_background_done" })]));
      await backgroundRefresh.promise;
    });

    await waitFor(() => expect(refresh).not.toBeDisabled());
    expect(screen.getByText("seek_background_done")).toBeInTheDocument();
  });

  it("does not foreground reload the lobby when a seek action becomes pending", async () => {
    let resolveAccept!: () => void;
    const acceptPromise = new Promise<void>((resolve) => {
      resolveAccept = resolve;
    });
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([
      openSeek({ seekId: "seek_pending_no_reload" }),
    ]));
    const onAcceptSeek = vi.fn().mockReturnValue(acceptPromise);

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
      />
    );

    const row = await screen.findByRole("article", { name: /seek_pending_no_reload/i });
    const accept = within(row).getByRole("button", { name: "Accept lobby listing seek_pending_no_reload" });

    fireEvent.click(accept);

    await waitFor(() => expect(accept).toBeDisabled());
    expect(loadOpenSeeks).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAccept();
      await acceptPromise;
    });
  });

  it("auto-refreshes creator-owned lobby listings through the owner refresh path", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onRefreshOwnedSeek = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({ seekId: "seek_mine" }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onRefreshOwnedSeek={onRefreshOwnedSeek}
      />
    );

    await screen.findByRole("region", { name: "Your lobby listing" });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(onRefreshOwnedSeek).toHaveBeenCalledOnce());
  });

  it("accepts and cancels lobby listings with row-local pending states", async () => {
    const onAcceptSeek = vi.fn().mockResolvedValue(undefined);
    const onCancelSeek = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_acceptable" }),
          openSeek({ seekId: "seek_mine" }),
        ]))}
        ownedSeekIds={["seek_mine"]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
        onCancelSeek={onCancelSeek}
      />
    );

    const acceptRow = await screen.findByRole("article", { name: /seek_acceptable/i });
    fireEvent.click(within(acceptRow).getByRole("button", { name: "Accept lobby listing seek_acceptable" }));

    await waitFor(() => expect(onAcceptSeek).toHaveBeenCalledWith("seek_acceptable"));

    const ownRow = screen.getByRole("article", { name: /seek_mine/i });
    fireEvent.click(within(ownRow).getByRole("button", { name: "Cancel lobby listing seek_mine" }));

    await waitFor(() => expect(onCancelSeek).toHaveBeenCalledWith("seek_mine"));
  });

  it("shows creator-owned seek status with refresh, cancel, and accepted-game join actions", async () => {
    const onRefreshOwnedSeek = vi.fn().mockResolvedValue(undefined);
    const onCancelSeek = vi.fn().mockResolvedValue(undefined);
    const onJoinOwnedSeek = vi.fn();
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({ seekId: "seek_mine", creatorSeat: "w" }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCancelSeek={onCancelSeek}
        onRefreshOwnedSeek={onRefreshOwnedSeek}
        onJoinOwnedSeek={onJoinOwnedSeek}
      />
    );

    const openPanel = await screen.findByRole("region", { name: "Your lobby listing" });

    expect(openPanel).toHaveTextContent("seek_mine");
    expect(openPanel).toHaveTextContent("Open");
    fireEvent.click(within(openPanel).getByRole("button", { name: "Refresh your lobby listing" }));
    await waitFor(() => expect(onRefreshOwnedSeek).toHaveBeenCalledOnce());
    fireEvent.click(within(openPanel).getByRole("button", { name: "Cancel your lobby listing" }));
    await waitFor(() => expect(onCancelSeek).toHaveBeenCalledWith("seek_mine"));

    const accepted = openSeek({
      seekId: "seek_mine",
      creatorSeat: "w",
      status: "accepted",
      updatedAt: "2026-06-01T12:04:00.000Z",
      acceptedAt: "2026-06-01T12:04:00.000Z",
      acceptedBy: { kind: "session", id: "seek_mine_acceptor" },
      gameId: "game_from_seek",
      whiteIdentity: { kind: "session", id: "seek_mine_creator" },
      blackIdentity: { kind: "session", id: "seek_mine_acceptor" },
      lastEventId: "seek_mine_accepted",
    });
    rerender(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: accepted,
          gameInvite: {
            gameId: "game_from_seek",
            seat: "w",
            token: "creator-token",
            url: "https://castles.example/?onlineGame=game_from_seek&seat=w&token=creator-token",
          },
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCancelSeek={onCancelSeek}
        onRefreshOwnedSeek={onRefreshOwnedSeek}
        onJoinOwnedSeek={onJoinOwnedSeek}
      />
    );

    const panel = await screen.findByRole("region", { name: "Your lobby listing" });

    expect(panel).toHaveTextContent("seek_mine");
    expect(panel).toHaveTextContent("Accepted");
    expect(within(panel).queryByRole("button", { name: "Cancel your lobby listing" })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Join accepted game" }));
    expect(onJoinOwnedSeek).toHaveBeenCalledOnce();
  });

  it("shows the concrete owned side after a random-side listing is accepted", async () => {
    const acceptedRandom = openSeek({
      seekId: "seek_random_accepted_side",
      creatorSeat: "random",
      status: "accepted",
      updatedAt: "2026-06-01T12:04:00.000Z",
      acceptedAt: "2026-06-01T12:04:00.000Z",
      acceptedBy: { kind: "session", id: "seek_random_acceptor" },
      gameId: "game_random_accepted_side",
      whiteIdentity: { kind: "session", id: "seek_random_creator" },
      blackIdentity: { kind: "session", id: "seek_random_acceptor" },
      lastEventId: "seek_random_accepted_side_evt",
    });

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_random_accepted_side"]}
        ownedSeekResponse={{
          role: "creator",
          summary: acceptedRandom,
          gameInvite: {
            gameId: "game_random_accepted_side",
            seat: "b",
            token: "creator-token",
            url: "https://castles.example/?onlineGame=game_random_accepted_side&seat=b&token=creator-token",
          },
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onJoinOwnedSeek={vi.fn()}
      />
    );

    const panel = await screen.findByRole("region", { name: "Your lobby listing" });
    expect(panel).toHaveTextContent("You play Black");
    expect(panel).not.toHaveTextContent("Creator side Random");
  });

  it.each(["cancelled", "expired"] as const)(
    "does not render dead owner controls for %s lobby listings",
    async (status) => {
      const terminalSeek = openSeek({
        seekId: `seek_${status}`,
        status,
        updatedAt: status === "expired" ? "2026-06-01T12:11:00.000Z" : "2026-06-01T12:04:00.000Z",
        ...(status === "cancelled"
          ? {
              cancelledAt: "2026-06-01T12:04:00.000Z",
              cancelledBy: { kind: "session" as const, id: "seek_cancelled_creator" },
            }
          : {
              expiredAt: "2026-06-01T12:11:00.000Z",
              expiredBy: "system" as const,
            }),
      });

      render(
        <OnlineGameBrowser
          initialTab="lobby"
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          ownedSeekIds={[terminalSeek.seekId]}
          ownedSeekResponse={{ role: "creator", summary: terminalSeek }}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
          onAcceptSeek={vi.fn()}
          onCancelSeek={vi.fn()}
          onRefreshOwnedSeek={vi.fn()}
          onCreateSeek={vi.fn()}
          onQuickMatch={vi.fn()}
        />
      );

      await screen.findByText("No lobby listings yet.");
      const closedPanel = screen.getByRole("region", { name: "Closed lobby listing" });
      expect(closedPanel).toHaveTextContent("This listing is no longer public");
      expect(closedPanel).toHaveTextContent(status === "cancelled" ? "Cancelled" : "Expired");
      expect(closedPanel).toHaveTextContent(`seek_${status}`);
      expect(screen.queryByRole("region", { name: "Your lobby listing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Refresh your lobby listing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancel your lobby listing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create a new lobby listing from current Play setup" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Create public lobby listing from current Play setup" })).toHaveLength(1);
      expect(screen.getByRole("status")).toHaveTextContent("Your previous lobby listing is closed and no longer public.");
    }
  );

  it("moves focus to the closed listing panel when owner controls disappear", async () => {
    const openOwnedSeek = openSeek({ seekId: "seek_focus_terminal" });
    const closedOwnedSeek = openSeek({
      seekId: "seek_focus_terminal",
      status: "cancelled",
      updatedAt: "2026-06-01T12:04:00.000Z",
      cancelledAt: "2026-06-01T12:04:00.000Z",
      cancelledBy: { kind: "session", id: "seek_focus_terminal_creator" },
    });
    const props = {
      initialTab: "lobby" as const,
      loadOpenSeeks: vi.fn().mockResolvedValue(seekDirectory([])),
      ownedSeekIds: ["seek_focus_terminal"],
      onBack: vi.fn(),
      onSpectate: vi.fn(),
      onReplay: vi.fn(),
      onAcceptSeek: vi.fn(),
      onCancelSeek: vi.fn(),
      onRefreshOwnedSeek: vi.fn().mockResolvedValue(undefined),
      onCreateSeek: vi.fn(),
      onQuickMatch: vi.fn(),
    };
    const { rerender } = render(
      <OnlineGameBrowser
        {...props}
        ownedSeekResponse={{
          role: "creator",
          summary: openOwnedSeek,
        }}
      />
    );

    const openPanel = await screen.findByRole("region", { name: "Your lobby listing" });
    const refresh = within(openPanel).getByRole("button", { name: "Refresh your lobby listing" });
    refresh.focus();
    expect(refresh).toHaveFocus();

    rerender(
      <OnlineGameBrowser
        {...props}
        ownedSeekResponse={{
          role: "creator",
          summary: closedOwnedSeek,
        }}
      />
    );

    const closedPanel = await screen.findByRole("region", { name: "Closed lobby listing" });
    await waitFor(() => expect(closedPanel).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Refresh your lobby listing" })).not.toBeInTheDocument();
  });

  it("loads the public directory for the active tab state", async () => {
    const loadGames = vi.fn().mockResolvedValue(directory([]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("No public games in progress.")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({ state: "active", limit: 50 });

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    expect(await screen.findByText("No public completed games yet.")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({ state: "archived", limit: 50 });
  });

  it("requests public game clock and archive result filters from the server", async () => {
    const loadGames = vi.fn().mockResolvedValue(directory([]));
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("No public completed games yet.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Time control filter" }), {
      target: { value: "casual" },
    });

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "archived",
        limit: 50,
        clock: "casual",
        cursor: undefined,
      });
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "timeout" },
    });

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "archived",
        limit: 50,
        clock: "casual",
        result: "timeout",
        cursor: undefined,
      });
    });
    expect(screen.getByText("No public replays match these filters.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Live public games" }));

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "active",
        limit: 50,
        clock: "casual",
        cursor: undefined,
      });
    });
  });

  it("requests public game search from the server and preserves it for pagination", async () => {
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([summary({ gameId: "game_initial_page" })]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_search_match" })], "cursor-search"))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_search_second_page" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("game_initial_page")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "black   to   move" },
    });

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "active",
        limit: 50,
        query: "black to move",
        cursor: undefined,
      });
    });
    expect(await screen.findByText("game_search_match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "active",
        limit: 50,
        query: "black to move",
        cursor: "cursor-search",
      });
    });
    expect(await screen.findByText("game_search_second_page")).toBeInTheDocument();
  });

  it("shows an honest empty Watch state while only public games are listable", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        onBack={vi.fn()}
        onOpenGame={vi.fn()}
        onTutorial={vi.fn()}
        onOpenLibrary={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading public games");
    const nav = screen.getByRole("navigation", { name: "Online navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());
    expect(nav).toBeInTheDocument();
    expect(destinations).toEqual(["Play", "Tutorial", "Online", "Library"]);
    expect(screen.getByRole("button", { name: "Online" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("No public games in progress.")).toBeInTheDocument();
    expect(screen.getByText(/Private and unlisted games stay off this page/i)).toBeInTheDocument();
  });

  it("shows a setup prompt when no playable setup action is available", async () => {
    const onOpenGame = vi.fn();
    const onConfigureSetup = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onOpenGame={onOpenGame}
        onConfigureSetup={onConfigureSetup}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("No lobby listings yet.");

    expect(screen.getByRole("region", { name: "Set up lobby play" })).toBeInTheDocument();
    expect(screen.getByText("Choose a Play setup before lobby play")).toBeInTheDocument();
    expect(screen.getByText("Configure setup, then return here to find or create a lobby listing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Create public lobby listing from current Play setup",
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure a Play setup for online lobby" }));

    expect(onConfigureSetup).toHaveBeenCalledOnce();
    expect(onOpenGame).not.toHaveBeenCalled();
  });

  it("auto-refreshes the Watch tab while visible", async () => {
    vi.useFakeTimers();
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_watch_refresh" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("No public games in progress.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("game_watch_refresh")).toBeInTheDocument();
    expect(loadGames).toHaveBeenCalledTimes(2);
  });

  it("pauses Watch auto-refresh while the tab is hidden", async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_visible_again" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(loadGames).toHaveBeenCalledTimes(1);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadGames).toHaveBeenCalledTimes(2);
    expect(screen.getByText("game_visible_again")).toBeInTheDocument();
  });

  it("renders live public games with accessible spectator handoff", async () => {
    const onSpectate = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([summary()]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: /Ada vs Ben/i });
    const featuredRegion = screen.getByRole("region", { name: "Most active public live game" });
    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    expect(liveOverview).toHaveTextContent("1 public live game");
    expect(liveOverview).toHaveTextContent("Most moves");
    expect(liveOverview).toHaveTextContent("Ada vs Ben, 3 moves");
    expect(liveOverview).toHaveTextContent("Public only");
    expect(featuredRegion).toContainElement(row);
    expect(row).toHaveTextContent("Most active live game");
    expect(row).toHaveTextContent("Most moves in current list");
    expect(row).toHaveTextContent("Live");
    expect(row).toHaveTextContent("3 moves");
    expect(row).toHaveTextContent("Black to move, Attack");
    expect(row).toHaveTextContent("Last G13G12");
    expect(row).toHaveTextContent("Clock W 19:58 B 19:57");
    expect(within(row).getByRole("img", {
      name: "Board preview: 2 White pieces 2 Black pieces 1 White-controlled castles 1 Black-controlled castles",
    })).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Spectate Ada vs Ben, game_public_active" }));

    expect(onSpectate).toHaveBeenCalledWith("game_public_active");
  });

  it("features the most active live game even when the Watch list is sorted newest", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_newest_few_moves",
            updatedAt: "2026-06-01T12:05:00.000Z",
            version: 2,
          }),
          summary({
            gameId: "game_older_many_moves",
            updatedAt: "2026-06-01T12:01:00.000Z",
            version: 9,
            participants: [
              { seat: "w", role: "white", identity: { kind: "registered", id: "caro_w", displayName: "Caro" } },
              { seat: "b", role: "black", identity: { kind: "registered", id: "dani_b", displayName: "Dani" } },
            ],
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_newest_few_moves");

    expect(screen.getByRole("combobox", { name: "Sort public games" })).toHaveValue("newest");
    const featuredRegion = screen.getByRole("region", { name: "Most active public live game" });
    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    expect(liveOverview).toHaveTextContent("2 public live games");
    expect(liveOverview).toHaveTextContent("Caro vs Dani, 9 moves");
    expect(featuredRegion).toHaveTextContent("game_older_many_moves");
    expect(featuredRegion).toHaveTextContent("9 moves");
    expect(screen.getByRole("region", { name: "Other public live games" })).toHaveTextContent("game_newest_few_moves");
  });

  it("keeps the Watch live count total while search filters the visible leader", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_public_visible", version: 5 }),
          summary({
            gameId: "game_public_hidden",
            version: 9,
            participants: [
              { seat: "w", role: "white", identity: { kind: "registered", id: "caro_w", displayName: "Caro" } },
              { seat: "b", role: "black", identity: { kind: "registered", id: "dani_b", displayName: "Dani" } },
            ],
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_public_visible");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "Ada" },
    });

    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    expect(liveOverview).toHaveTextContent("2 public live games");
    expect(liveOverview).toHaveTextContent("Ada vs Ben, 5 moves");
    expect(screen.queryByText("game_public_hidden")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "no matching game" },
    });

    expect(liveOverview).toHaveTextContent("2 public live games");
    expect(liveOverview).toHaveTextContent("No visible game");
    expect(liveOverview).toHaveTextContent("No matching public games");
  });

  it("defensively hides non-public summaries even if a loader returns them", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_public_visible", visibility: "public" }),
          summary({ gameId: "game_unlisted_hidden", visibility: "unlisted" }),
          summary({ gameId: "game_private_hidden", visibility: "private" }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("game_public_visible")).toBeInTheDocument();
    expect(screen.queryByText("game_unlisted_hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("game_private_hidden")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Watch game_unlisted_hidden" })).not.toBeInTheDocument();
  });

  it("keeps completed games in the Online Archive tab with local analysis replay actions", async () => {
    const onReplay = vi.fn();
    const onSpectate = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_public_archive",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:05:00.000Z",
            updatedAt: "2026-06-01T12:05:00.000Z",
            result: { winner: "w", reason: "resignation" },
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={onReplay}
      />
    );

    const row = await screen.findByRole("article", {
      name: "Ada vs Ben replay game_public_archive, White wins by resignation",
    });
    expect(screen.getByRole("button", { name: "Online Archive" })).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveTextContent("Complete");
    expect(row).toHaveTextContent("Replay length 3 moves");
    expect(row).toHaveTextContent("Final position Black, Attack");
    expect(row).toHaveTextContent("Last move G13G12");
    expect(row).toHaveTextContent("Timed 20+20");
    expect(row).toHaveTextContent(/Ended /);
    expect(row).toHaveTextContent(/Started /);
    expect(row).toHaveTextContent("White wins by resignation");
    fireEvent.click(within(row).getByRole("button", { name: "Analyze replay Ada vs Ben, game_public_archive" }));

    expect(onReplay).toHaveBeenCalledWith("game_public_archive");
    expect(onSpectate).not.toHaveBeenCalled();
    expect(within(row).queryByRole("button", { name: "Copy spectator link for game_public_archive" })).not.toBeInTheDocument();
  });

  it("keeps current spectator sorting out of Online Archive", async () => {
    const active = summary({ gameId: "game_live_with_watchers", version: 6 });
    active.livePreview = {
      ...active.livePreview,
      spectatorCount: 5,
    };
    const archived = summary({
      gameId: "game_public_archive_no_watchers",
      status: "complete",
      archiveState: "archived",
      endedAt: "2026-06-01T12:05:00.000Z",
      updatedAt: "2026-06-01T12:05:00.000Z",
      result: { winner: "b", reason: "timeout" },
    });
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([active, archived]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_live_with_watchers");
    const watchSort = screen.getByRole("combobox", { name: "Sort public games" });
    fireEvent.change(watchSort, { target: { value: "watchers" } });
    expect(watchSort).toHaveValue("watchers");

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    await screen.findByText("game_public_archive_no_watchers");
    const archiveSort = screen.getByRole("combobox", { name: "Sort archive games" });
    expect(archiveSort).toHaveValue("newest");
    expect(screen.queryByRole("option", { name: "Most watched in current list" })).not.toBeInTheDocument();
  });

  it("shows completed recent device games in Online Archive without duplicating public rows", async () => {
    const onReplay = vi.fn();
    const onClearRecentOnlineGames = vi.fn();
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({
        gameId: "game_public_archive",
        status: "complete",
        archiveState: "archived",
        updatedAt: "2026-06-01T12:05:00.000Z",
        result: { winner: "w", reason: "resignation" },
      }),
    ]));
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={loadGames}
        recentOnlineGames={[
          {
            gameId: "game_unlisted_finished",
            role: "player",
            seat: "b",
            status: "complete",
            lastSeenAt: "2026-06-01T13:00:00.000Z",
          },
          {
            gameId: "game_public_archive",
            role: "player",
            seat: "w",
            status: "complete",
            lastSeenAt: "2026-06-01T12:05:00.000Z",
          },
          {
            gameId: "game_active_recent",
            role: "spectator",
            status: "active",
            lastSeenAt: "2026-06-01T12:30:00.000Z",
          },
        ]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={onReplay}
        onClearRecentOnlineGames={onClearRecentOnlineGames}
      />
    );

    const recent = await screen.findByRole("region", { name: "Recent online games on this device" });
    expect(recent).toHaveTextContent("game_unlisted_finished");
    expect(recent).toHaveTextContent("Played Black");
    expect(recent).toHaveTextContent("Device-only replay");
    expect(recent).toHaveTextContent(
      "Completed online games opened in this browser can be replayed here when they are not already in your account or public archive."
    );
    expect(recent).toHaveTextContent(
      "Search can match these local game ids; clock and result filters require server archive details."
    );
    expect(recent).not.toHaveTextContent("game_active_recent");
    expect(within(recent).queryByText("game_public_archive")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "not-this-device-game" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "unlisted" },
    });
    const filteredRecent = await screen.findByRole("region", { name: "Recent online games on this device" });
    expect(filteredRecent).toHaveTextContent("game_unlisted_finished");

    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "white" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "all" },
    });
    const restoredRecent = await screen.findByRole("region", { name: "Recent online games on this device" });

    fireEvent.click(
      within(restoredRecent).getByRole("button", { name: "Analyze recent online replay game_unlisted_finished" })
    );
    expect(onReplay).toHaveBeenCalledWith("game_unlisted_finished");

    const clearButton = within(restoredRecent).getByRole("button", {
      name: "Clear recent online replays on this device",
    });
    expect(clearButton).toHaveTextContent("Clear Recent Replays");
    fireEvent.click(clearButton);
    expect(onClearRecentOnlineGames).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Online Archive" })).toHaveFocus();
    expect(screen.getByText("Recent device replay list cleared.")).toBeInTheDocument();

    rerender(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={loadGames}
        recentOnlineGames={[]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={onReplay}
        onClearRecentOnlineGames={onClearRecentOnlineGames}
      />
    );
    expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
  });

  it("does not carry the recent replay clear status into Watch", async () => {
    const { rerender } = render(
      <OnlineGameBrowser
        activeTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        recentOnlineGames={[
          {
            gameId: "game_unlisted_finished",
            role: "player",
            seat: "b",
            status: "complete",
            lastSeenAt: "2026-06-01T13:00:00.000Z",
          },
        ]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onClearRecentOnlineGames={vi.fn()}
      />
    );

    const recent = await screen.findByRole("region", { name: "Recent online games on this device" });
    fireEvent.click(
      within(recent).getByRole("button", {
        name: "Clear recent online replays on this device",
      })
    );
    expect(screen.getByRole("status")).toHaveTextContent("Recent device replay list cleared.");

    rerender(
      <OnlineGameBrowser
        activeTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        recentOnlineGames={[]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onClearRecentOnlineGames={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).not.toHaveTextContent("Recent device replay list cleared.");
  });

  it("filters public summaries by player name and game id", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_ada_public" }),
          summary({
            gameId: "game_caro_public",
            participants: [
              { seat: "w", role: "white", identity: { kind: "registered", id: "caro_w", displayName: "Caro" } },
              { seat: "b", role: "black", identity: { kind: "registered", id: "dani_b", displayName: "Dani" } },
            ],
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_ada_public");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "caro" },
    });

    expect(screen.queryByText("game_ada_public")).not.toBeInTheDocument();
    expect(screen.getByText("game_caro_public")).toBeInTheDocument();
  });

  it("sorts and filters live public games without exposing hidden summaries", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_newer_few_moves",
            updatedAt: "2026-06-01T12:05:00.000Z",
            version: 2,
            hasTimeControl: true,
          }),
          summary({
            gameId: "game_older_many_moves",
            updatedAt: "2026-06-01T12:01:00.000Z",
            version: 9,
            hasTimeControl: false,
          }),
          summary({
            gameId: "game_middle_moves",
            updatedAt: "2026-06-01T12:03:00.000Z",
            version: 5,
            hasTimeControl: false,
          }),
          summary({ gameId: "game_hidden_unlisted", visibility: "unlisted", version: 99 }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_newer_few_moves");
    expect(screen.queryByText("game_hidden_unlisted")).not.toBeInTheDocument();

    const featuredRegion = screen.getByRole("region", { name: "Most active public live game" });
    expect(featuredRegion).toHaveTextContent("game_older_many_moves");
    let sideRows = within(screen.getByRole("region", { name: "Other public live games" })).getAllByRole("article");
    expect(sideRows[0]).toHaveTextContent("game_newer_few_moves");
    expect(sideRows[1]).toHaveTextContent("game_middle_moves");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "moves" },
    });
    sideRows = within(screen.getByRole("region", { name: "Other public live games" })).getAllByRole("article");
    expect(sideRows[0]).toHaveTextContent("game_middle_moves");

    fireEvent.change(screen.getByRole("combobox", { name: "Time control filter" }), {
      target: { value: "timed" },
    });

    expect(screen.getByText("game_newer_few_moves")).toBeInTheDocument();
    expect(screen.queryByText("game_older_many_moves")).not.toBeInTheDocument();
    expect(screen.queryByText("game_middle_moves")).not.toBeInTheDocument();
  });

  it("filters archived games by result and reports filtered no-results honestly", async () => {
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_white_archive",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:05:00.000Z",
            result: { winner: "w", reason: "resignation" },
          }),
          summary({
            gameId: "game_black_archive",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:06:00.000Z",
            result: { winner: "b", reason: "timeout" },
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_white_archive");

    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "black" },
    });

    await waitFor(() => {
      expect(screen.getByText("game_black_archive")).toBeInTheDocument();
      expect(screen.queryByText("game_white_archive")).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "no-such-game" },
    });

    await waitFor(() => {
      expect(screen.getByText("No public replays match these filters.")).toBeInTheDocument();
    });
  });

  it("hides archive-only result filters on Watch and resets them when returning to live games", async () => {
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_black_archive",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:06:00.000Z",
            result: { winner: "b", reason: "timeout" },
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_black_archive");
    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "black" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Live public games" }));

    expect(screen.queryByRole("combobox", { name: "Result filter" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Result filter" })).toHaveValue("all");
    });
  });

  it("keeps long public rows actionable on narrow layouts", async () => {
    const longId = "game_public_archive_with_a_very_long_identifier_that_should_wrap_without_hiding_actions";
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: longId,
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:05:00.000Z",
            result: { winner: "w", reason: "castle_control" },
            participants: [
              { seat: "w", role: "white", identity: { kind: "registered", id: "very_long_w", displayName: "A Very Long White Player Name That Wraps" } },
              { seat: "b", role: "black", identity: { kind: "registered", id: "very_long_b", displayName: "A Very Long Black Player Name That Wraps" } },
            ],
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: new RegExp(longId) });

    expect(row).toHaveTextContent(longId);
    expect(within(row).getByRole("button", { name: new RegExp(`Analyze replay .*${longId}`) })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: `Copy spectator link for ${longId}` })).not.toBeInTheDocument();
  });

  it("loads additional public directory pages on demand", async () => {
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([summary({ gameId: "game_first_page" })], "cursor-next"))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_second_page" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("game_first_page")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("game_second_page")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({
      state: "active",
      limit: 50,
      cursor: "cursor-next",
    });
  });

  it("does not let Watch auto-refresh clobber a pending Load more request", async () => {
    vi.useFakeTimers();
    const secondPage = deferredDirectory();
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([summary({ gameId: "game_first_page" })], "cursor-next"))
      .mockReturnValueOnce(secondPage.promise);
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("game_first_page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(loadGames).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondPage.resolve(directory([summary({ gameId: "game_second_page" })]));
      await secondPage.promise;
    });

    expect(screen.getByText("game_second_page")).toBeInTheDocument();
  });

  it("reloads the public directory when search changes instead of relying on an unfiltered cursor", async () => {
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([
        summary({ gameId: "game_first_page_no_match" }),
      ], "cursor-filtered"))
      .mockResolvedValueOnce(directory([
        summary({ gameId: "game_second_page_match" }),
      ]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("game_first_page_no_match")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "second_page_match" },
    });

    expect(screen.getByText("No public games match these filters.")).toBeInTheDocument();

    expect(await screen.findByText("game_second_page_match")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({
      state: "active",
      limit: 50,
      query: "second_page_match",
      cursor: undefined,
    });
  });

  it("ignores stale tab load responses after a newer tab request wins", async () => {
    const watch = deferredDirectory();
    const archive = deferredDirectory();
    const loadGames = vi
      .fn()
      .mockReturnValueOnce(watch.promise)
      .mockReturnValueOnce(archive.promise);
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));
    archive.resolve(directory([
      summary({
        gameId: "game_archive_wins_race",
        status: "complete",
        archiveState: "archived",
        endedAt: "2026-06-01T12:06:00.000Z",
        result: { winner: "b", reason: "timeout" },
      }),
    ]));
    expect(await screen.findByText("game_archive_wins_race")).toBeInTheDocument();

    watch.resolve(directory([summary({ gameId: "game_stale_watch" })]));

    expect(screen.queryByText("game_stale_watch")).not.toBeInTheDocument();
    expect(screen.getByText("game_archive_wins_race")).toBeInTheDocument();
  });

  it("shows a retryable failure state when public summaries cannot load", async () => {
    const loadGames = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(directory([summary()]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("Could not load public games.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("game_public_active")).toBeInTheDocument();
    expect(loadGames).toHaveBeenCalledTimes(2);
  });
});
