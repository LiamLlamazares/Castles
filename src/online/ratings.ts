export const ONLINE_RATING_BASE = 1500;
export const ONLINE_RATING_SCALE = 173.7178;
// Castles beta starts with extra uncertainty because the rules and balance are still moving.
export const ONLINE_RATING_DEFAULT_DEVIATION = 500;
export const ONLINE_RATING_DEFAULT_VOLATILITY = 0.06;
export const ONLINE_RATING_DEFAULT_TAU = 0.5;
export const ONLINE_RATING_PROVISIONAL_DEVIATION = 110;
export const ONLINE_RATING_SCHEMA_VERSION = 1;
export const GLICKO2_ONLINE_RATING_ENGINE_ID = "glicko2-beta-v1";

const VOLATILITY_CONVERGENCE_EPSILON = 0.000001;

export interface OnlineRating {
  schemaVersion: typeof ONLINE_RATING_SCHEMA_VERSION;
  engineId: string;
  rating: number;
  deviation: number;
  volatility: number;
  games: number;
  updatedAt: string | null;
}

export interface OnlineRatingOpponent {
  rating: number;
  deviation: number;
}

export type OnlineRatingScore = 0 | 0.5 | 1;

export interface OnlineRatingResult {
  opponent: OnlineRatingOpponent;
  score: OnlineRatingScore;
}

export interface OnlineRatingUpdateOptions {
  tau?: number;
  updatedAt?: string | null;
}

export interface OnlineRatingEngine {
  id: string;
  createInitialRating(updatedAt?: string | null): OnlineRating;
  updateRating(
    rating: OnlineRating,
    results: OnlineRatingResult[],
    options?: OnlineRatingUpdateOptions
  ): OnlineRating;
  isProvisional(rating: OnlineRating): boolean;
  formatRating(rating: OnlineRating): string;
}

export const GLICKO2_ONLINE_RATING_ENGINE: OnlineRatingEngine = {
  id: GLICKO2_ONLINE_RATING_ENGINE_ID,
  createInitialRating: createInitialOnlineRating,
  updateRating: updateOnlineRating,
  isProvisional: isOnlineRatingProvisional,
  formatRating: formatOnlineRating,
};

export const DEFAULT_ONLINE_RATING_ENGINE = GLICKO2_ONLINE_RATING_ENGINE;
export const ONLINE_RATING_ENGINES = [GLICKO2_ONLINE_RATING_ENGINE] as const;

export function getOnlineRatingEngine(engineId: string): OnlineRatingEngine | null {
  return ONLINE_RATING_ENGINES.find((engine) => engine.id === engineId) ?? null;
}

export function createDefaultOnlineRating(updatedAt: string | null = null): OnlineRating {
  return DEFAULT_ONLINE_RATING_ENGINE.createInitialRating(updatedAt);
}

export function updateDefaultOnlineRating(
  rating: OnlineRating,
  results: OnlineRatingResult[],
  options: OnlineRatingUpdateOptions = {}
): OnlineRating {
  return DEFAULT_ONLINE_RATING_ENGINE.updateRating(rating, results, options);
}

export function createInitialOnlineRating(updatedAt: string | null = null): OnlineRating {
  return {
    schemaVersion: ONLINE_RATING_SCHEMA_VERSION,
    engineId: GLICKO2_ONLINE_RATING_ENGINE_ID,
    rating: ONLINE_RATING_BASE,
    deviation: ONLINE_RATING_DEFAULT_DEVIATION,
    volatility: ONLINE_RATING_DEFAULT_VOLATILITY,
    games: 0,
    updatedAt,
  };
}

export function isOnlineRatingProvisional(rating: OnlineRating): boolean {
  return rating.deviation > ONLINE_RATING_PROVISIONAL_DEVIATION;
}

export function formatOnlineRating(rating: OnlineRating): string {
  const rounded = Math.round(rating.rating);
  return isOnlineRatingProvisional(rating) ? `${rounded}?` : String(rounded);
}

export function updateOnlineRating(
  rating: OnlineRating,
  results: OnlineRatingResult[],
  options: OnlineRatingUpdateOptions = {}
): OnlineRating {
  assertValidRating(rating, "rating");
  for (const [index, result] of results.entries()) {
    assertValidRatingValue(result.opponent.rating, `results[${index}].opponent.rating`);
    assertPositiveFiniteNumber(result.opponent.deviation, `results[${index}].opponent.deviation`);
    if (result.score !== 0 && result.score !== 0.5 && result.score !== 1) {
      throw new Error(`results[${index}].score is invalid.`);
    }
  }

  const tau = options.tau ?? ONLINE_RATING_DEFAULT_TAU;
  if (!Number.isFinite(tau) || tau <= 0) {
    throw new Error("Glicko-2 tau must be positive.");
  }

  const mu = ratingToMu(rating.rating);
  const phi = deviationToPhi(rating.deviation);

  if (results.length === 0) {
    const updated: OnlineRating = {
      ...rating,
      deviation: phiToDeviation(Math.sqrt(phi * phi + rating.volatility * rating.volatility)),
      updatedAt: options.updatedAt ?? rating.updatedAt,
    };
    assertValidRating(updated, "updatedRating");
    return updated;
  }

  const preparedResults = results.map((result) => {
    const opponentMu = ratingToMu(result.opponent.rating);
    const opponentPhi = deviationToPhi(result.opponent.deviation);
    const gValue = g(opponentPhi);
    const expected = expectedScore(mu, opponentMu, opponentPhi);
    return {
      score: result.score,
      gValue,
      expected,
    };
  });

  const variance = 1 / preparedResults.reduce((sum, result) => (
    sum + result.gValue * result.gValue * result.expected * (1 - result.expected)
  ), 0);
  const improvement = preparedResults.reduce((sum, result) => (
    sum + result.gValue * (result.score - result.expected)
  ), 0);
  const delta = variance * improvement;
  const volatility = updateVolatility(phi, rating.volatility, variance, delta, tau);
  const phiStar = Math.sqrt(phi * phi + volatility * volatility);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / variance);
  const muPrime = mu + phiPrime * phiPrime * improvement;

  const updated: OnlineRating = {
    schemaVersion: ONLINE_RATING_SCHEMA_VERSION,
    engineId: GLICKO2_ONLINE_RATING_ENGINE_ID,
    rating: muToRating(muPrime),
    deviation: phiToDeviation(phiPrime),
    volatility,
    games: rating.games + results.length,
    updatedAt: options.updatedAt ?? rating.updatedAt,
  };
  assertValidRating(updated, "updatedRating");
  return updated;
}

export function validateOnlineRating(value: unknown, label = "rating"): OnlineRating {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const candidate = value as Partial<OnlineRating>;
  const rating: OnlineRating = {
    schemaVersion: candidate.schemaVersion as typeof ONLINE_RATING_SCHEMA_VERSION,
    engineId: candidate.engineId as string,
    rating: candidate.rating as number,
    deviation: candidate.deviation as number,
    volatility: candidate.volatility as number,
    games: candidate.games as number,
    updatedAt: candidate.updatedAt === undefined ? null : candidate.updatedAt,
  };
  assertValidRating(rating, label);
  return rating;
}

function ratingToMu(rating: number): number {
  return (rating - ONLINE_RATING_BASE) / ONLINE_RATING_SCALE;
}

function muToRating(mu: number): number {
  return ONLINE_RATING_BASE + ONLINE_RATING_SCALE * mu;
}

function deviationToPhi(deviation: number): number {
  return deviation / ONLINE_RATING_SCALE;
}

function phiToDeviation(phi: number): number {
  return ONLINE_RATING_SCALE * phi;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, opponentMu: number, opponentPhi: number): number {
  return 1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));
}

function updateVolatility(
  phi: number,
  volatility: number,
  variance: number,
  delta: number,
  tau: number
): number {
  const alpha = Math.log(volatility * volatility);
  const f = (x: number): number => {
    const expX = Math.exp(x);
    const denominator = phi * phi + variance + expX;
    return (
      (expX * (delta * delta - phi * phi - variance - expX)) /
      (2 * denominator * denominator)
    ) - ((x - alpha) / (tau * tau));
  };

  let a = alpha;
  let b: number;
  if (delta * delta > phi * phi + variance) {
    b = Math.log(delta * delta - phi * phi - variance);
  } else {
    let k = 1;
    while (f(alpha - k * tau) < 0) {
      k += 1;
    }
    b = alpha - k * tau;
  }

  let fA = f(a);
  let fB = f(b);
  while (Math.abs(b - a) > VOLATILITY_CONVERGENCE_EPSILON) {
    const c = a + ((a - b) * fA) / (fB - fA);
    const fC = f(c);
    if (fC * fB <= 0) {
      a = b;
      fA = fB;
    } else {
      fA /= 2;
    }
    b = c;
    fB = fC;
  }

  return Math.exp(a / 2);
}

function assertValidRating(rating: OnlineRating, label: string): void {
  if (rating.schemaVersion !== ONLINE_RATING_SCHEMA_VERSION) {
    throw new Error(`${label}.schemaVersion is invalid.`);
  }
  if (rating.engineId !== GLICKO2_ONLINE_RATING_ENGINE_ID) {
    throw new Error(`${label}.engineId is invalid.`);
  }
  assertFiniteNumber(rating.rating, `${label}.rating`);
  assertPositiveFiniteNumber(rating.deviation, `${label}.deviation`);
  assertPositiveFiniteNumber(rating.volatility, `${label}.volatility`);
  if (!Number.isSafeInteger(rating.games) || rating.games < 0) {
    throw new Error(`${label}.games is invalid.`);
  }
  if (rating.updatedAt !== null && !isIsoDateString(rating.updatedAt)) {
    throw new Error(`${label}.updatedAt is invalid.`);
  }
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function assertValidRatingValue(value: number, label: string): void {
  assertFiniteNumber(value, label);
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertPositiveFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} is invalid.`);
  }
}
