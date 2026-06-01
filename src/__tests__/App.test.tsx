import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { SanctuaryType } from "../Constants";
import { getStartingBoard, getStartingPieces } from "../ConstantImports";
import { MoveTree } from "../Classes/Core/MoveTree";
import * as PGNLoadService from "../Classes/Services/PGNLoadService";
import type { OnlineGameSnapshotDTO } from "../online/types";
import {
  ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
  type OpenSeekSummary,
} from "../online/seeks";
import { rememberOpenSeekCreatorParams } from "../online/client";

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
    onRestart: () => void;
    onTutorial: () => void;
    onOpenLibrary: () => void;
    onOpenOnlineBrowser: () => void;
    onSaveGameToLibrary?: (pgn: string, status: "ongoing" | "complete" | "analysis") => Promise<unknown> | unknown;
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
      <button type="button" onClick={props.onRestart}>
        Mock Restart Game
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
      {props.onSaveGameToLibrary && (
        <button
          type="button"
          onClick={() =>
            void props.onSaveGameToLibrary?.(
              '[Event "Castles"]\n[White "White"]\n[Black "Black"]\n[Result "*"]\n\n1. Pass *',
              "ongoing"
            )
          }
        >
          Mock Save Game
        </button>
      )}
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
    onCreateOpenSeek,
  }: {
    onBack: () => void;
    backLabel?: string;
    onTutorial: () => void;
    onOpenLibrary: () => void;
    onOpenOnlineBrowser: () => void;
    onCreateOpenSeek?: (...args: unknown[]) => void;
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
      {onCreateOpenSeek && (
        <button
          type="button"
          onClick={() =>
            onCreateOpenSeek(
              { config: { nSquares: 6 }, castles: [] },
              [],
              { initial: 20, increment: 20 },
              [],
              [],
              { unlockTurn: 0, cooldown: 10 },
              { vpModeEnabled: true },
              [],
              "Castles"
            )
          }
        >
          Create Lobby Seek
        </button>
      )}
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
    initialTab,
    onCreateSeek,
    onAcceptSeek,
    onCancelSeek,
    ownedSeekIds = [],
    ownedSeekResponse,
    onRefreshOwnedSeek,
    onJoinOwnedSeek,
    backLabel = "Back to game",
  }: {
    onBack: () => void;
    onOpenGame?: () => void;
    onTutorial?: () => void;
    onOpenLibrary?: () => void;
    onReplay: (gameId: string) => void;
    onSpectate: (gameId: string) => void;
    initialTab?: string;
    onCreateSeek?: () => void;
    onAcceptSeek?: (seekId: string) => void;
    onCancelSeek?: (seekId: string) => void;
    ownedSeekIds?: string[];
    ownedSeekResponse?: { summary: { status: string } };
    onRefreshOwnedSeek?: () => void;
    onJoinOwnedSeek?: () => void;
    backLabel?: string;
  }) => (
    <div>
      <div>Online Browser Ready</div>
      <div>Initial tab: {initialTab ?? "none"}</div>
      <div>Owned seek ids: {ownedSeekIds.join(",") || "none"}</div>
      <div>Owned seek status: {ownedSeekResponse?.summary.status ?? "none"}</div>
      <button type="button" onClick={onBack}>
        {backLabel}
      </button>
      {onCreateSeek && (
        <button type="button" onClick={onCreateSeek}>
          Browser Create Seek
        </button>
      )}
      {onAcceptSeek && (
        <button type="button" onClick={() => onAcceptSeek("seek_public_open")}>
          Accept open seek
        </button>
      )}
      {onCancelSeek && (
        <button type="button" onClick={() => onCancelSeek("seek_public_open")}>
          Cancel open seek
        </button>
      )}
      {onRefreshOwnedSeek && (
        <button type="button" onClick={onRefreshOwnedSeek}>
          Refresh owned seek
        </button>
      )}
      {onJoinOwnedSeek && (
        <button type="button" onClick={onJoinOwnedSeek}>
          Join accepted seek
        </button>
      )}
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
    onLoadGame,
    backLabel = "Back to game",
  }: {
    onBack: () => void;
    onOpenGame?: () => void;
    onTutorial?: () => void;
    onLoadGame?: (record: { pgn: string }) => void;
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
      {onLoadGame && (
        <button type="button" onClick={() => onLoadGame({ pgn: "bad-pgn-for-test" })}>
          Load Saved Test Game
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

function openSeekSummary(overrides: Partial<OpenSeekSummary> = {}): OpenSeekSummary {
  return {
    schemaVersion: ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
    seekId: "seek_from_setup",
    creatorIdentity: { kind: "session", id: "creator-session" },
    creatorSeat: "w",
    setup: {
      board: { config: { nSquares: 6 }, castles: [] },
      pieces: [],
      sanctuaries: [],
      timeControl: { initial: 20, increment: 20 },
      gameRules: { vpModeEnabled: true },
      initialPoolTypes: [SanctuaryType.WolfCovenant],
      pieceTheme: "Castles",
    },
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-01T12:20:00.000Z",
    status: "open",
    lastEventId: "seek_evt_created",
    ...overrides,
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
    vi.restoreAllMocks();
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
    vi.spyOn(PGNLoadService, "loadPGNText").mockReturnValue({
      board: getStartingBoard(6),
      pieces: getStartingPieces(6),
      turnCounter: 3,
      sanctuaries: [],
      moveTree: new MoveTree(),
      sanctuaryPool: [],
    } as any);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Load Saved Test Game" }));
    expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Watch Tutorial" }));
    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tutorial Play" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
    expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Library Play" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
    expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument();
  });

  it("clears stale return paths after loading a saved game from a nested library", async () => {
    vi.spyOn(PGNLoadService, "loadPGNText").mockReturnValue({
      board: getStartingBoard(6),
      pieces: getStartingPieces(6),
      turnCounter: 2,
      sanctuaries: [],
      moveTree: new MoveTree(),
      sanctuaryPool: [],
    } as any);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Watch Library" }));
    expect(screen.getByText("Library Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load Saved Test Game" }));

    expect(screen.getByText("Game Ready")).toBeInTheDocument();
    expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Tutorial" }));

    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Watch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Library" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));

    expect(screen.getByText("Game Ready")).toBeInTheDocument();
  });

  it("opens an in-app save dialog instead of the browser prompt and cancels without saving", async () => {
    const promptSpy = vi.spyOn(window, "prompt");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mock Save Game" }));

    const dialog = await screen.findByRole("dialog", { name: "Save game" });
    expect(dialog).toContainElement(screen.getByLabelText("Save name"));
    expect(promptSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Save game" })).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("castles_game_library_records")).toBeNull();
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("saves a named game from the dialog and reports the Library path", async () => {
    vi.stubGlobal("indexedDB", undefined);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mock Save Game" }));
    const input = await screen.findByLabelText("Save name");
    fireEvent.change(input, { target: { value: "Opening study" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to Library" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Save game" })).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("castles_game_library_records")).toContain("Opening study");
  });

  it("keeps save failures in the app dialog", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const realSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (_key: string, _value: string) {
      const key = _key;
      const value = _value;
      if (key === "castles_game_library_records") {
        throw new Error("Storage quota exceeded");
      }
      return realSetItem.call(window.localStorage, key, value);
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Mock Save Game" }));
    fireEvent.change(await screen.findByLabelText("Save name"), { target: { value: "Blocked save" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to Library" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save game. Try again.");
    expect(screen.getByRole("dialog", { name: "Save game" })).toBeInTheDocument();

    setItem.mockRestore();
  });

  it("settles duplicate save requests when a save dialog is already open", async () => {
    render(<App />);

    const opener = screen.getByRole("button", { name: "Mock Save Game" });
    fireEvent.click(opener);
    expect(await screen.findByRole("dialog", { name: "Save game" })).toBeInTheDocument();

    fireEvent.click(opener);

    expect(screen.getAllByRole("dialog", { name: "Save game" })).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Finish or cancel the current save before starting another.");
  });

  it("treats the save dialog as a modal with Escape close, focus trap, and background inerting", async () => {
    render(<App />);

    const opener = screen.getByRole("button", { name: "Mock Save Game" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", { name: "Save game" });
    const input = screen.getByLabelText("Save name");

    expect(input).toHaveFocus();
    expect(opener.closest("[aria-hidden='true']")).not.toBeNull();
    expect(opener.closest("[inert]")).not.toBeNull();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Save to Library" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Save game" })).not.toBeInTheDocument();
    });
    expect(opener.closest("[aria-hidden='true']")).toBeNull();
    expect(opener.closest("[inert]")).toBeNull();
    expect(opener).toHaveFocus();
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

  it("creates open lobby seeks from setup without putting creator tokens in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          seekId: "seek_from_setup",
          summary: openSeekSummary(),
          creator: { token: "creator-token" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Lobby Seek" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/online/seeks",
        expect.objectContaining({ method: "POST" })
      );
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.creatorSeat).toBe("random");
    expect(body.creatorSessionId).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("creator-token");
    expect(sessionStorage.getItem("castles_online_seek_creator:seek_from_setup")).toBe("creator-token");
    expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();
    expect(screen.getByText("Initial tab: lobby")).toBeInTheDocument();
    expect(screen.getByText("Owned seek ids: seek_from_setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
    expect(window.location.search).not.toContain("token=");
    expect(window.location.search).not.toContain("onlineChallenge=");
    expect(window.location.hash).toBe("");
  });

  it("recovers creator-owned open seek controls after a same-session reload", async () => {
    rememberOpenSeekCreatorParams({ seekId: "seek_restore", token: "creator-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            role: "creator",
            summary: openSeekSummary({ seekId: "seek_restore" }),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    render(<App />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/online/seeks/seek_restore",
        { headers: { authorization: "Bearer creator-token" } }
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));

    expect(screen.getByText("Owned seek ids: seek_restore")).toBeInTheDocument();
    expect(screen.getByText("Owned seek status: open")).toBeInTheDocument();
  });

  it("accepts open lobby seeks through the normal token-stripped game handoff", async () => {
    const acceptedSummary = openSeekSummary({
      status: "accepted",
      updatedAt: "2026-06-01T12:04:00.000Z",
      acceptedAt: "2026-06-01T12:04:00.000Z",
      acceptedBy: { kind: "session", id: "acceptor-session" },
      gameId: "game_seek_accepted",
      whiteIdentity: { kind: "session", id: "creator-session" },
      blackIdentity: { kind: "session", id: "acceptor-session" },
      lastEventId: "seek_evt_accepted",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          role: "acceptor",
          summary: acceptedSummary,
          gameInvite: {
            gameId: "game_seek_accepted",
            seat: "b",
            token: "acceptor-token",
            url: "https://castles.example/?onlineGame=game_seek_accepted&seat=b&token=acceptor-token",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept open seek" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/online/seeks/seek_public_open/accept",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(sessionStorage.getItem("castles_online_join:game_seek_accepted:b")).toBe("acceptor-token");
    expect(window.location.search).toContain("onlineGame=game_seek_accepted");
    expect(window.location.search).toContain("seat=b");
    expect(window.location.search).not.toContain("token=");
    expect(window.location.search).not.toContain("onlineChallenge=");
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent("Connecting online game");
  });

  it("lets creators refresh an accepted lobby seek and join through the token-stripped handoff", async () => {
    const acceptedSummary = openSeekSummary({
      status: "accepted",
      updatedAt: "2026-06-01T12:04:00.000Z",
      acceptedAt: "2026-06-01T12:04:00.000Z",
      acceptedBy: { kind: "session", id: "acceptor-session" },
      gameId: "game_creator_join",
      whiteIdentity: { kind: "session", id: "creator-session" },
      blackIdentity: { kind: "session", id: "acceptor-session" },
      lastEventId: "seek_evt_accepted",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            seekId: "seek_from_setup",
            summary: openSeekSummary(),
            creator: { token: "creator-token" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            role: "creator",
            summary: acceptedSummary,
            gameInvite: {
              gameId: "game_creator_join",
              seat: "w",
              token: "creator-token",
              url: "https://castles.example/?onlineGame=game_creator_join&seat=w&token=creator-token",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Lobby Seek" }));
    await screen.findByText("Initial tab: lobby");

    fireEvent.click(screen.getByRole("button", { name: "Refresh owned seek" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/online/seeks/seek_from_setup",
        { headers: { authorization: "Bearer creator-token" } }
      );
    });
    expect(await screen.findByText("Owned seek status: accepted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Join accepted seek" }));

    expect(sessionStorage.getItem("castles_online_join:game_creator_join:w")).toBe("creator-token");
    expect(window.location.search).toContain("onlineGame=game_creator_join");
    expect(window.location.search).toContain("seat=w");
    expect(window.location.search).not.toContain("token=");
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

  it("clears stale return paths after Watch spectate, replay, Play, and restart entries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          snapshot: spectatorSnapshot("game_archive_public"),
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Watch Tutorial" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Spectate public game" }));

    const spectatorCallback = onlineHookMocks.useOnlineSpectatorConnection.mock.calls.at(-1)?.[1];
    act(() => {
      spectatorCallback(spectatorSnapshot("game_watch_public"));
    });
    expect(screen.getByText("Online session: spectator")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Tutorial" }));
    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Watch" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));

    fireEvent.click(screen.getByRole("button", { name: "Open Watch" }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze archived game" }));
    await waitFor(() => expect(screen.getByText("Analysis mode: yes")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Mock Restart Game" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Tutorial" }));
    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Watch" })).not.toBeInTheDocument();
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

    const nav = screen.getByRole("navigation", { name: "Online game navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());
    expect(nav).toBeInTheDocument();
    expect(destinations).toEqual(["Play", "Learn", "Watch", "Library"]);
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
          JSON.stringify({ schemaVersion: 1, games: [summary] }),
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
