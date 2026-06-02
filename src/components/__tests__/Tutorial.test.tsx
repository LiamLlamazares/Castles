import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Tutorial from "../Tutorial";
import GameBoard from "../Game";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { getAllLessons } from "../../tutorial";
import { getLessonObjectives } from "../../tutorial/objectives";
import { AbilityType } from "../../Constants";

vi.mock("../Game", () => ({
  default: vi.fn(() => <div data-testid="tutorial-board" />),
}));

vi.mock("../PieceImages", () => ({
  getImageByPieceType: () => "test-piece.svg",
}));

const TUTORIAL_PROGRESS_KEY = "castles_tutorial_progress_v2";
const VICTORY_OBJECTIVE_ID = "m0-01-victory-conditions-objective-1";

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

  it("uses a tutorial shell and opens to a course overview", () => {
    renderTutorial({ onOpenLibrary: vi.fn(), onOpenOnlineBrowser: vi.fn() });

    expect(screen.getByRole("navigation", { name: "Tutorial navigation" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Tutorial navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());
    expect(destinations).toEqual(["Play", "Tutorial", "Online", "Library"]);
    expect(screen.getByRole("button", { name: "Tutorial" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Castles tutorial" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("0 / 36 lessons completed");
    expect(screen.getByRole("navigation", { name: "Tutorial sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Getting started 0 of 2 lessons completed" })).toHaveAttribute("href", "#tutorial-module-m0_");
    const currentPanel = screen.getByRole("region", { name: "0 Welcome" });
    expect(within(currentPanel).getByRole("heading", { level: 3, name: "0 Welcome" })).toBeInTheDocument();
    expect(within(currentPanel).getByText("First lesson")).toBeInTheDocument();
    expect(within(currentPanel).getByText("Ready to continue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start this lesson" })).toBeInTheDocument();
    expect(screen.queryByTestId("tutorial-board")).not.toBeInTheDocument();
  });

  it("uses the provided back label", () => {
    renderTutorial({ backLabel: "Back to setup" });

    expect(screen.getByRole("button", { name: "Back to setup" })).toBeInTheDocument();
  });

  it("starts the current lesson from the course overview without showing the nested game menu", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start Tutorial" }));

    expect(screen.getByRole("region", { name: "Tutorial lesson board" })).toContainElement(screen.getByTestId("tutorial-board"));
    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 36");
    expect(GameBoard).toHaveBeenCalled();
    expect(vi.mocked(GameBoard).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        isTutorialMode: true,
        showNavigationMenu: false,
        showTooltipHint: false,
        onTutorialEvent: expect.any(Function),
      })
    );
  });

  it("keeps lesson progress and previous-next controls together near the top", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start Tutorial" }));

    const progressControls = screen.getByRole("group", { name: "Lesson progress controls" });
    expect(progressControls).toContainElement(within(progressControls).getByRole("button", { name: "Tutorial overview" }));
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Previous" }));
    expect(progressControls).toContainElement(screen.getByRole("status", { name: "Tutorial progress" }));
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Restart Tutorial" }));
    expect(progressControls).toContainElement(screen.getByRole("button", { name: "Next" }));
  });

  it("summarizes progress beside the lesson title and exposes a compact control strip", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start Tutorial" }));

    const lessonHeader = screen.getByRole("group", { name: "Current lesson" });
    expect(lessonHeader).toContainElement(screen.getByRole("heading", { level: 2, name: "0 Welcome" }));
    expect(lessonHeader).toContainElement(screen.getByText("Getting started"));
    expect(lessonHeader).toContainElement(screen.getByText("Lesson 1 of 36"));
    expect(lessonHeader).toContainElement(screen.getByText("Progress saved"));

    const controlStrip = screen.getByRole("toolbar", { name: "Lesson controls" });
    expect(controlStrip).toContainElement(within(controlStrip).getByRole("button", { name: "Tutorial overview" }));
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Previous" }));
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Restart Tutorial" }));
    expect(controlStrip).toContainElement(screen.getByRole("button", { name: "Next" }));
  });

  it("keeps course overview and next lesson actions reachable after lesson text", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start Tutorial" }));

    expect(screen.queryByRole("group", { name: "Lesson goals" })).not.toBeInTheDocument();
    expect(screen.queryByText("Read the position, inspect the board, and continue when it makes sense.")).not.toBeInTheDocument();

    const footerNavigation = screen.getByRole("group", { name: "Lesson footer navigation" });
    expect(footerNavigation).toContainElement(within(footerNavigation).getByRole("button", { name: "Tutorial overview" }));
    expect(footerNavigation).toContainElement(within(footerNavigation).getByRole("button", { name: "Next lesson" }));
  });

  it("persists the current lesson by stable lesson id", () => {
    const { unmount } = renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start Tutorial" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("2 / 36");
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        lastLessonId: "m0_01_victory_conditions",
        completedLessonIds: ["m0_00_welcome"],
        checkedObjectiveIdsByLessonId: {},
      })
    );

    unmount();
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Continue Tutorial" }));
    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("2 / 36");
  });

  it("lets users return from a lesson to the course overview", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start Tutorial" }));
    fireEvent.click(within(screen.getByRole("toolbar", { name: "Lesson controls" })).getByRole("button", { name: "Tutorial overview" }));

    expect(screen.getByRole("main", { name: "Castles tutorial" })).toBeInTheDocument();
    expect(screen.queryByTestId("tutorial-board")).not.toBeInTheDocument();
  });

  it("moves focus to the new heading when switching between course and lesson", async () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: "Start Tutorial" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "0 Welcome" })).toHaveFocus();
    });

    fireEvent.click(within(screen.getByRole("toolbar", { name: "Lesson controls" })).getByRole("button", { name: "Tutorial overview" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Castles tutorial" })).toHaveFocus();
    });
  });

  it("stores objective checks by stable id and course completion progress", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 0\.1 How to win/ }));
    fireEvent.click(screen.getByLabelText("Right-click both castles to confirm their controller."));

    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        lastLessonId: "m0_01_victory_conditions",
        completedLessonIds: ["m0_01_victory_conditions"],
        checkedObjectiveIdsByLessonId: {
          m0_01_victory_conditions: [VICTORY_OBJECTIVE_ID],
        },
      })
    );

    fireEvent.click(within(screen.getByRole("toolbar", { name: "Lesson controls" })).getByRole("button", { name: "Tutorial overview" }));
    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 36 lessons completed");
    expect(screen.getByRole("button", { name: /Open 0\.1 How to win\. Goals complete, 1 \/ 1 goals completed/ })).toHaveTextContent("Complete");
    expect(screen.getByRole("link", { name: "Getting started 1 of 2 lessons completed" })).toBeInTheDocument();
  });

  it("auto-completes inspection objectives only after the required targets are inspected", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 0\.1 How to win/ }));

    let emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    expect(emitTutorialEvent).toEqual(expect.any(Function));

    act(() => {
      emitTutorialEvent?.({ type: "inspect", targetKind: "castle", hexKey: "-3,3,0" });
    });
    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "inspect", targetKind: "piece", hexKey: "3,-3,0" });
    });
    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "inspect", targetKind: "castle", hexKey: "3,-3,0" });
    });

    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        completedLessonIds: ["m0_01_victory_conditions"],
        checkedObjectiveIdsByLessonId: {
          m0_01_victory_conditions: [VICTORY_OBJECTIVE_ID],
        },
      })
    );

    fireEvent.click(within(screen.getByRole("toolbar", { name: "Lesson controls" })).getByRole("button", { name: "Tutorial overview" }));
    fireEvent.click(screen.getByRole("button", { name: /Open 4\.4 Sanctuary cooldowns/ }));

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "inspect", targetKind: "sanctuary", hexKey: "0,0,0" });
    });
    expect(screen.getByText("1 / 2 goals completed")).toBeInTheDocument();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "inspect", targetKind: "piece", hexKey: "-1,-1,2" });
    });
    expect(screen.getByText("1 / 2 goals completed")).toBeInTheDocument();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "inspect", targetKind: "piece", hexKey: "0,-1,1" });
    });
    expect(screen.getByText("1 / 2 goals completed")).toBeInTheDocument();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "inspect", targetKind: "piece", hexKey: "1,-1,0" });
    });
    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();
  });

  it("auto-completes clear capture objectives but leaves find objectives manual", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 2\.2 Swordsman/ }));
    let emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "attack", notation: "J10xK11", phase: "Attack" });
    });
    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "capture", notation: "J10xK11", phase: "Attack" });
    });
    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();

    fireEvent.click(within(screen.getByRole("toolbar", { name: "Lesson controls" })).getByRole("button", { name: "Tutorial overview" }));
    fireEvent.click(screen.getByRole("button", { name: /Open 3\.1 Strength puzzle/ }));
    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "capture", notation: "J10xK11", phase: "Attack" });
    });
    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();
  });

  it("auto-completes phase overview goals from the resulting game phase", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 2 Turn phases overview/ }));
    let emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;

    act(() => {
      emitTutorialEvent?.({ type: "move", notation: "G12G11", phase: "Movement", resultPhase: "Movement" });
    });
    expect(screen.getByText("1 / 3 goals completed")).toBeInTheDocument();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "pass", notation: "Pass", phase: "Movement", resultPhase: "Attack" });
    });
    expect(screen.getByText("2 / 3 goals completed")).toBeInTheDocument();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "capture", notation: "A1xA3", phase: "Attack", resultPhase: "Attack" });
    });
    expect(screen.getByText("2 / 3 goals completed")).toBeInTheDocument();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "pass", notation: "Pass", phase: "Attack", resultPhase: "Movement" });
    });
    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();
  });

  it("auto-completes attack-only objectives without requiring a capture", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 2\.4 Archer/ }));
    const emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "attack", notation: "A1xA3", phase: "Attack", resultPhase: "Attack" });
    });

    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();
  });

  it("does not complete capture-during-phase objectives merely by reaching that phase", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 5\.2 Wolf/ }));
    const emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "pass", notation: "Pass", phase: "Movement", resultPhase: "Attack" });
    });

    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();
  });

  it("auto-completes ability objectives only from the named ability with its expected board effect", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 5\.5 Wizard/ }));
    let emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "ability", abilityType: AbilityType.Teleport, notation: "WT:J10K11", phase: "Attack" });
    });
    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "ability", abilityType: AbilityType.Fireball, notation: "WF:J10K11", phase: "Attack", pieceRemoved: false });
    });
    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "ability", abilityType: AbilityType.Fireball, notation: "WF:J10K11", phase: "Attack", pieceRemoved: true });
    });
    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();

    fireEvent.click(within(screen.getByRole("toolbar", { name: "Lesson controls" })).getByRole("button", { name: "Tutorial overview" }));
    fireEvent.click(screen.getByRole("button", { name: /Open 5\.6 Necromancer/ }));
    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "capture", notation: "J10xK11", phase: "Attack" });
    });
    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();

    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "ability", abilityType: AbilityType.RaiseDead, notation: "NR:J10K11", phase: "Attack", pieceAdded: true });
    });
    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();
  });

  it("auto-completes recruitment and promotion objectives from game events", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 4\.2 Recruitment cycle/ }));
    let emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "recruitment", notation: "K11=Swo", phase: "Recruitment" });
    });
    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();

    fireEvent.click(within(screen.getByRole("toolbar", { name: "Lesson controls" })).getByRole("button", { name: "Tutorial overview" }));
    fireEvent.click(screen.getByRole("button", { name: /Open 2\.12 Promotion/ }));
    emitTutorialEvent = vi.mocked(GameBoard).mock.calls.at(-1)?.[0].onTutorialEvent;
    act(() => {
      emitTutorialEvent?.({ type: "promotion", notation: "J10K11=Arc", phase: "Movement" });
    });
    expect(screen.getByRole("button", { name: "Goals complete" })).toBeDisabled();
  });

  it("points the course panel to the next completion target when the stored current lesson is complete", () => {
    localStorage.setItem(
      TUTORIAL_PROGRESS_KEY,
      JSON.stringify({
        lastLessonId: "m0_01_victory_conditions",
        completedLessonIds: ["m0_00_welcome", "m0_01_victory_conditions"],
        checkedObjectiveIdsByLessonId: {
          m0_01_victory_conditions: [VICTORY_OBJECTIVE_ID],
        },
      })
    );

    renderTutorial();

    const currentPanel = screen.getByRole("region", { name: "1.1 The board: Castles" });
    expect(within(currentPanel).getByText("Next to complete")).toBeInTheDocument();
    expect(within(currentPanel).getByRole("button", { name: "Open next lesson" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open 0\.1 How to win\. Goals complete, 1 \/ 1 goals completed/ })).toHaveTextContent("Complete");
  });

  it("removes lesson completion when an objective is unchecked", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 0\.1 How to win/ }));
    fireEvent.click(screen.getByLabelText("Right-click both castles to confirm their controller."));
    fireEvent.click(screen.getByLabelText("Right-click both castles to confirm their controller."));

    expect(screen.getByRole("button", { name: "Complete manually" })).toBeEnabled();
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        completedLessonIds: [],
        checkedObjectiveIdsByLessonId: {},
      })
    );
  });

  it("migrates current index-based objective progress into objective ids", () => {
    localStorage.setItem(
      TUTORIAL_PROGRESS_KEY,
      JSON.stringify({
        lastLessonId: "m0_01_victory_conditions",
        checkedObjectivesByLessonId: {
          m0_01_victory_conditions: [0],
        },
      })
    );

    renderTutorial();

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 36 lessons completed");
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        completedLessonIds: ["m0_01_victory_conditions"],
        checkedObjectiveIdsByLessonId: {
          m0_01_victory_conditions: [VICTORY_OBJECTIVE_ID],
        },
      })
    );
  });

  it("migrates current no-objective reviewed lessons into completed lessons", () => {
    localStorage.setItem(
      TUTORIAL_PROGRESS_KEY,
      JSON.stringify({
        lastLessonId: "m0_00_welcome",
        reviewedLessonIds: ["m0_00_welcome"],
      })
    );

    renderTutorial();

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 36 lessons completed");
    expect(screen.getByRole("button", { name: /Open 0 Welcome\. Lesson complete/ })).toHaveTextContent("Complete");
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        completedLessonIds: ["m0_00_welcome"],
        checkedObjectiveIdsByLessonId: {},
      })
    );
  });

  it("derives completion from checked objectives instead of trusting stale stored flags", () => {
    localStorage.setItem(
      TUTORIAL_PROGRESS_KEY,
      JSON.stringify({
        lastLessonId: "m0_01_victory_conditions",
        completedLessonIds: ["m0_01_victory_conditions"],
        checkedObjectiveIdsByLessonId: {},
      })
    );

    renderTutorial();

    expect(screen.getByRole("button", { name: /Open 0\.1 How to win\. Current lesson/ })).toHaveTextContent("Current");
    expect(screen.queryByRole("button", { name: /Open 0\.1 How to win\. Goals complete/ })).not.toBeInTheDocument();
  });

  it("lets users restart persisted tutorial progress", () => {
    renderTutorial();

    fireEvent.click(screen.getByRole("button", { name: /Open 0\.1 How to win/ }));
    fireEvent.click(screen.getByLabelText("Right-click both castles to confirm their controller."));
    fireEvent.click(screen.getByRole("button", { name: "Restart Tutorial" }));

    expect(screen.getByRole("main", { name: "Castles tutorial" })).toBeInTheDocument();
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        lastLessonId: "m0_00_welcome",
        completedLessonIds: [],
        checkedObjectiveIdsByLessonId: {},
      })
    );
    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("0 / 36 lessons completed");
  });

  it("sanitizes unknown lesson ids and invalid objective ids", () => {
    localStorage.setItem(
      TUTORIAL_PROGRESS_KEY,
      JSON.stringify({
        lastLessonId: "not_real",
        completedLessonIds: ["not_real", "m0_00_welcome", "m0_01_victory_conditions"],
        checkedObjectiveIdsByLessonId: {
          m0_01_victory_conditions: [VICTORY_OBJECTIVE_ID, "not-real"],
        },
        checkedObjectivesByLessonId: {
          m2_l12_promotion: [999, -1, 0, "not-real"],
        },
      })
    );

    renderTutorial();

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("3 / 36 lessons completed");
    expect(readStoredProgress()).toEqual(
      expect.objectContaining({
        lastLessonId: "m0_00_welcome",
        completedLessonIds: ["m0_00_welcome", "m0_01_victory_conditions", "m2_l12_promotion"],
        checkedObjectiveIdsByLessonId: {
          m0_01_victory_conditions: [VICTORY_OBJECTIVE_ID],
          m2_l12_promotion: ["m2-l12-promotion-objective-1"],
        },
      })
    );
  });

  it("shows a review action once every lesson is complete", () => {
    const completedProgress = {
      lastLessonId: "m0_00_welcome",
      completedLessonIds: getAllLessons().map((lesson) => lesson.id),
      checkedObjectiveIdsByLessonId: Object.fromEntries(
        getAllLessons()
          .map((lesson) => [lesson.id, getLessonObjectives(lesson).map((objective) => objective.id)])
          .filter(([, objectiveIds]) => (objectiveIds as string[]).length > 0)
      ),
    };
    localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(completedProgress));

    renderTutorial();

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("36 / 36 lessons completed");
    expect(screen.getByRole("button", { name: "Review Tutorial" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Start Tutorial" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("2 / 36");
    expect(screen.getByText("Session only")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Progress saved")).not.toBeInTheDocument();
    });
    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalled();
  });
});
