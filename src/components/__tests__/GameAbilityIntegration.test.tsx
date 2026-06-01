import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import GameBoard from "../Game";
import { Hex } from "../../Classes/Entities/Hex";
import { PieceFactory } from "../../Classes/Entities/PieceFactory";
import { PGNService } from "../../Classes/Services/PGNService";
import { PieceType } from "../../Constants";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
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
    expect(await screen.findByRole("status")).toHaveTextContent("Opponent invite link copied.");
    expect(alert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy Spectator Link" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "https://castles.example/?onlineGame=game_share_split&view=spectator"
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Spectator link copied.");
    expect(alert).not.toHaveBeenCalled();
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

  test("online New Game requires confirmation even before the first move", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
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
    fireEvent.click(within(screen.getByText("Play").closest(".hamburger-menu") as HTMLElement).getByRole("button", { name: "New Game" }));

    expect(confirm).toHaveBeenCalledWith("Leave this online game and start a new game?");
    expect(onSetup).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(within(screen.getByText("Play").closest(".hamburger-menu") as HTMLElement).getByRole("button", { name: "New Game" }));

    expect(onSetup).toHaveBeenCalledOnce();
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
});
