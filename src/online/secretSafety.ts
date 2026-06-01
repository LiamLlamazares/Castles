const SECRET_QUERY_PARAMS = new Set([
  "token",
  "whitetoken",
  "blacktoken",
  "bearertoken",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "auth",
  "authheader",
  "cookie",
  "credential",
  "session",
  "sessionid",
  "sid",
  "secret",
]);

const SECRET_ASSIGNMENT =
  /(^|[?&#;\s;])(token|white_?token|black_?token|bearer_?token|access_?token|refresh_?token|authorization|auth|auth_?header|cookie|credential|session|session_?id|sid|secret)\s*=/i;
const SECRET_HEADER = /\b(authorization|cookie|set-cookie)\s*:/i;
const BEARER_VALUE = /\bbearer\s+[a-z0-9._~+/=-]+/i;

function normalizeSecretKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function paramsContainSecret(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    const normalized = normalizeSecretKey(key);
    if (SECRET_QUERY_PARAMS.has(normalized) || isSecretLikeKey(normalized)) {
      return true;
    }
  }
  return false;
}

function urlContainsSecretParams(value: string): boolean {
  try {
    const url = new URL(value, "https://castles.invalid");
    if (paramsContainSecret(url.searchParams)) return true;
    if (!url.hash) return false;

    const hash = url.hash.slice(1);
    const queryIndex = hash.indexOf("?");
    const hashQuery = queryIndex >= 0 ? hash.slice(queryIndex + 1) : hash;
    if (hashQuery.includes("=") && paramsContainSecret(new URLSearchParams(hashQuery))) {
      return true;
    }
    return SECRET_ASSIGNMENT.test(hash);
  } catch {
    return false;
  }
}

export function isSecretLikeKey(key: string): boolean {
  const normalized = normalizeSecretKey(key);
  return (
    normalized.includes("token") ||
    normalized.includes("credential") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("session") ||
    normalized.includes("bearer") ||
    normalized.includes("secret") ||
    normalized.includes("inviteurl") ||
    normalized.includes("auth")
  );
}

export function stringContainsDurableSecret(value: string): boolean {
  return (
    urlContainsSecretParams(value) ||
    SECRET_ASSIGNMENT.test(value) ||
    SECRET_HEADER.test(value) ||
    BEARER_VALUE.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function containsDurableSecret(value: unknown): boolean {
  if (typeof value === "string") {
    return stringContainsDurableSecret(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsDurableSecret);
  }
  if (!isRecord(value)) {
    return false;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (isSecretLikeKey(key) || containsDurableSecret(entry)) {
      return true;
    }
  }
  return false;
}
