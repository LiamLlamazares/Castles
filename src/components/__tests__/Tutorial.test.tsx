import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("uses a learn shell without the nested game menu", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} onOpenLibrary={vi.fn()} onOpenOnlineBrowser={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByRole("navigation", { name: "Learn navigation" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Learn navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());
    expect(destinations).toEqual(["Play", "Learn", "Online", "Library"]);
    expect(screen.getByRole("button", { name: "Learn" })).toHaveAttribute("aria-current", "page");
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

  it("keeps lesson progress and previous-next controls together near the top", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    const progressControls = screen.getByRole("group", { name: "Lesson progress controls" });
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Previous" }));
    expect(progressControls).toContainElement(screen.getByRole("status", { name: "Tutorial progress" }));
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Restart Tutorial" }));
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Next" }));
  });

  it("summarizes progress beside the lesson title and exposes a compact control strip", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    const lessonHeader = screen.getByRole("group", { name: "Current lesson" });
    expect(lessonHeader).toContainElement(screen.getByRole("heading", { level: 2 }));
    expect(lessonHeader).toContainElement(screen.getByText("Getting started"));
    expect(lessonHeader).toContainElement(screen.getByText("Lesson 1 of 35"));
    expect(lessonHeader).toContainElement(screen.getByText("Progress saved"));

    const controlStrip = screen.getByRole("toolbar", { name: "Lesson controls" });
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Previous" }));
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Restart Tutorial" }));
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Next" }));
  });

  it("labels the tutorial board stage as the lesson board", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByRole("region", { name: "Tutorial lesson board" })).toContainElement(screen.getByTestId("tutorial-board"));
  });

  it("persists lesson progress when the tutorial is reopened", () => {
    const { unmount } = render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 35");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("2 / 35");
    expect(localStorage.getItem("castles_tutorial_lesson_index")).toBe("1");

    unmount();

    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("2 / 35");
  });

  it("lets users restart persisted tutorial progress", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(localStorage.getItem("castles_tutorial_lesson_index")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Restart Tutorial" }));

    expect(localStorage.getItem("castles_tutorial_lesson_index")).toBe("0");
    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 35");
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

    expect(screen.getByRole("group", { name: "Terrain lessons" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Castles" })).toBeInTheDocument();
    expect(screen.getByText("Terrain")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rivers" }));

    expect(localStorage.getItem("castles_tutorial_lesson_index")).toBe("3");
    expect(vi.mocked(GameBoard).mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        isTutorialMode: true,
        showNavigationMenu: false,
      })
    );
  });

  it("labels piece lesson shortcuts when piece lessons are active", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    for (let i = 0; i < 7; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }

    expect(screen.getByRole("group", { name: "Piece lessons" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sword" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archer" })).toBeInTheDocument();
  });

  it("keeps working when tutorial progress storage is unavailable", async () => {
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

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("2 / 35");
    expect(screen.getByText("Session only")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Progress saved")).not.toBeInTheDocument();
    });
    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalled();
  });
});
