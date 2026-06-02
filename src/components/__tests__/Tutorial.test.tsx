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

const TUTORIAL_PROGRESS_KEY = "castles_tutorial_progress_v2";

function renderTutorial(overrides: Partial<React.ComponentProps<typeof Tutorial>> = {}) {
  return render(
    <ThemeProvider>
      <Tutorial onBack={vi.fn()} {...overrides} />
    </ThemeProvider>
  );
}

function readStoredProgress() {
  return JSON.parse(localStorage.getItem(TUTORIAL_PROGRESS_KEY) ?? "{}");
}

describe("Tutorial", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(GameBoard).mockClear();
  });

  it("uses a learn shell and opens to a course overview", () => {
    renderTutorial({ onOpenLibrary: vi.fn(), onOpenOnlineBrowser: vi.fn() });

    expect(screen.getByRole("navigation", { name: "Learn navigation" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Learn navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());
    expect(destinations).toEqual(["Play", "Learn", "Online", "Library"]);
    expect(screen.getByRole("button", { name: "Learn" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Learn Castles course" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Course progress" })).toHaveTextContent("0 / 35 lessons checked");
    expect(screen.queryByTestId("tutorial-board")).not.toBeInTheDocument();
  });

  it("uses the provided back label", () => {
    renderTutorial({ backLabel: "Back to setup" });

    expect(screen.getByRole("button", { name: "Back to setup" })).toBeInTheDocument();
  });

  it("starts the current lesson from the course overview without showing the nested game menu", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start course" }));

    expect(screen.getByRole("region", { name: "Tutorial lesson board" })).toContainElement(screen.getByTestId("tutorial-board"));
    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 35");
    expect(GameBoard).toHaveBeenCalled();
    expect(vi.mocked(GameBoard).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        isTutorialMode: true,
        showNavigationMenu: false,
        showTooltipHint: false,
      })
    );
  });

  it("keeps lesson progress and previous-next controls together near the top", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start course" }));

    const progressControls = screen.getByRole("group", { name: "Lesson progress controls" });
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Course" }));
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Previous" }));
    expect(progressControls).toContainElement(screen.getByRole("status", { name: "Tutorial progress" }));
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Restart Tutorial" }));
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Next" }));
  });

  it("summarizes progress beside the lesson title and exposes a compact control strip", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start course" }));

    const lessonHeader = screen.getByRole("group", { name: "Current lesson" });
    expect(lessonHeader).toContainElement(screen.getByRole("heading", { level: 2, name: "0 Welcome" }));
    expect(lessonHeader).toContainElement(screen.getByText("Getting started"));
    expect(lessonHeader).toContainElement(screen.getByText("Lesson 1 of 35"));
    expect(lessonHeader).toContainElement(screen.getByText("Progress saved"));

    const controlStrip = screen.getByRole("toolbar", { name: "Lesson controls" });
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Course" }));
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Previous" }));
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Restart Tutorial" }));
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Next" }));
  });

  it("persists the current lesson by stable lesson id", () => {
    const { unmount } = renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start course" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("2 / 35");
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        lastLessonId: "m0_01_victory_conditions",
        reviewedLessonIds: [],
      })
    );

    unmount();
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Continue course" }));
    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("2 / 35");
  });

  it("lets users return from a lesson to the course overview", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start course" }));
    fireEvent.click(screen.getByRole("button", { name: "Course" }));

    expect(screen.getByRole("main", { name: "Learn Castles course" })).toBeInTheDocument();
    expect(screen.queryByTestId("tutorial-board")).not.toBeInTheDocument();
  });

  it("stores objective checks and course review progress", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 0\.1 How to win/ }));
    fireEvent.click(screen.getByLabelText("Right-click both castles to confirm their controller."));

    expect(screen.getByRole("button", { name: "Checklist checked" })).toBeDisabled();
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        lastLessonId: "m0_01_victory_conditions",
        reviewedLessonIds: [],
        checkedObjectivesByLessonId: {
          m0_01_victory_conditions: [0],
        },
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Course" }));
    expect(screen.getByRole("status", { name: "Course progress" })).toHaveTextContent("1 / 35 lessons checked");
    expect(screen.getByRole("button", { name: /Open 0\.1 How to win\. Checklist checked/ })).toHaveTextContent("Checked");
  });

  it("derives reviewed state from checked objectives instead of trusting stale stored flags", () => {
    localStorage.setItem(
      TUTORIAL_PROGRESS_KEY,
      JSON.stringify({
        lastLessonId: "m0_01_victory_conditions",
        reviewedLessonIds: ["m0_01_victory_conditions"],
        checkedObjectivesByLessonId: {},
      })
    );

    renderTutorial();

    expect(screen.getByRole("button", { name: /Open 0\.1 How to win\. Current lesson/ })).toHaveTextContent("Current");
    expect(screen.queryByRole("button", { name: /Open 0\.1 How to win\. Checklist checked/ })).not.toBeInTheDocument();
  });

  it("lets users restart persisted tutorial progress", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 0\.1 How to win/ }));
    fireEvent.click(screen.getByLabelText("Right-click both castles to confirm their controller."));
    fireEvent.click(screen.getByRole("button", { name: "Restart Tutorial" }));

    expect(screen.getByRole("main", { name: "Learn Castles course" })).toBeInTheDocument();
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        lastLessonId: "m0_00_welcome",
        reviewedLessonIds: [],
        checkedObjectivesByLessonId: {},
      })
    );
    expect(screen.getByRole("status", { name: "Course progress" })).toHaveTextContent("0 / 35 lessons checked");
  });

  it("updates persisted progress when jumping through lesson shortcuts", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 1\.1 The board: Castles/ }));

    expect(screen.getByRole("group", { name: "Terrain lessons" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Castles" })).toBeInTheDocument();
    expect(screen.getByText("Terrain")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rivers" }));

    expect(readStoredProgress().lastLessonId).toBe("m1_l2_terrain_rivers");
    expect(vi.mocked(GameBoard).mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        isTutorialMode: true,
        showNavigationMenu: false,
      })
    );
  });

  it("labels piece lesson shortcuts when piece lessons are active", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 2\.2 Swordsman/ }));

    expect(screen.getByRole("group", { name: "Piece lessons" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sword" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archer" })).toBeInTheDocument();
  });

  it("keeps working when tutorial progress storage is unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => {
      if (key === TUTORIAL_PROGRESS_KEY) {
        throw new DOMException("blocked", "SecurityError");
      }
      return null;
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string) => {
      if (key === TUTORIAL_PROGRESS_KEY) {
        throw new DOMException("blocked", "SecurityError");
      }
    });

    renderTutorial();
    fireEvent.click(screen.getByRole("button", { name: "Start course" }));
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
