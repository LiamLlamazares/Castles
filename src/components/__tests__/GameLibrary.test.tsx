import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import GameLibrary from "../GameLibrary";
import type { GameLibraryRepository } from "../../Classes/Services/GameLibraryRepository";

const createRepository = (
  games: Awaited<ReturnType<GameLibraryRepository["listGames"]>> = []
): GameLibraryRepository => ({
  listGames: vi.fn().mockResolvedValue(games),
  saveGame: vi.fn(),
  loadGame: vi.fn(),
  renameGame: vi.fn(),
  deleteGame: vi.fn(),
});

describe("GameLibrary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders inside the responsive library shell", async () => {
    const { container } = render(
      <GameLibrary
        repository={createRepository()}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    expect(await screen.findByText(/No named saves yet/i)).toBeInTheDocument();
    expect(container.querySelector(".game-library-page")).toBeInTheDocument();
    expect(container.querySelector(".game-library-layout")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Library navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
  });

  it("keeps primary destinations in the shared Play Tutorial Online Library order", async () => {
    render(
      <GameLibrary
        repository={createRepository()}
        onBack={vi.fn()}
        onOpenGame={vi.fn()}
        onTutorial={vi.fn()}
        onOpenOnlineBrowser={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    const nav = screen.getByRole("navigation", { name: "Library navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());

    expect(await screen.findByText(/No named saves yet/i)).toBeInTheDocument();
    expect(destinations).toEqual(["Play", "Tutorial", "Online", "Library"]);
  });

  it("uses the provided back label", async () => {
    render(
      <GameLibrary
        repository={createRepository()}
        onBack={vi.fn()}
        backLabel="Back to setup"
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    expect(await screen.findByRole("button", { name: "Back to setup" })).toBeInTheDocument();
  });

  it("keeps long save names inside the wrapping saved-game row", async () => {
    const longName = "Imported-game-with-a-very-long-name-that-should-wrap-without-horizontal-overflow";
    const { container } = render(
      <GameLibrary
        repository={createRepository([{
          id: "game-1",
          name: longName,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          moveCount: 0,
          status: "analysis",
          players: {
            white: "VeryLongWhitePlayerName",
            black: "VeryLongBlackPlayerName",
          },
        }])}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    expect(await screen.findByText(longName)).toBeInTheDocument();
    expect(container.querySelector(".saved-game-card")).toHaveClass("saved-game-card");
  });

  it("labels the primary saved-game action as analysis instead of live resume", async () => {
    render(
      <GameLibrary
        repository={createRepository([
          {
            id: "game-complete",
            name: "Finished friend game",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
            moveCount: 18,
            status: "complete",
            players: { white: "White", black: "Black" },
          },
        ])}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /Finished friend game/i }));

    const analyzeButton = screen.getByRole("button", { name: "Analyze" });
    expect(analyzeButton).toHaveAttribute(
      "title",
      "Open this save on a review board; clocks and online seats are not resumed."
    );
    expect(analyzeButton).toHaveAccessibleDescription(
      "Saved games open on a review board; clocks and online seats are not resumed."
    );
    expect(screen.queryByRole("button", { name: "Load" })).not.toBeInTheDocument();
  });

  it("keeps PGN import behind a collapsed import section", async () => {
    render(
      <GameLibrary
        repository={createRepository()}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    expect(await screen.findByText("Import PGN")).toBeInTheDocument();
    expect(screen.getByText("Import PGN").closest("details")).not.toHaveAttribute("open");
  });

  it("renames a saved game with an in-app dialog instead of a browser prompt", async () => {
    const repository = createRepository([{
      id: "game-1",
      name: "Opening study",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      moveCount: 4,
      status: "ongoing",
      players: { white: "White", black: "Black" },
    }]);
    const promptSpy = vi.spyOn(window, "prompt");

    render(
      <GameLibrary
        repository={repository}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /Opening study/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    const dialog = screen.getByRole("dialog", { name: "Rename saved game" });
    const input = screen.getByLabelText("Save name");
    fireEvent.change(input, { target: { value: "Endgame notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => {
      expect(repository.renameGame).toHaveBeenCalledWith("game-1", "Endgame notes");
    });
    expect(dialog).not.toBeInTheDocument();
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("shows empty rename validation inside the rename dialog", async () => {
    const repository = createRepository([{
      id: "game-1",
      name: "Opening study",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      moveCount: 4,
      status: "ongoing",
      players: { white: "White", black: "Black" },
    }]);

    render(
      <GameLibrary
        repository={repository}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /Opening study/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Save name"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    const dialog = screen.getByRole("dialog", { name: "Rename saved game" });
    expect(dialog).toContainElement(screen.getByRole("alert"));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name for this save.");
    expect(repository.renameGame).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Save name"), { target: { value: "Endgame notes" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("deletes a saved game with an in-app confirmation instead of a browser confirm", async () => {
    const repository = createRepository([{
      id: "game-1",
      name: "Opening study",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      moveCount: 4,
      status: "ongoing",
      players: { white: "White", black: "Black" },
    }]);
    const confirmSpy = vi.spyOn(window, "confirm");

    render(
      <GameLibrary
        repository={repository}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /Opening study/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete saved game" });
    expect(dialog).toHaveTextContent("Opening study");
    fireEvent.click(screen.getByRole("button", { name: "Delete save" }));

    await waitFor(() => {
      expect(repository.deleteGame).toHaveBeenCalledWith("game-1");
    });
    expect(dialog).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("keeps library action feedback visible outside the collapsed import section", async () => {
    const repository = createRepository([{
      id: "game-1",
      name: "Opening study",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      moveCount: 4,
      status: "ongoing",
      players: { white: "White", black: "Black" },
    }]);

    render(
      <GameLibrary
        repository={repository}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /Opening study/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved game deleted.");
    expect(screen.getByText("Import PGN").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps focus inside the library dialog, restores focus, and closes with Escape", async () => {
    const repository = createRepository([{
      id: "game-1",
      name: "Opening study",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      moveCount: 4,
      status: "ongoing",
      players: { white: "White", black: "Black" },
    }]);

    render(
      <GameLibrary
        repository={repository}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /Opening study/i }));
    const renameButton = screen.getByRole("button", { name: "Rename" });
    renameButton.focus();
    fireEvent.click(renameButton);

    const dialog = screen.getByRole("dialog", { name: "Rename saved game" });
    const input = screen.getByLabelText("Save name");
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByRole("navigation", { name: "Library navigation", hidden: true }).closest("header")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert", "");

    const saveName = screen.getByRole("button", { name: "Save name" });
    saveName.focus();
    fireEvent.keyDown(saveName, { key: "Tab" });
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(saveName).toHaveFocus();

    fireEvent.keyDown(saveName, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename saved game" })).not.toBeInTheDocument());
    expect(renameButton).toHaveFocus();
    expect(screen.getByRole("navigation", { name: "Library navigation" })).not.toHaveAttribute("aria-hidden");
  });

  it("reports library dialog write failures and prevents duplicate submissions", async () => {
    const renameError = new Error("storage unavailable");
    const repository = createRepository([{
      id: "game-1",
      name: "Opening study",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      moveCount: 4,
      status: "ongoing",
      players: { white: "White", black: "Black" },
    }]);
    vi.mocked(repository.renameGame).mockRejectedValue(renameError);

    render(
      <GameLibrary
        repository={repository}
        onBack={vi.fn()}
        onLoadGame={vi.fn()}
        onImportPGN={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /Opening study/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Save name"), { target: { value: "Endgame notes" } });
    const submit = screen.getByRole("button", { name: "Save name" });

    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(repository.renameGame).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update this saved game.");
    expect(screen.getByRole("dialog", { name: "Rename saved game" })).toBeInTheDocument();
    expect(submit).not.toBeDisabled();
  });
});
