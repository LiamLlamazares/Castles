import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import GameBoard from "../Game";
import { Hex } from "../../Classes/Entities/Hex";
import { PieceFactory } from "../../Classes/Entities/PieceFactory";
import { PieceType } from "../../Constants";
import { createM5L2 } from "../../tutorial/lessons/m5_02_wolf";
import { createM5L5 } from "../../tutorial/lessons/m5_05_wizard";
import { ThemeProvider } from "../../contexts/ThemeContext";

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
    localStorage.setItem("hasSeenTooltipHint", "true");
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
  });

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
});
