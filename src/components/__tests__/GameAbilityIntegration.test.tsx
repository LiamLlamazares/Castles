import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GameBoard from "../Game";
import { MoveTree } from "../../Classes/Core/MoveTree";
import { Hex } from "../../Classes/Entities/Hex";
import { PieceFactory } from "../../Classes/Entities/PieceFactory";
import { Sanctuary } from "../../Classes/Entities/Sanctuary";
import { PGNService } from "../../Classes/Services/PGNService";
import { PieceType, SanctuaryType, type MoveRecord } from "../../Constants";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { createPieceMap } from "../../utils/PieceMap";
import { createM5L2 } from "../../tutorial/lessons/m5_02_wolf";
import { createM5L5 } from "../../tutorial/lessons/m5_05_wizard";
import { ThemeProvider } from "../../contexts/ThemeContext";

const INTEGRATION_TIMEOUT_MS = 20_000;
let originalClipboardDescriptor: PropertyDescriptor | undefined;

vi.mock("../../Classes/Services/AssetRegistry", () => ({
  getAssetUrl: (_theme: string, color: string, type: string) => `${color}${type}.svg`,
}));

const getPieceImage = (container: HTMLElement, assetName: string): SVGImageElement => {
  const image = Array.from(container.querySelectorAll("image")).find((element) => {
    const href = element.getAttribute("href") || "";
    const width = Number(element.getAttribute("width") || 0);
    return href.includes(assetName) && width > 40;
  });

  if (!image) {
    throw new Error(`Could not find full-size piece image for ${assetName}`);
  }

  return image as SVGImageElement;
};

const getHexPolygon = (
  container: HTMLElement,
  lesson: ReturnType<typeof createM5L5>,
  hex: Hex
): SVGPolygonElement => {
  const expectedPoints = lesson.layout.hexCornerString[hex.reflect().getKey(true)];
  const polygon = Array.from(container.querySelectorAll("polygon")).find(
    (element) => element.getAttribute("points") === expectedPoints
  );

  if (!polygon) {
    throw new Error(`Could not find polygon for ${hex.getKey()}`);
  }

  return polygon as SVGPolygonElement;
};

function createSnapshot(
  turnCounter: number,
  sanctuary: Sanctuary,
  pool: SanctuaryType[],
  victoryPoints?: { w: number; b: number }
) {
  const pieces = getStartingPieces(6);
  return {
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: getStartingBoard(6).castles,
    sanctuaries: [sanctuary],
    sanctuaryPool: pool,
    turnCounter,
    graveyard: [],
    phoenixRecords: [],
    victoryPoints,
  };
}

function moveRecord(notation: string, turnNumber: number): MoveRecord {
  return {
    notation,
    turnNumber,
    color: "w",
    phase: "Movement",
  };
}

describe("Game ability integration", () => {
  beforeEach(() => {
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    localStorage.clear();
    localStorage.setItem("hasSeenTooltipHint", "true");
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(console, "log").mockImplementation(() => {});
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
    window.history.replaceState({}, "", "/");
  });

  test("Teleport selected from the HUD is used by board clicks", async () => {
    const lesson = createM5L5();
    const teleportTarget = new Hex(-3, 1, 2);
    const targetCenter = lesson.layout.hexCenters[teleportTarget.getKey(false)];

    const { container } = render(
      <ThemeProvider>
        <GameBoard
          initialBoard={lesson.board}
          initialPieces={lesson.pieces}
          initialLayout={lesson.layout}
          initialTurnCounter={lesson.initialTurnCounter}
          isTutorialMode
        />
      </ThemeProvider>
    );

    fireEvent.click(getPieceImage(container, "wWizard"));
    fireEvent.click(screen.getByRole("button", { name: "Teleport" }));

    expect(screen.getByRole("button", { name: "TARGETING..." })).toBeInTheDocument();
    const abilityDots = Array.from(container.querySelectorAll("circle.legalAbilityDot"));
    expect(abilityDots.length).toBeGreaterThan(0);
    expect(
      abilityDots.some((dot) => (
        Number(dot.getAttribute("cx")) === targetCenter.x &&
        Number(dot.getAttribute("cy")) === targetCenter.y
      ))
    ).toBe(true);

    fireEvent.click(getHexPolygon(container, lesson, teleportTarget));

    await waitFor(() => {
      const wizard = getPieceImage(container, "wWizard");
      expect(Number(wizard.getAttribute("x"))).toBeCloseTo(targetCenter.x - lesson.layout.size_image / 2);
      expect(Number(wizard.getAttribute("y"))).toBeCloseTo(targetCenter.y - lesson.layout.size_image / 2);
    });
  }, INTEGRATION_TIMEOUT_MS);

  test("piece tooltip shows context combat strength for adjacent Wolves", async () => {
    const lesson = createM5L2();
    const pieces = [
      PieceFactory.create(PieceType.Wolf, new Hex(-1, 0, 1), "w"),
      PieceFactory.create(PieceType.Wolf, new Hex(-1, 1, 0), "w"),
      PieceFactory.create(PieceType.Giant, new Hex(0, 0, 0), "b"),
    ];

    const { container } = render(
      <ThemeProvider>
        <GameBoard
          initialBoard={lesson.board}
          initialPieces={pieces}
          initialLayout={lesson.layout}
          initialTurnCounter={2}
          isTutorialMode
        />
      </ThemeProvider>
    );

    fireEvent.contextMenu(getPieceImage(container, "wWolf"));

    await waitFor(() => {
      expect(container.textContent?.replace(/\s/g, "")).toContain("Strength:2");
      expect(container.textContent?.replace(/\s/g, "")).toContain("PackBonus");
    });
  });

  test("Swordsman tooltip labels healer strength as aura, not river", async () => {
    const lesson = createM5L2();
    const pieces = [
      PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), "w"),
      PieceFactory.create(PieceType.Healer, new Hex(0, 1, -1), "w"),
      PieceFactory.create(PieceType.Giant, new Hex(0, 0, 0), "b"),
    ];

    const { container } = render(
      <ThemeProvider>
        <GameBoard
          initialBoard={lesson.board}
          initialPieces={pieces}
          initialLayout={lesson.layout}
          initialTurnCounter={2}
          isTutorialMode
        />
      </ThemeProvider>
    );

    fireEvent.contextMenu(getPieceImage(container, "wSwordsman"));

    await waitFor(() => {
      const text = container.textContent?.replace(/\s/g, "") ?? "";
      expect(text).toContain("Strength:2");
      expect(text).toContain("AuraBonus");
      expect(text).not.toContain("RiverBonus");
    });
  });

  test("online sessions ignore local shared-game and autosave restore", () => {
    const savedPgn = PGNService.generatePGN(
      getStartingBoard(5),
      getStartingPieces(5),
      [],
      []
    );
    localStorage.setItem("castles_autosave", savedPgn);
    window.history.replaceState({}, "", `/?pgn=${encodeURIComponent(savedPgn)}`);
    const onLoadGame = vi.fn();

    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_spectator",
            role: "spectator",
            version: 0,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_spectator&view=spectator",
          }}
          onLoadGame={onLoadGame}
        />
      </ThemeProvider>
    );

    expect(onLoadGame).not.toHaveBeenCalled();
  });

  test("online player screens expose separate opponent invite and spectator copy actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_share_split",
            role: "player",
            playerColor: "w",
            version: 0,
            status: "connected",
            opponentInviteUrl: "https://castles.example/?onlineGame=game_share_split&seat=b&token=black-token",
            spectatorUrl: "https://castles.example/?onlineGame=game_share_split&view=spectator",
            submitAction: vi.fn(),
          }}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Opponent Invite" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "https://castles.example/?onlineGame=game_share_split&seat=b&token=black-token"
      );
    });
    expect(await screen.findByText("Opponent invite link copied.")).toBeInTheDocument();
    expect(alert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy Spectator Link" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "https://castles.example/?onlineGame=game_share_split&view=spectator"
      );
    });
    expect(await screen.findByText("Spectator link copied.")).toBeInTheDocument();
    expect(alert).not.toHaveBeenCalled();
  }, INTEGRATION_TIMEOUT_MS);

  test("online player screens publish and unlist the current game with local feedback", async () => {
    const updateVisibility = vi
      .fn()
      .mockResolvedValueOnce({
        gameId: "game_publish_ui",
        visibility: "public",
      })
      .mockResolvedValueOnce({
        gameId: "game_publish_ui",
        visibility: "unlisted",
      });

    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_publish_ui",
            role: "player",
            playerColor: "w",
            version: 0,
            status: "connected",
            visibility: "unlisted",
            spectatorUrl: "https://castles.example/?onlineGame=game_publish_ui&view=spectator",
            submitAction: vi.fn(),
            updateVisibility,
          } as any}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish Game to Watch" }));

    await waitFor(() => {
      expect(updateVisibility).toHaveBeenCalledWith("public");
    });
    expect(await screen.findByText("Game published to Watch.")).toBeInTheDocument();
    const unlistButton = screen.getByRole("button", { name: "Remove Game from Watch" });

    fireEvent.click(unlistButton);

    await waitFor(() => {
      expect(updateVisibility).toHaveBeenCalledWith("unlisted");
    });
    expect(await screen.findByText("Game removed from Watch.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish Game to Watch" })).toBeInTheDocument();
  }, INTEGRATION_TIMEOUT_MS);

  test("opening the navigation drawer suppresses the tooltip hint to prevent overlap", () => {
    localStorage.removeItem("hasSeenTooltipHint");

    render(
      <ThemeProvider>
        <GameBoard />
      </ThemeProvider>
    );

    expect(screen.getByText(/Right-click any piece or hex/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.queryByText(/Right-click any piece or hex/i)).not.toBeInTheDocument();
  });

  test("online New Game requires an in-app confirmation even before the first move", () => {
    const confirm = vi.spyOn(window, "confirm");
    const onSetup = vi.fn();

    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_turn_zero",
            role: "player",
            playerColor: "w",
            version: 0,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_turn_zero&view=spectator",
            submitAction: vi.fn(),
          }}
          onSetup={onSetup}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Play" })).getByRole("button", { name: "Configure New Game" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Leave this online game?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep Playing" }));
    expect(onSetup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Play" })).getByRole("button", { name: "Configure New Game" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Game" }));

    expect(onSetup).toHaveBeenCalledOnce();
  });

  test("New Game confirmation traps focus and closes with Escape", async () => {
    const user = userEvent.setup();
    const onSetup = vi.fn();

    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_focus_trap",
            role: "player",
            playerColor: "w",
            version: 0,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_focus_trap&view=spectator",
            submitAction: vi.fn(),
          }}
          onSetup={onSetup}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Play" })).getByRole("button", { name: "Configure New Game" }));

    const dialog = screen.getByRole("dialog", { name: "Leave this online game?" });
    const keepPlaying = screen.getByRole("button", { name: "Keep Playing" });
    const leaveGame = screen.getByRole("button", { name: "Leave Game" });

    expect(dialog).toHaveAccessibleDescription(
      "Leave this game and configure a new one? Your current online seat or spectator view will be closed on this device."
    );

    await waitFor(() => expect(keepPlaying).toHaveFocus());

    await user.tab();
    expect(leaveGame).toHaveFocus();

    await user.tab();
    expect(keepPlaying).toHaveFocus();

    await user.tab({ shift: true });
    expect(leaveGame).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Leave this online game?" })).not.toBeInTheDocument();
    expect(onSetup).not.toHaveBeenCalled();
  });

  test("New Game confirmation returns focus to the menu button when cancelled from the drawer", async () => {
    const user = userEvent.setup();
    const onSetup = vi.fn();

    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_focus_restore",
            role: "player",
            playerColor: "w",
            version: 0,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_focus_restore&view=spectator",
            submitAction: vi.fn(),
          }}
          onSetup={onSetup}
        />
      </ThemeProvider>
    );

    const menuButton = screen.getByRole("button", { name: "Menu" });

    await user.click(menuButton);
    await user.click(within(screen.getByRole("region", { name: "Play" })).getByRole("button", { name: "Configure New Game" }));

    const keepPlaying = screen.getByRole("button", { name: "Keep Playing" });
    await waitFor(() => expect(keepPlaying).toHaveFocus());

    await user.click(keepPlaying);

    await waitFor(() => expect(menuButton).toHaveFocus());
    expect(onSetup).not.toHaveBeenCalled();
  });

  test("saving to the library reports success in the game shell", async () => {
    const onSaveGameToLibrary = vi.fn().mockResolvedValue(true);

    render(
      <ThemeProvider>
        <GameBoard onSaveGameToLibrary={onSaveGameToLibrary} />
      </ThemeProvider>
    );

    expect(screen.getByLabelText("Save status: Ready to save locally")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Game" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved to Library.");
    await waitFor(() => {
      expect(screen.getByLabelText("Save status: Saved to Library")).toBeInTheDocument();
    });
    expect(onSaveGameToLibrary).toHaveBeenCalledWith(expect.stringContaining("[Event"), "ongoing");
  });

  test("saving to the library can report the saved name and Library path", async () => {
    const onSaveGameToLibrary = vi.fn().mockResolvedValue({
      saved: true,
      message: 'Saved "Opening study" to Library.',
    });

    render(
      <ThemeProvider>
        <GameBoard onSaveGameToLibrary={onSaveGameToLibrary} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Game" }));

    expect(await screen.findByRole("status")).toHaveTextContent('Saved "Opening study" to Library.');
  });

  test("online games show local Library status before local named saves", () => {
    render(
      <ThemeProvider>
        <GameBoard
          onSaveGameToLibrary={vi.fn()}
          onlineSession={{
            gameId: "game_server_saved_chip",
            role: "player",
            playerColor: "w",
            version: 0,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_server_saved_chip&view=spectator",
            submitAction: vi.fn(),
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByLabelText("Save status: Not in Library")).toBeInTheDocument();
  });

  test("changing online games clears the local Library saved marker", async () => {
    const onSaveGameToLibrary = vi.fn().mockResolvedValue(true);
    const createSession = (gameId: string) => ({
      gameId,
      role: "player" as const,
      playerColor: "w" as const,
      version: 0,
      status: "connected" as const,
      spectatorUrl: `https://castles.example/?onlineGame=${gameId}&view=spectator`,
      submitAction: vi.fn(),
    });

    const { rerender } = render(
      <ThemeProvider>
        <GameBoard
          onSaveGameToLibrary={onSaveGameToLibrary}
          onlineSession={createSession("game_saved_marker_one")}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Game" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Save status: Saved to Library")).toBeInTheDocument();
    });

    rerender(
      <ThemeProvider>
        <GameBoard
          onSaveGameToLibrary={onSaveGameToLibrary}
          onlineSession={createSession("game_saved_marker_two")}
        />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Save status: Not in Library")).toBeInTheDocument();
    });
  });

  test("PGN export reports clipboard status in the app instead of using alerts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(
      <ThemeProvider>
        <GameBoard />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Export PGN" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("[Event"));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("PGN copied.");
    expect(alert).not.toHaveBeenCalled();
  });

  test("opening the navigation drawer hides status toasts to prevent overlap", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <ThemeProvider>
        <GameBoard />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Export PGN" }));

    expect(await screen.findByRole("status")).toHaveTextContent("PGN copied.");

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("PGN export reports clipboard failures in the app", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(
      <ThemeProvider>
        <GameBoard />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Export PGN" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Could not copy PGN.");
    expect(alert).not.toHaveBeenCalled();
  });

  test("online terminal games label the session as complete", () => {
    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_complete_label",
            role: "player",
            playerColor: "w",
            version: 1,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_complete_label&view=spectator",
            result: { winner: "w", reason: "resignation" },
            submitAction: vi.fn(),
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Online White · Complete · White wins by resignation")).toBeInTheDocument();
  });

  test("active online players do not get a drawer analysis escape hatch", () => {
    const onLoadGame = vi.fn();

    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_active_player_no_drawer_analysis",
            role: "player",
            playerColor: "w",
            version: 1,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_active_player_no_drawer_analysis&view=spectator",
            submitAction: vi.fn(),
          }}
          onLoadGame={onLoadGame}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.queryByRole("button", { name: "Analysis Board" })).not.toBeInTheDocument();
  });

  test("online spectator analysis opens from current state without PGN round trip", () => {
    const onLoadGame = vi.fn();
    const generatePGN = vi.spyOn(PGNService, "generatePGN");

    render(
      <ThemeProvider>
        <GameBoard
          initialBoard={getStartingBoard(6)}
          initialPieces={getStartingPieces(6)}
          onlineSession={{
            gameId: "game_online_analysis",
            role: "spectator",
            version: 2,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_online_analysis&view=spectator",
          }}
          onLoadGame={onLoadGame}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Analysis" }));

    expect(generatePGN).not.toHaveBeenCalled();
    expect(onLoadGame).toHaveBeenCalledOnce();
    expect(onLoadGame.mock.calls[0][1]).toEqual({ source: "analysis" });
    expect(onLoadGame.mock.calls[0][0]).toMatchObject({
      turnCounter: 0,
    });
    expect(onLoadGame.mock.calls[0][0].moveTree).toBeDefined();
  });

  test("analysis handoff uses the coherent viewed history snapshot", () => {
    const firstSanctuary = new Sanctuary(
      new Hex(-2, 1, 1),
      SanctuaryType.WolfCovenant,
      "w",
      "w"
    );
    const liveSanctuary = new Sanctuary(
      new Hex(2, -1, -1),
      SanctuaryType.SacredSpring,
      "b",
      "b"
    );
    const firstSnapshot = createSnapshot(
      1,
      firstSanctuary,
      [SanctuaryType.WolfCovenant],
      { w: 3, b: 1 }
    );
    const liveSnapshot = createSnapshot(
      2,
      liveSanctuary,
      [SanctuaryType.SacredSpring],
      { w: 7, b: 5 }
    );
    const moveTree = new MoveTree();
    moveTree.rootNode.snapshot = createSnapshot(0, firstSanctuary, []);
    moveTree.addMove(moveRecord("H12H11", 1), firstSnapshot);
    moveTree.addMove(moveRecord("G13G12", 1), liveSnapshot);
    const onLoadGame = vi.fn();

    render(
      <ThemeProvider>
        <GameBoard
          initialBoard={getStartingBoard(6)}
          initialPieces={liveSnapshot.pieces}
          initialMoveTree={moveTree}
          initialTurnCounter={2}
          initialSanctuaries={liveSnapshot.sanctuaries}
          initialPoolTypes={liveSnapshot.sanctuaryPool}
          onlineSession={{
            gameId: "game_history_analysis",
            role: "spectator",
            version: 2,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_history_analysis&view=spectator",
          }}
          onLoadGame={onLoadGame}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "1. H12H11" }));
    fireEvent.click(screen.getByRole("button", { name: "Analysis" }));

    expect(onLoadGame).toHaveBeenCalledOnce();
    expect(onLoadGame.mock.calls[0][0].turnCounter).toBe(1);
    expect(onLoadGame.mock.calls[0][0].sanctuaries[0].type).toBe(SanctuaryType.WolfCovenant);
    expect(onLoadGame.mock.calls[0][0].initialPoolTypes).toEqual([SanctuaryType.WolfCovenant]);
    expect(onLoadGame.mock.calls[0][0].victoryPoints).toEqual({ w: 3, b: 1 });
  });

  test("online sparse analysis handoff avoids broken historical navigation", () => {
    const onLoadGame = vi.fn();
    const moveTree = new MoveTree();
    moveTree.addMove(moveRecord("H12H11", 1));
    moveTree.current.snapshot = createSnapshot(
      1,
      new Sanctuary(new Hex(-2, 1, 1), SanctuaryType.WolfCovenant, "w"),
      [SanctuaryType.WolfCovenant]
    );

    render(
      <ThemeProvider>
        <GameBoard
          initialBoard={getStartingBoard(6)}
          initialPieces={getStartingPieces(6)}
          initialMoveTree={moveTree}
          initialTurnCounter={1}
          onlineSession={{
            gameId: "game_sparse_analysis",
            role: "spectator",
            version: 1,
            status: "connected",
            spectatorUrl: "https://castles.example/?onlineGame=game_sparse_analysis&view=spectator",
          }}
          onLoadGame={onLoadGame}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Analysis" }));

    const analysisTree = onLoadGame.mock.calls[0][0].moveTree as MoveTree;
    expect(analysisTree.rootNode.children).toHaveLength(0);
    expect(analysisTree.rootNode.snapshot?.turnCounter).toBe(1);
  });

  test("online session badges use readable state labels", () => {
    const { rerender } = render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_resyncing_label",
            role: "player",
            playerColor: "w",
            version: 1,
            status: "resyncing",
            spectatorUrl: "https://castles.example/?onlineGame=game_resyncing_label&view=spectator",
            submitAction: vi.fn(),
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Online White · Resyncing")).toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_pending_label",
            role: "player",
            playerColor: "w",
            version: 1,
            status: "connected",
            isActionPending: true,
            spectatorUrl: "https://castles.example/?onlineGame=game_pending_label&view=spectator",
            submitAction: vi.fn(),
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Online White · Waiting for server")).toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_access_denied_label",
            role: "spectator",
            version: 1,
            status: "access-denied",
            lastError: "This game no longer exists.",
            spectatorUrl: "https://castles.example/?onlineGame=game_access_denied_label&view=spectator",
          }}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByText("Spectating · Access denied · This game no longer exists.")
    ).toBeInTheDocument();
  });

  test("online session badges announce status changes", () => {
    render(
      <ThemeProvider>
        <GameBoard
          onlineSession={{
            gameId: "game_live_region",
            role: "player",
            playerColor: "w",
            version: 1,
            status: "resyncing",
            spectatorUrl: "https://castles.example/?onlineGame=game_live_region&view=spectator",
            submitAction: vi.fn(),
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("status")).toHaveTextContent("Online White · Resyncing");
  });
});
