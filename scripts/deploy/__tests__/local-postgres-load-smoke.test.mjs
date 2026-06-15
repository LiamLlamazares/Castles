import { describe, expect, it } from "vitest";
import {
  formatLocalPostgresLoadSmokeMetrics,
  parseLocalPostgresLoadSmokeOptions,
  summarizeLocalPostgresLoadSmoke,
} from "../local-postgres-load-smoke-lib.mjs";

describe("local PostgreSQL load smoke helpers", () => {
  it("defaults to a bounded private-beta load rehearsal", () => {
    expect(parseLocalPostgresLoadSmokeOptions({})).toEqual({
      gameCount: 4,
    });
  });

  it("accepts an explicit local load game count", () => {
    expect(parseLocalPostgresLoadSmokeOptions({ SMOKE_LOAD_GAMES: "8" })).toEqual({
      gameCount: 8,
    });
  });

  it("rejects unsafe local load game counts", () => {
    for (const value of ["0", "21", "1.5", "abc"]) {
      expect(() => parseLocalPostgresLoadSmokeOptions({ SMOKE_LOAD_GAMES: value })).toThrow(
        /SMOKE_LOAD_GAMES/
      );
    }
  });

  it("summarizes completed load games without including tokens or database URLs", () => {
    const summary = summarizeLocalPostgresLoadSmoke([
      {
        gameId: "game_load_a",
        acceptedActions: 2,
        staleRejections: 1,
        completed: true,
        durationMs: 42,
      },
      {
        gameId: "game_load_b",
        acceptedActions: 2,
        staleRejections: 1,
        completed: true,
        durationMs: 58,
      },
    ]);

    expect(summary).toEqual({
      schemaVersion: 1,
      gameCount: 2,
      completedGames: 2,
      acceptedActions: 4,
      staleRejections: 2,
      aggregateGameDurationMs: 100,
      maxGameDurationMs: 58,
    });

    const formatted = formatLocalPostgresLoadSmokeMetrics(summary);
    expect(formatted).toContain("games=2");
    expect(formatted).toContain("completed=2");
    expect(formatted).toContain("acceptedActions=4");
    expect(formatted).toContain("staleRejections=2");
    expect(formatted).toContain("aggregateGameDurationMs=100");
    expect(formatted).not.toMatch(/token|postgresql:\/\/|DATABASE_URL/i);
  });
});
