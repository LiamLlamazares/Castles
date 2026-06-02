import {
  clearRecentOnlineGames,
  loadRecentOnlineGames,
  rememberRecentOnlineGame,
} from "../recentGames";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("recent online games storage", () => {
  it("stores token-free recent games newest first and updates existing entries", () => {
    const storage = new MemoryStorage();

    rememberRecentOnlineGame(
      {
        gameId: "game_old",
        role: "spectator",
        status: "active",
        lastSeenAt: "2026-06-01T12:00:00.000Z",
      },
      storage
    );
    rememberRecentOnlineGame(
      {
        gameId: "game_finished",
        role: "player",
        seat: "b",
        status: "complete",
        lastSeenAt: "2026-06-01T12:10:00.000Z",
      },
      storage
    );
    rememberRecentOnlineGame(
      {
        gameId: "game_old",
        role: "player",
        seat: "w",
        status: "complete",
        lastSeenAt: "2026-06-01T12:20:00.000Z",
      },
      storage
    );

    expect(loadRecentOnlineGames(storage)).toEqual([
      {
        gameId: "game_old",
        role: "player",
        seat: "w",
        status: "complete",
        lastSeenAt: "2026-06-01T12:20:00.000Z",
      },
      {
        gameId: "game_finished",
        role: "player",
        seat: "b",
        status: "complete",
        lastSeenAt: "2026-06-01T12:10:00.000Z",
      },
    ]);
  });

  it("drops malformed records and can clear the list", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "castles_recent_online_games",
      JSON.stringify([
        { gameId: "", role: "player", status: "complete", lastSeenAt: "2026-06-01T12:00:00.000Z" },
        { gameId: "game_valid", role: "spectator", status: "complete", lastSeenAt: "not a date" },
      ])
    );

    expect(loadRecentOnlineGames(storage)).toEqual([
      {
        gameId: "game_valid",
        role: "spectator",
        status: "complete",
        lastSeenAt: "1970-01-01T00:00:00.000Z",
      },
    ]);

    clearRecentOnlineGames(storage);
    expect(loadRecentOnlineGames(storage)).toEqual([]);
  });

  it("normalizes stored records without preserving token or URL-looking fields", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "castles_recent_online_games",
      JSON.stringify([
        {
          gameId: "game_token_noise",
          role: "player",
          seat: "w",
          status: "complete",
          lastSeenAt: "2026-06-01T12:00:00.000Z",
          token: "secret-token",
          spectatorUrl: "https://castles.example/?onlineGame=game_token_noise&token=secret-token",
          invite: "#challengeToken=secret-token",
        },
      ])
    );

    expect(loadRecentOnlineGames(storage)).toEqual([
      {
        gameId: "game_token_noise",
        role: "player",
        seat: "w",
        status: "complete",
        lastSeenAt: "2026-06-01T12:00:00.000Z",
      },
    ]);

    rememberRecentOnlineGame(
      {
        gameId: "game_token_noise",
        role: "player",
        seat: "w",
        status: "complete",
        lastSeenAt: "2026-06-01T12:05:00.000Z",
      },
      storage
    );

    const stored = storage.getItem("castles_recent_online_games");
    expect(stored).toContain("game_token_noise");
    expect(stored).not.toContain("secret-token");
    expect(stored).not.toContain("spectatorUrl");
    expect(stored).not.toContain("challengeToken");
  });
});
