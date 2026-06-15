export const DEFAULT_POSTGRES_POOL_MAX_PER_STORE = 5;
export const MAX_POSTGRES_POOL_MAX_PER_STORE = 50;

function validatePostgresPoolMaxPerStore(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_POSTGRES_POOL_MAX_PER_STORE) {
    throw new Error(
      `${label} must be an integer from 1 to ${MAX_POSTGRES_POOL_MAX_PER_STORE}.`
    );
  }
  return value;
}

export function parsePostgresPoolMaxPerStore(env: NodeJS.ProcessEnv): number {
  const raw = env.POSTGRES_POOL_MAX_PER_STORE;
  if (raw === undefined || raw === "") {
    return DEFAULT_POSTGRES_POOL_MAX_PER_STORE;
  }
  return validatePostgresPoolMaxPerStore(Number(raw), "POSTGRES_POOL_MAX_PER_STORE");
}

export function resolvePostgresPoolMaxPerStore(value: number | undefined): number {
  if (value === undefined) return DEFAULT_POSTGRES_POOL_MAX_PER_STORE;
  return validatePostgresPoolMaxPerStore(value, "poolMaxPerStore");
}
