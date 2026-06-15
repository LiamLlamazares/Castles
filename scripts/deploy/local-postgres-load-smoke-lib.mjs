const DEFAULT_LOAD_GAME_COUNT = 4;
const MAX_LOAD_GAME_COUNT = 20;

function firstNonEmpty(...values) {
  const match = values.find((value) => String(value ?? "").trim() !== "");
  return match === undefined ? undefined : String(match).trim();
}

function parseBoundedInteger(value, label, { defaultValue, min, max }) {
  const raw = firstNonEmpty(value);
  if (raw === undefined) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

export function parseLocalPostgresLoadSmokeOptions(env = process.env) {
  return {
    gameCount: parseBoundedInteger(env.SMOKE_LOAD_GAMES, "SMOKE_LOAD_GAMES", {
      defaultValue: DEFAULT_LOAD_GAME_COUNT,
      min: 1,
      max: MAX_LOAD_GAME_COUNT,
    }),
  };
}

export function summarizeLocalPostgresLoadSmoke(results) {
  const completedGames = results.filter((result) => result.completed).length;
  const acceptedActions = results.reduce((total, result) => total + result.acceptedActions, 0);
  const staleRejections = results.reduce((total, result) => total + result.staleRejections, 0);
  const aggregateGameDurationMs = results.reduce((total, result) => total + result.durationMs, 0);
  const maxGameDurationMs = results.reduce(
    (maxDuration, result) => Math.max(maxDuration, result.durationMs),
    0
  );

  return {
    schemaVersion: 1,
    gameCount: results.length,
    completedGames,
    acceptedActions,
    staleRejections,
    aggregateGameDurationMs,
    maxGameDurationMs,
  };
}

export function formatLocalPostgresLoadSmokeMetrics(summary) {
  return [
    "Local PostgreSQL load smoke passed:",
    `games=${summary.gameCount}`,
    `completed=${summary.completedGames}`,
    `acceptedActions=${summary.acceptedActions}`,
    `staleRejections=${summary.staleRejections}`,
    `aggregateGameDurationMs=${summary.aggregateGameDurationMs}`,
    `maxGameDurationMs=${summary.maxGameDurationMs}`,
  ].join(" ");
}
