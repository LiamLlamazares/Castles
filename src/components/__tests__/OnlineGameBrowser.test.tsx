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
import { ONLINE_RULESET_VERSION } from "../../online/events";

function summary(overrides: Partial<OnlineGameSummary> = {}): OnlineGameSummary {
  const gameId = overrides.gameId ?? "game_public_active";
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

  it("loads lobby listings in the Lobby tab without calling the game directory", async () => {
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([openSeek()]));
    const loadGames = vi.fn().mockResolvedValue(directory([]));
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
    expect(loadGames).not.toHaveBeenCalled();
    expect(row).toHaveTextContent("Side random");
    expect(row).toHaveTextContent("Radius 7");
    expect(row).toHaveTextContent("Timed 20+20");
    expect(row).toHaveTextContent("Victory points");
    expect(within(row).getByRole("button", { name: "Accept lobby listing seek_public_open" })).toBeInTheDocument();
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
        loadGames={vi.fn()}
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
    expect(screen.getByText("Uses your exact current Play setup")).toBeInTheDocument();
    const setupSummary = screen.getByLabelText("Quick match setup summary");
    expect(within(setupSummary).getByText("Radius 7")).toBeInTheDocument();
    expect(within(setupSummary).getByText("Timed 20+20")).toBeInTheDocument();
    expect(within(setupSummary).getByText("Victory points")).toBeInTheDocument();
    expect(screen.getByText(/Current board, pieces, sanctuaries, pool, theme, clock, and scoring mode must match/i))
      .toBeInTheDocument();

    const quickMatch = screen.getByRole("button", {
      name: "Quick Match: accept a compatible lobby listing or list yours",
    });
    fireEvent.click(quickMatch);

    expect(onQuickMatch).toHaveBeenCalledOnce();
    expect(quickMatch).toBeDisabled();
    expect(screen.getByRole("button", { name: "List in Lobby" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Checking compatible lobby listings");

    await act(async () => {
      resolveQuickMatch();
      await quickMatchPromise;
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/game is listed in the Lobby/i);
  });

  it("keeps conflicting lobby actions disabled after a matched quick match result", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
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
      name: "Quick Match: accept a compatible lobby listing or list yours",
    }));

    expect(await screen.findByRole("status")).toHaveTextContent("Match found. Opening game...");
    expect(screen.getByRole("button", {
      name: "Quick Match: accept a compatible lobby listing or list yours",
    })).toBeDisabled();
    expect(screen.getByRole("button", { name: "List in Lobby" })).toBeDisabled();
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
      name: "Quick Match: accept a compatible lobby listing or list yours",
    });
    quickMatch.focus();
    await user.keyboard("{Enter}");

    const ownerPanel = await screen.findByRole("region", { name: "Your lobby listing" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "No compatible lobby listing found. Your game is listed in the Lobby for someone to accept."
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
      name: "Quick Match: accept a compatible lobby listing or list yours",
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
      name: "Quick Match: accept a compatible lobby listing or list yours",
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
      name: "Quick Match: accept a compatible lobby listing or list yours",
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
      name: "Quick Match: accept a compatible lobby listing or list yours",
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
      name: "Quick Match: accept a compatible lobby listing or list yours",
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
      name: "Quick Match: accept a compatible lobby listing or list yours",
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
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby side filter" }), {
      target: { value: "w" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby clock filter" }), {
      target: { value: "timed" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby victory points filter" }), {
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

    expect(await screen.findByText("No public live games yet.")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({ state: "active", limit: 50 });

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    expect(await screen.findByText("No public completed games yet.")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({ state: "archived", limit: 50 });
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
    expect(destinations).toEqual(["Play", "Learn", "Online", "Library"]);
    expect(screen.getByRole("button", { name: "Online" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("No public live games yet.")).toBeInTheDocument();
    expect(screen.getByText(/Private and unlisted games stay off this page/i)).toBeInTheDocument();
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
    expect(row).toHaveTextContent("Live");
    expect(row).toHaveTextContent("3 moves");
    expect(row).toHaveTextContent("Timed");

    fireEvent.click(within(row).getByRole("button", { name: "Spectate Ada vs Ben, game_public_active" }));

    expect(onSpectate).toHaveBeenCalledWith("game_public_active");
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

    const row = await screen.findByRole("article", { name: /Ada vs Ben/i });
    expect(screen.getByRole("button", { name: "Online Archive" })).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveTextContent("Complete");
    expect(row).toHaveTextContent("White wins by resignation");
    fireEvent.click(within(row).getByRole("button", { name: "Analyze replay Ada vs Ben, game_public_archive" }));

    expect(onReplay).toHaveBeenCalledWith("game_public_archive");
    expect(onSpectate).not.toHaveBeenCalled();
    expect(within(row).queryByRole("button", { name: "Copy spectator link for game_public_archive" })).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByRole("searchbox", { name: "Search public games" }), {
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
          summary({ gameId: "game_hidden_unlisted", visibility: "unlisted", version: 99 }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_newer_few_moves");
    expect(screen.queryByText("game_hidden_unlisted")).not.toBeInTheDocument();

    let rows = screen.getAllByRole("article");
    expect(rows[0]).toHaveTextContent("game_newer_few_moves");
    expect(rows[1]).toHaveTextContent("game_older_many_moves");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "moves" },
    });
    rows = screen.getAllByRole("article");
    expect(rows[0]).toHaveTextContent("game_older_many_moves");

    fireEvent.change(screen.getByRole("combobox", { name: "Time control filter" }), {
      target: { value: "timed" },
    });

    expect(screen.getByText("game_newer_few_moves")).toBeInTheDocument();
    expect(screen.queryByText("game_older_many_moves")).not.toBeInTheDocument();
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

    expect(screen.getByText("game_black_archive")).toBeInTheDocument();
    expect(screen.queryByText("game_white_archive")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search public games" }), {
      target: { value: "no-such-game" },
    });

    expect(screen.getByText("No public games match these filters.")).toBeInTheDocument();
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

    expect(await screen.findByText("game_first_page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("game_second_page")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({
      state: "active",
      limit: 50,
      cursor: "cursor-next",
    });
  });

  it("keeps pagination reachable when filters hide the loaded page", async () => {
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([
        summary({ gameId: "game_casual_first_page", hasTimeControl: false }),
      ], "cursor-filtered"))
      .mockResolvedValueOnce(directory([
        summary({ gameId: "game_timed_second_page", hasTimeControl: true }),
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

    expect(await screen.findByText("game_casual_first_page")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Time control filter" }), {
      target: { value: "timed" },
    });

    expect(screen.getByText("No public games match these filters.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("game_timed_second_page")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({
      state: "active",
      limit: 50,
      cursor: "cursor-filtered",
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
