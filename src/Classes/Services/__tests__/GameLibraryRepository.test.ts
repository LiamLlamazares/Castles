import {
  BrowserGameLibraryRepository,
  createSavedGameRecord,
} from "../GameLibraryRepository";

const SAMPLE_PGN = `[Event "Castles Game"]
[Site "Local"]
[Date "2026.05.25"]
[White "Liam"]
[Black "Random Bot"]
[Result "*"]

1. F15E13 1... Pass 2. E13D10`;

describe("GameLibraryRepository", () => {
  const fixedNow = "2026-05-25T12:00:00.000Z";

  const createRepository = () =>
    new BrowserGameLibraryRepository({
      indexedDB: undefined,
      storage: window.localStorage,
      now: () => fixedNow,
      idFactory: () => "game-1",
    });

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates useful saved-game metadata from PGN", () => {
    const record = createSavedGameRecord({
      pgn: SAMPLE_PGN,
      name: "First test save",
      status: "ongoing",
      now: () => fixedNow,
      idFactory: () => "game-1",
    });

    expect(record).toMatchObject({
      id: "game-1",
      name: "First test save",
      createdAt: fixedNow,
      updatedAt: fixedNow,
      status: "ongoing",
      moveCount: 3,
      players: { white: "Liam", black: "Random Bot" },
      pgn: SAMPLE_PGN,
    });
  });

  it("saves, lists, loads, renames, and deletes named games", async () => {
    const repository = createRepository();
    const record = createSavedGameRecord({
      pgn: SAMPLE_PGN,
      name: "Library save",
      now: () => fixedNow,
      idFactory: () => "game-1",
    });

    await repository.saveGame(record);

    expect(await repository.listGames()).toEqual([
      {
        id: "game-1",
        name: "Library save",
        createdAt: fixedNow,
        updatedAt: fixedNow,
        status: "ongoing",
        moveCount: 3,
        players: { white: "Liam", black: "Random Bot" },
      },
    ]);
    expect(await repository.loadGame("game-1")).toEqual(record);

    await repository.renameGame("game-1", "Renamed save");
    expect((await repository.loadGame("game-1")).name).toBe("Renamed save");

    await repository.deleteGame("game-1");
    expect(await repository.listGames()).toEqual([]);
    await expect(repository.loadGame("game-1")).rejects.toThrow("Saved game not found");
  });

  it("keeps named library saves separate from autosave", async () => {
    window.localStorage.setItem("castles_autosave", "autosave-pgn");

    const repository = createRepository();
    const record = createSavedGameRecord({
      pgn: SAMPLE_PGN,
      name: "Manual save",
      now: () => fixedNow,
      idFactory: () => "game-1",
    });
    await repository.saveGame(record);

    expect(window.localStorage.getItem("castles_autosave")).toBe("autosave-pgn");
    expect(await repository.listGames()).toHaveLength(1);
  });
});
