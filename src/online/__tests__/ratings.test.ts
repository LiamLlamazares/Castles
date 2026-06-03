import { describe, expect, it } from "vitest";
import {
  createInitialOnlineRating,
  createDefaultOnlineRating,
  DEFAULT_ONLINE_RATING_ENGINE,
  formatOnlineRating,
  GLICKO2_ONLINE_RATING_ENGINE,
  GLICKO2_ONLINE_RATING_ENGINE_ID,
  isOnlineRatingProvisional,
  ONLINE_RATING_DEFAULT_DEVIATION,
  ONLINE_RATING_SCHEMA_VERSION,
  getOnlineRatingEngine,
  updateOnlineRating,
  updateDefaultOnlineRating,
  type OnlineRatingEngine,
  type OnlineRating,
} from "../ratings";

function rating(overrides: Partial<OnlineRating> = {}): OnlineRating {
  return {
    schemaVersion: ONLINE_RATING_SCHEMA_VERSION,
    engineId: GLICKO2_ONLINE_RATING_ENGINE_ID,
    rating: 1500,
    deviation: 200,
    volatility: 0.06,
    games: 0,
    updatedAt: null,
    ...overrides,
  };
}

describe("online ratings", () => {
  it("uses a swappable Glicko-2 engine as the default rating implementation", () => {
    expect(DEFAULT_ONLINE_RATING_ENGINE).toBe(GLICKO2_ONLINE_RATING_ENGINE);
    expect(DEFAULT_ONLINE_RATING_ENGINE.id).toBe(GLICKO2_ONLINE_RATING_ENGINE_ID);
    expect(getOnlineRatingEngine(GLICKO2_ONLINE_RATING_ENGINE_ID)).toBe(GLICKO2_ONLINE_RATING_ENGINE);
    expect(getOnlineRatingEngine("future-engine")).toBeNull();
    expect(createDefaultOnlineRating("2026-06-03T12:00:00.000Z")).toEqual(
      createInitialOnlineRating("2026-06-03T12:00:00.000Z")
    );
    expect(updateDefaultOnlineRating(rating(), [])).toEqual(updateOnlineRating(rating(), []));

    const experimentalEngine: OnlineRatingEngine = {
      id: "fixed-test-engine",
      createInitialRating: (updatedAt = null) => rating({ rating: 42, updatedAt }),
      updateRating: (current) => ({ ...current, rating: current.rating + 1 }),
      isProvisional: () => false,
      formatRating: (current) => `fixed:${current.rating}`,
    };

    const experimental = experimentalEngine.createInitialRating("2026-06-03T12:00:00.000Z");
    expect(experimentalEngine.updateRating(experimental, []).rating).toBe(43);
    expect(experimentalEngine.formatRating(experimental)).toBe("fixed:42");
  });

  it("creates provisional initial ratings with beta defaults", () => {
    const created = createInitialOnlineRating("2026-06-03T12:00:00.000Z");

    expect(created).toEqual({
      schemaVersion: ONLINE_RATING_SCHEMA_VERSION,
      engineId: GLICKO2_ONLINE_RATING_ENGINE_ID,
      rating: 1500,
      deviation: ONLINE_RATING_DEFAULT_DEVIATION,
      volatility: 0.06,
      games: 0,
      updatedAt: "2026-06-03T12:00:00.000Z",
    });
    expect(ONLINE_RATING_DEFAULT_DEVIATION).toBe(500);
    expect(isOnlineRatingProvisional(created)).toBe(true);
    expect(formatOnlineRating(created)).toBe("1500?");
  });

  it("matches the standard Glicko-2 worked example", () => {
    const updated = updateOnlineRating(
      rating({ rating: 1500, deviation: 200, volatility: 0.06 }),
      [
        { opponent: { rating: 1400, deviation: 30 }, score: 1 },
        { opponent: { rating: 1550, deviation: 100 }, score: 0 },
        { opponent: { rating: 1700, deviation: 300 }, score: 0 },
      ],
      { tau: 0.5, updatedAt: "2026-06-03T12:30:00.000Z" }
    );

    expect(updated.rating).toBeCloseTo(1464.05, 2);
    expect(updated.deviation).toBeCloseTo(151.52, 2);
    expect(updated.volatility).toBeCloseTo(0.059996, 6);
    expect(updated.games).toBe(3);
    expect(updated.updatedAt).toBe("2026-06-03T12:30:00.000Z");
  });

  it("allows valid finite rating outputs to feed the next rating period", () => {
    const first = updateOnlineRating(
      rating({ rating: -20, deviation: 80, volatility: 0.06, games: 20 }),
      [{ opponent: { rating: 1200, deviation: 120 }, score: 1 }]
    );

    expect(Number.isFinite(first.rating)).toBe(true);

    const second = updateOnlineRating(first, [
      { opponent: { rating: 1200, deviation: 120 }, score: 1 },
    ]);

    expect(Number.isFinite(second.rating)).toBe(true);
    expect(second.games).toBe(first.games + 1);

    const withNegativeOpponent = updateOnlineRating(rating(), [
      { opponent: { rating: -100, deviation: 120 }, score: 1 },
    ]);
    expect(Number.isFinite(withNegativeOpponent.rating)).toBe(true);
  });

  it("increases deviation but not game count after inactive rating periods", () => {
    const current = rating({ rating: 1620, deviation: 80, volatility: 0.06, games: 12 });
    const updated = updateOnlineRating(current, [], { updatedAt: "2026-06-03T13:00:00.000Z" });

    expect(updated.rating).toBe(1620);
    expect(updated.deviation).toBeGreaterThan(80);
    expect(updated.volatility).toBe(0.06);
    expect(updated.games).toBe(12);
    expect(updated.updatedAt).toBe("2026-06-03T13:00:00.000Z");
  });

  it("formats established ratings without a provisional marker", () => {
    expect(formatOnlineRating(rating({ rating: 1624.4, deviation: 95, games: 20 }))).toBe("1624");
  });

  it("rejects invalid rating inputs", () => {
    expect(() => updateOnlineRating(rating({ schemaVersion: 99 as any }), [])).toThrow("rating.schemaVersion is invalid");
    expect(() => updateOnlineRating(rating({ engineId: "future-engine" }), [])).toThrow("rating.engineId is invalid");
    expect(() => updateOnlineRating(rating({ rating: Number.NaN }), [])).toThrow("rating.rating is invalid");
    expect(() => updateOnlineRating(rating({ deviation: -1 }), [])).toThrow("rating.deviation is invalid");
    expect(() => updateOnlineRating(rating({ volatility: 0 }), [])).toThrow("rating.volatility is invalid");
    expect(() => updateOnlineRating(rating({ games: 1.5 }), [])).toThrow("rating.games is invalid");
    expect(() =>
      updateOnlineRating(rating(), [{ opponent: { rating: Number.POSITIVE_INFINITY, deviation: 30 }, score: 1 }])
    ).toThrow("results[0].opponent.rating is invalid");
    expect(() =>
      updateOnlineRating(rating(), [{ opponent: { rating: 1400, deviation: 0 }, score: 1 }])
    ).toThrow("results[0].opponent.deviation is invalid");
    expect(() =>
      updateOnlineRating(rating(), [{ opponent: { rating: 1400, deviation: 30 }, score: 0.25 as any }])
    ).toThrow("results[0].score is invalid");
    expect(() => updateOnlineRating(rating(), [], { tau: 0 })).toThrow("Glicko-2 tau must be positive");
  });

  it("rejects extreme finite values that would produce invalid rating records", () => {
    expect(() => updateOnlineRating(rating({ deviation: Number.MAX_VALUE }), [])).toThrow(
      "updatedRating.deviation is invalid"
    );
    expect(() => updateOnlineRating(rating({ volatility: Number.MAX_VALUE }), [])).toThrow(
      "updatedRating.deviation is invalid"
    );
    expect(() =>
      updateOnlineRating(
        rating(),
        [{ opponent: { rating: 1400, deviation: 30 }, score: 1 }],
        { tau: Number.MAX_VALUE }
      )
    ).toThrow("updatedRating.volatility is invalid");
  });
});
