import { fireEvent, render, screen } from "@testing-library/react";
import GameBoard from "../Game";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../../Classes/Services/AssetRegistry", () => ({
  getAssetUrl: (_theme: string, color: string, type: string) => `${color}${type}.svg`,
}));

describe("Game quick start", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("hasSeenTooltipHint", "true");
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a first-run tutorial recommendation from the game", async () => {
    const onTutorial = vi.fn();
    render(
      <ThemeProvider>
        <GameBoard onTutorial={onTutorial} />
      </ThemeProvider>
    );

    expect(await screen.findByRole("heading", { name: /Welcome to Castles/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Start Tutorial/ }));

    expect(onTutorial).toHaveBeenCalledOnce();
    expect(localStorage.getItem("hasSeenQuickStart")).toBe("true");
  });

  it("still shows the first-run recommendation when storage reads are blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => {
      if (key === "hasSeenQuickStart") {
        throw new DOMException("blocked", "SecurityError");
      }
      return null;
    });

    render(
      <ThemeProvider>
        <GameBoard onTutorial={vi.fn()} />
      </ThemeProvider>
    );

    expect(await screen.findByRole("heading", { name: /Welcome to Castles/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Tutorial/ })).toBeInTheDocument();
  });
});
