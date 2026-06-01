import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { SanctuaryType } from "../Constants";
import type { OnlineGameSnapshotDTO } from "../online/types";

const onlineHookMocks = vi.hoisted(() => ({
  submitAction: vi.fn(),
  useOnlineGameConnection: vi.fn(),
  useOnlineSpectatorConnection: vi.fn(),
}));

vi.mock("../hooks/useOnlineGameConnection", () => ({
  useOnlineGameConnection: onlineHookMocks.useOnlineGameConnection,
}));

vi.mock("../hooks/useOnlineSpectatorConnection", () => ({
  useOnlineSpectatorConnection: onlineHookMocks.useOnlineSpectatorConnection,
}));

function moveHistoryLength(moveTree: unknown): string {
  const candidate = moveTree as { getHistoryLine?: () => unknown[] } | undefined;
  return typeof candidate?.getHistoryLine === "function"
    ? String(candidate.getHistoryLine().length)
    : "none";
}

vi.mock("../components/Game", () => ({
  default: (props: {
    initialBoard?: unknown;
    initialPieces?: unknown[];
    initialMoveTree?: unknown;
    initialTurnCounter?: number;
    initialSanctuaries?: unknown[];
    initialVictoryPoints?: { w: number; b: number };
    isAnalysisMode?: boolean;
    onlineSession?: {
      role: string;
      visibility?: string;
      updateVisibility?: (visibility: "public" | "unlisted") => Promise<unknown>;
    };
    sanctuarySettings?: { unlockTurn: number; cooldown: number };
    initialPoolTypes?: unknown[];
    onSetup: () => void;
    onTutorial: () => void;
    onOpenLibrary: () => void;
    onOpenOnlineBrowser: () => void;
    onLoadGame: (data: {
      board: unknown;
      pieces: unknown[];
      turnCounter: number;
      sanctuaries: unknown[];
      moveTree?: unknown;
      sanctuarySettings?: { unlockTurn: number; cooldown: number };
      initialPoolTypes?: unknown[];
    }) => void;
  }) => (
    <div>
      <div>Game Ready</div>
      <div>Online session: {props.onlineSession?.role ?? "none"}</div>
      <div>Online visibility: {props.onlineSession?.visibility ?? "none"}</div>
      <div>Analysis mode: {props.isAnalysisMode ? "yes" : "no"}</div>
      <div>
        Victory points: {props.initialVictoryPoints
          ? `${props.initialVictoryPoints.w}-${props.initialVictoryPoints.b}`
          : "none"}
      </div>
      <div>Pool types: {props.initialPoolTypes?.join(",") ?? "none"}</div>
      <div>Move history: {moveHistoryLength(props.initialMoveTree)}</div>
      <button type="button" onClick={props.onSetup}>
        Configure New Game
      </button>
      <button type="button" onClick={props.onTutorial}>
        Open Tutorial
      </button>
      <button type="button" onClick={props.onOpenLibrary}>
        Open Library
      </button>
      <button type="button" onClick={props.onOpenOnlineBrowser}>
        Open Watch
      </button>
      {props.onlineSession?.updateVisibility && (
        <button
          type="button"
          onClick={() =>
            void props.onlineSession?.updateVisibility?.(
              props.onlineSession.visibility === "public" ? "unlisted" : "public"
            )
          }
        >
          {props.onlineSession.visibility === "public"
            ? "Mock Unlist Current Game"
            : "Mock Publish Current Game"}
        </button>
      )}
      <button
        type="button"
        onClick={() => props.onLoadGame({
          board: props.initialBoard,
          pieces: props.initialPieces ?? [],
          turnCounter: props.initialTurnCounter ?? 0,
          sanctuaries: props.initialSanctuaries ?? [],
          moveTree: props.initialMoveTree,
          sanctuarySettings: props.sanctuarySettings,
          initialPoolTypes: props.initialPoolTypes,
        })}
        disabled={!props.initialBoard}
      >
        Mock Open Analysis
      </button>
    </div>
  ),
}));

vi.mock("../components/GameSetup", () => ({
  default: ({
    onBack,
    backLabel = "Back to game",
    onTutorial,
    onOpenLibrary,
    onOpenOnlineBrowser,
  }: {
    onBack: () => void;
    backLabel?: string;
    onTutorial: () => void;
    onOpenLibrary: () => void;
    onOpenOnlineBrowser: () => void;
  }) => (
    <div>
      <div>Setup Ready</div>
      <button type="button" onClick={onBack}>
        {backLabel}
      </button>
      <button type="button" onClick={onTutorial}>
        Setup Tutorial
      </button>
      <button type="button" onClick={onOpenLibrary}>
        Setup Library
      </button>
      <button type="button" onClick={onOpenOnlineBrowser}>
        Setup Watch
      </button>
    </div>
  ),
}));

vi.mock("../components/OnlineGameBrowser", () => ({
  default: ({
    onBack,
    onOpenGame,
    onTutorial,
    onOpenLibrary,
    onReplay,
    onSpectate,
    backLabel = "Back to game",
  }: {
    onBack: () => void;
    onOpenGame?: () => void;
    onTutorial?: () => void;
    onOpenLibrary?: () => void;
    onReplay: (gameId: string) => void;
    onSpectate: (gameId: string) => void;
    backLabel?: string;
  }) => (
    <div>
      <div>Online Browser Ready</div>
      <button type="button" onClick={onBack}>
        {backLabel}
      </button>
      {onOpenGame && (
        <button type="button" onClick={onOpenGame}>
          Watch Play
        </button>
      )}
      {onTutorial && (
        <button type="button" onClick={onTutorial}>
          Watch Tutorial
        </button>
      )}
      {onOpenLibrary && (
        <button type="button" onClick={onOpenLibrary}>
          Watch Library
        </button>
      )}
      <button type="button" onClick={() => onSpectate("game_watch_public")}>
        Spectate public game
      </button>
      <button type="button" onClick={() => onReplay("game_archive_public")}>
        Analyze archived game
      </button>
    </div>
  ),
}));

vi.mock("../components/GameLibrary", () => ({
  default: ({
    onBack,
    onOpenGame,
    onTutorial,
    backLabel = "Back to game",
  }: {
    onBack: () => void;
    onOpenGame?: () => void;
    onTutorial?: () => void;
    backLabel?: string;
  }) => (
    <div>
      <div>Library Ready</div>
      <button type="button" onClick={onBack}>
        {backLabel}
      </button>
      {onOpenGame && (
        <button type="button" onClick={onOpenGame}>
          Library Play
        </button>
      )}
      {onTutorial && (
        <button type="button" onClick={onTutorial}>
          Library Tutorial
        </button>
      )}
    </div>
  ),
}));

vi.mock("../components/Tutorial", () => ({
  default: ({
    onBack,
    onOpenGame,
    onOpenLibrary,
    backLabel = "Back to game",
  }: {
    onBack: () => void;
    onOpenGame?: () => void;
    onOpenLibrary?: () => void;
    backLabel?: string;
  }) => (
    <div>
      <div>Tutorial Ready</div>
      <button type="button" onClick={onBack}>
        {backLabel}
      </button>
      {onOpenGame && (
        <button type="button" onClick={onOpenGame}>
          Tutorial Play
        </button>
      )}
      {onOpenLibrary && (
        <button type="button" onClick={onOpenLibrary}>
          Tutorial Library
        </button>
      )}
    </div>
  ),
}));

vi.mock("../components/InstallAppHint", () => ({
  default: () => null,
}));

function spectatorSnapshot(gameId: string): OnlineGameSnapshotDTO {
  return {
    gameId,
    version: 3,
    setup: {
      board: { config: { nSquares: 6 }, castles: [] },
      pieces: [],
      sanctuaries: [],
    },
    state: {
      pieces: [],
      castles: [],
      sanctuaries: [],
      turnCounter: 0,
      sanctuaryPool: [],
      graveyard: [],
      phoenixRecords: [],
      promotionPending: null,
    },
    moveHistory: [],
    playerToMove: "w",
    turnPhase: "Movement",
  };
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("App game setup lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    onlineHookMocks.submitAction.mockReset();
    onlineHookMocks.useOnlineGameConnection.mockReset();
    onlineHookMocks.useOnlineSpectatorConnection.mockReset();
    onlineHookMocks.useOnlineGameConnection.mockReturnValue({
      status: "idle",
      submitAction: onlineHookMocks.submitAction,
    });
    onlineHookMocks.useOnlineSpectatorConnection.mockReturnValue({
      status: "idle",
    });
    window.history.replaceState({}, "", "/?pgn=stale-pgn&game=stale-game");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("clears stale shared-game URL parameters when configuring a new game", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));

    expect(screen.getByText("Setup Ready")).toBeInTheDocument();
    expect(window.location.search).not.toContain("pgn=");
    expect(window.location.search).not.toContain("game=");
  });

  it("returns from tutorial to the view that opened it", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Tutorial" }));
    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Setup Tutorial" }));
    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
  });

  it("returns from library to the view that opened it", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    expect(screen.getByText("Library Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Setup Library" }));
    expect(screen.getByText("Library Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
  });

  it("returns from Watch to the view that opened it", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Setup Watch" }));
    expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();
  });

  it("supports nested page navigation without losing the return path", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Watch Tutorial" }));
    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Watch" }));
    expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Watch Library" }));
    expect(screen.getByText("Library Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Watch" }));
    expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();
  });

  it("opens the current game from nested pages without using the back stack", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Watch Tutorial" }));
    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tutorial Play" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Library Play" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
  });

  it("labels cross-page back buttons with the actual previous page", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Tutorial" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutorial Library" }));
    expect(screen.getByRole("button", { name: "Back to Learn" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Learn" }));
    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tutorial Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Library Tutorial" }));
    expect(screen.getByRole("button", { name: "Back to Library" })).toBeInTheDocument();
  });

  it("opens public games from Watch through the token-free spectator flow", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=stale_player&seat=w&token=secret&onlineChallenge=old&challengeRole=challenged&challengeToken=query-secret#challengeToken=fragment-secret"
    );
    fireEvent.click(screen.getByRole("button", { name: "Spectate public game" }));

    expect(window.location.search).toContain("onlineGame=game_watch_public");
    expect(window.location.search).toContain("view=spectator");
    expect(window.location.search).not.toContain("seat=");
    expect(window.location.search).not.toContain("token=");
    expect(window.location.search).not.toContain("challengeToken=");
    expect(window.location.search).not.toContain("onlineChallenge=");
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent("Connecting online game");
    expect(onlineHookMocks.useOnlineSpectatorConnection).toHaveBeenLastCalledWith(
      "game_watch_public",
      expect.any(Function)
    );
  });

  it("opens archived public games as local analysis without entering spectator mode", async () => {
    const archiveSnapshot = spectatorSnapshot("game_archive_public");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          snapshot: {
            ...archiveSnapshot,
            setup: {
              ...archiveSnapshot.setup,
              gameRules: { vpModeEnabled: true },
            },
            state: {
              ...archiveSnapshot.state,
              victoryPoints: { w: 4, b: 2 },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=stale_player&seat=w&token=secret&onlineChallenge=old&challengeRole=challenged&challengeToken=query-secret&pgn=stale-pgn&game=stale-game#challengeToken=fragment-secret"
    );
    fireEvent.click(screen.getByRole("button", { name: "Analyze archived game" }));

    await waitFor(() => {
      expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument();
      expect(screen.getByText("Online session: none")).toBeInTheDocument();
      expect(screen.getByText("Victory points: 4-2")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/online/games/game_archive_public/spectator");
    expect(window.location.search).not.toContain("onlineGame=");
    expect(window.location.search).not.toContain("seat=");
    expect(window.location.search).not.toContain("token=");
    expect(window.location.search).not.toContain("onlineChallenge=");
    expect(window.location.search).not.toContain("challengeRole=");
    expect(window.location.search).not.toContain("challengeToken=");
    expect(window.location.search).not.toContain("pgn=");
    expect(window.location.search).not.toContain("game=");
    expect(window.location.hash).toBe("");
    expect(onlineHookMocks.useOnlineSpectatorConnection).toHaveBeenLastCalledWith(
      null,
      expect.any(Function)
    );
  });

  it("detaches an existing spectator session while an archived replay snapshot is loading", async () => {
    const pendingFetch = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(pendingFetch.promise);
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?onlineGame=game_live&view=spectator");
    render(<App />);
    const spectatorCallback = onlineHookMocks.useOnlineSpectatorConnection.mock.calls.at(-1)?.[1];
    act(() => {
      spectatorCallback(spectatorSnapshot("game_live"));
    });
    expect(screen.getByText("Online session: spectator")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze archived game" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onlineHookMocks.useOnlineSpectatorConnection).toHaveBeenLastCalledWith(
      null,
      expect.any(Function)
    );

    await act(async () => {
      pendingFetch.resolve(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            snapshot: spectatorSnapshot("game_archive_public"),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument();
    });
  });

  it("does not let a slow archived replay fetch replace newer navigation", async () => {
    const pendingFetch = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingFetch.promise));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze archived game" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    await act(async () => {
      pendingFetch.resolve(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            snapshot: spectatorSnapshot("game_archive_public"),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Setup Ready")).toBeInTheDocument();
    });
    expect(screen.queryByText("Analysis mode: yes")).not.toBeInTheDocument();
  });

  it("uses replay setup metadata for archived games with move history", async () => {
    const archiveSnapshot = spectatorSnapshot("game_archive_public");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          snapshot: {
            ...archiveSnapshot,
            setup: {
              ...archiveSnapshot.setup,
              initialPoolTypes: [SanctuaryType.PyreEternal],
            },
            state: {
              ...archiveSnapshot.state,
              turnCounter: 10,
              sanctuaryPool: [SanctuaryType.PyreEternal],
            },
            moveHistory: [
              { notation: "Pass", turnNumber: 1, color: "w", phase: "Movement" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze archived game" }));

    await waitFor(() => {
      expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument();
      expect(screen.getByText("Pool types: PyreEternal")).toBeInTheDocument();
      expect(screen.getByText("Move history: 1")).toBeInTheDocument();
    });
  });

  it("opens an online spectator game as local analysis and clears online URL state", () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_analysis&view=spectator&token=stale-token&onlineChallenge=old&challengeRole=challenged&challengeToken=query-secret&pgn=stale-pgn&game=stale-game#stale-fragment"
    );
    render(<App />);

    const spectatorCallback = onlineHookMocks.useOnlineSpectatorConnection.mock.calls.at(-1)?.[1];
    act(() => {
      spectatorCallback(spectatorSnapshot("game_analysis"));
    });

    expect(screen.getByText("Online session: spectator")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mock Open Analysis" }));

    expect(screen.getByText("Online session: none")).toBeInTheDocument();
    expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument();
    expect(window.location.search).not.toContain("onlineGame=");
    expect(window.location.search).not.toContain("view=spectator");
    expect(window.location.search).not.toContain("token=");
    expect(window.location.search).not.toContain("onlineChallenge=");
    expect(window.location.search).not.toContain("challengeRole=");
    expect(window.location.search).not.toContain("challengeToken=");
    expect(window.location.search).not.toContain("pgn=");
    expect(window.location.search).not.toContain("game=");
    expect(window.location.hash).toBe("");
    expect(onlineHookMocks.useOnlineSpectatorConnection).toHaveBeenLastCalledWith(
      null,
      expect.any(Function)
    );
  });

  it("lets setup return to the existing game without starting a replacement game", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
  });

  it("shows readable pre-snapshot online connection states", () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_denied&seat=w&token=bad-token"
    );
    onlineHookMocks.useOnlineGameConnection.mockReturnValue({
      status: "access-denied",
      lastError: "Invite link expired.",
      submitAction: onlineHookMocks.submitAction,
    });

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("Access denied: Invite link expired.");
  });

  it("lets users recover from a failed pre-snapshot online connection", () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_denied&seat=w&token=bad-token"
    );
    onlineHookMocks.useOnlineGameConnection.mockReturnValue({
      status: "access-denied",
      lastError: "Invite link expired.",
      submitAction: onlineHookMocks.submitAction,
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));

    expect(screen.getByText("Setup Ready")).toBeInTheDocument();
    expect(window.location.search).not.toContain("onlineGame=");
    expect(window.location.search).not.toContain("token=");
  });

  it("uses shared navigation on failed pre-snapshot online connections", () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_denied&seat=w&token=bad-token"
    );
    onlineHookMocks.useOnlineGameConnection.mockReturnValue({
      status: "access-denied",
      lastError: "Invite link expired.",
      submitAction: onlineHookMocks.submitAction,
    });
    localStorage.setItem("castles_autosave", "stale autosave");
    sessionStorage.setItem("castles_online_join:game_denied:w", "bad-token");
    sessionStorage.setItem(
      "castles_online_opponent_invite:game_denied",
      "https://castles.example/?onlineGame=game_denied&seat=b&token=black-token"
    );

    render(<App />);

    expect(screen.getByRole("navigation", { name: "Online game navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Learn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Watch" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();
    expect(window.location.search).not.toContain("onlineGame=");
    expect(window.location.search).not.toContain("token=");
    expect(localStorage.getItem("castles_autosave")).toBeNull();
    expect(sessionStorage.getItem("castles_online_join:game_denied:w")).toBeNull();
    expect(sessionStorage.getItem("castles_online_opponent_invite:game_denied")).toBeNull();
  });

  it("wraps long pre-snapshot online errors in the online state layout", () => {
    const longError = "This invite cannot be opened because the server rejected the bearer token after a long reconnect attempt. Ask for a fresh invite link.";
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_long_error&seat=b&token=bad-token"
    );
    onlineHookMocks.useOnlineGameConnection.mockReturnValue({
      status: "access-denied",
      lastError: longError,
      submitAction: onlineHookMocks.submitAction,
    });

    render(<App />);

    const status = screen.getByRole("status");
    expect(status).toHaveClass("online-state-status");
    expect(status).toHaveTextContent(`Access denied: ${longError}`);
  });

  it("seeds public player visibility and wires updates through the bearer-authorized client helper", async () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_visible_player&seat=w&token=white-token"
    );
    const summary = {
      schemaVersion: 1,
      gameId: "game_visible_player",
      rulesetVersion: "castles-beta-v1",
      createdAt: "2026-05-31T12:00:00.000Z",
      updatedAt: "2026-05-31T12:00:01.000Z",
      version: 0,
      status: "active",
      visibility: "public",
      archiveState: "active",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_game_visible_player_w" } },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_game_visible_player_b" } },
      ],
      lastEventId: "evt-visibility",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ games: [summary] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            summary: {
              ...summary,
              visibility: "unlisted",
              updatedAt: "2026-05-31T12:00:02.000Z",
              lastEventId: "evt-unlist",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const playerCallback = onlineHookMocks.useOnlineGameConnection.mock.calls.at(-1)?.[1];
    act(() => {
      playerCallback(spectatorSnapshot("game_visible_player"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/online/games");
    });
    expect(screen.getByText("Online session: player")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Online visibility: public")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Mock Unlist Current Game" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/online/games/game_visible_player/visibility", {
        method: "PATCH",
        headers: {
          authorization: "Bearer white-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "unlisted" }),
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Online visibility: unlisted")).toBeInTheDocument();
    });
  });

  it("shows access denied for an invalid challenge link", async () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineChallenge=challenge_denied&challengeRole=challenged#challengeToken=bad-token"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "not_found", message: "No challenge." } }),
          { status: 404, headers: { "content-type": "application/json" } }
        )
      )
    );

    render(<App />);

    expect(await screen.findByRole("status")).toHaveTextContent("Access denied");
    expect(window.location.hash).not.toContain("challengeToken=");
  });

  it("shows challenged players accept and decline actions", async () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineChallenge=challenge_123&challengeRole=challenged#challengeToken=secret"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            role: "challenged",
            summary: {
              schemaVersion: 1,
              challengeId: "challenge_123",
              challengerIdentity: { kind: "session", id: "challenge_123_challenger" },
              challengedIdentity: { kind: "session", id: "challenge_123_challenged" },
              challengerSeat: "w",
              visibility: "unlisted",
              setup: { board: { config: { nSquares: 6 }, castles: [] }, pieces: [], sanctuaries: [] },
              createdAt: "2026-06-01T12:00:00.000Z",
              updatedAt: "2026-06-01T12:00:00.000Z",
              expiresAt: "2026-06-02T12:00:00.000Z",
              status: "pending",
              lastEventId: "challenge_evt_created",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    render(<App />);

    expect(await screen.findByRole("button", { name: "Accept Challenge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline Challenge" })).toBeInTheDocument();
  });

  it("shows challengers refresh and cancel actions", async () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineChallenge=challenge_123&challengeRole=challenger#challengeToken=secret"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            role: "challenger",
            summary: {
              schemaVersion: 1,
              challengeId: "challenge_123",
              challengerIdentity: { kind: "session", id: "challenge_123_challenger" },
              challengedIdentity: { kind: "session", id: "challenge_123_challenged" },
              challengerSeat: "w",
              visibility: "unlisted",
              setup: { board: { config: { nSquares: 6 }, castles: [] }, pieces: [], sanctuaries: [] },
              createdAt: "2026-06-01T12:00:00.000Z",
              updatedAt: "2026-06-01T12:00:00.000Z",
              expiresAt: "2026-06-02T12:00:00.000Z",
              status: "pending",
              lastEventId: "challenge_evt_created",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    render(<App />);

    expect(await screen.findByRole("button", { name: "Refresh Challenge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel Challenge" })).toBeInTheDocument();
  });

  it("uses shared navigation on challenge screens", async () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineChallenge=challenge_123&challengeRole=challenger#challengeToken=secret"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            role: "challenger",
            summary: {
              schemaVersion: 1,
              challengeId: "challenge_123",
              challengerIdentity: { kind: "session", id: "challenge_123_challenger" },
              challengedIdentity: { kind: "session", id: "challenge_123_challenged" },
              challengerSeat: "w",
              visibility: "unlisted",
              setup: { board: { config: { nSquares: 6 }, castles: [] }, pieces: [], sanctuaries: [] },
              createdAt: "2026-06-01T12:00:00.000Z",
              updatedAt: "2026-06-01T12:00:00.000Z",
              expiresAt: "2026-06-02T12:00:00.000Z",
              status: "pending",
              lastEventId: "challenge_evt_created",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    render(<App />);

    expect(await screen.findByRole("navigation", { name: "Challenge navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Learn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Watch" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Watch" }));

    expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();
  });
});
