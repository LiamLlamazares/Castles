import { fireEvent, render, screen } from "@testing-library/react";
import Tutorial from "../Tutorial";
import GameBoard from "../Game";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../Game", () => ({
  default: vi.fn(() => <div data-testid="tutorial-board" />),
}));

vi.mock("../PieceImages", () => ({
  getImageByPieceType: () => "test-piece.svg",
}));

describe("Tutorial", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(GameBoard).mockClear();
  });

  it("uses a tutorial-specific shell without the nested game menu", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-board")).toBeInTheDocument();
    expect(GameBoard).toHaveBeenCalled();
    expect(vi.mocked(GameBoard).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        isTutorialMode: true,
        showNavigationMenu: false,
        showTooltipHint: false,
      })
    );
  });

  it("uses the provided back label", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} backLabel="Back to setup" />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "Back to setup" })).toBeInTheDocument();
  });

  it("persists lesson progress when the tutorial is reopened", () => {
    const { unmount } = render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByText("1 / 35")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("2 / 35")).toBeInTheDocument();
    expect(localStorage.getItem("castles_tutorial_lesson_index")).toBe("1");

    unmount();

    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByText("2 / 35")).toBeInTheDocument();
  });

  it("updates persisted progress when jumping through lesson shortcuts", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: "Castles" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rivers" }));

    expect(localStorage.getItem("castles_tutorial_lesson_index")).toBe("3");
    expect(vi.mocked(GameBoard).mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        isTutorialMode: true,
        showNavigationMenu: false,
      })
    );
  });

  it("keeps working when tutorial progress storage is unavailable", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => {
      if (key === "castles_tutorial_lesson_index") {
        throw new DOMException("blocked", "SecurityError");
      }
      return null;
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string) => {
      if (key === "castles_tutorial_lesson_index") {
        throw new DOMException("blocked", "SecurityError");
      }
    });

    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("2 / 35")).toBeInTheDocument();
    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalled();
  });
});
