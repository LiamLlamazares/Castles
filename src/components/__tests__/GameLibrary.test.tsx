import { render, screen } from "@testing-library/react";
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
});
