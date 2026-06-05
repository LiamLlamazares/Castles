import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";
import type { OnlineAccount } from "../accounts";
import { ONLINE_ACCOUNT_SESSION_STORAGE_KEY } from "../accounts";

export interface GoogleOAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksEndpoint?: string;
  stateSecret?: string;
  fetchImpl?: typeof fetch;
}

export interface NormalizedGoogleOAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  stateSecret: string;
  fetchImpl: typeof fetch;
}

export interface GoogleOAuthStatePayload {
  nonce: string;
  returnTo: string;
  exp: number;
}

export interface GoogleIdTokenClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  sub: string;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
}

interface GoogleIdTokenHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface GoogleJwksKey {
  kty?: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_OAUTH_CALLBACK_PATH = "/api/online/account/oauth/google/callback";
export const GOOGLE_OAUTH_STATE_COOKIE = "castles_google_oauth_state";
export const GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

function base64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signState(payloadText: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadText).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function htmlScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => {
    switch (character) {
      case "<":
        return "\\u003c";
      case ">":
        return "\\u003e";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        return character;
    }
  });
}

export function defaultGoogleOAuthRedirectUri(publicBaseUrl: string): string {
  const url = new URL(publicBaseUrl);
  url.pathname = GOOGLE_OAUTH_CALLBACK_PATH;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function normalizeGoogleOAuthProviderConfig(
  config: GoogleOAuthProviderConfig | undefined,
  publicBaseUrl: string,
  fallbackStateSecret: string
): NormalizedGoogleOAuthProviderConfig | null {
  if (!config) return null;
  const clientId = config.clientId.trim();
  const clientSecret = config.clientSecret.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: config.redirectUri?.trim() || defaultGoogleOAuthRedirectUri(publicBaseUrl),
    authorizationEndpoint: config.authorizationEndpoint?.trim() || GOOGLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: config.tokenEndpoint?.trim() || GOOGLE_TOKEN_ENDPOINT,
    jwksEndpoint: config.jwksEndpoint?.trim() || GOOGLE_JWKS_ENDPOINT,
    stateSecret: config.stateSecret?.trim() || fallbackStateSecret,
    fetchImpl: config.fetchImpl ?? fetch,
  };
}

export function encodeGoogleOAuthState(payload: GoogleOAuthStatePayload, secret: string): string {
  const payloadText = JSON.stringify(payload);
  const encodedPayload = base64Url(payloadText);
  const signature = signState(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function decodeGoogleOAuthState(
  state: string,
  secret: string,
  nowMs: number
): { ok: true; payload: GoogleOAuthStatePayload } | { ok: false; reason: string } {
  const [encodedPayload, signature, extra] = state.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return { ok: false, reason: "shape" };
  }
  const expected = signState(encodedPayload, secret);
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "signature" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "payload" };
  const nonce = parsed.nonce;
  const returnTo = parsed.returnTo;
  const exp = parsed.exp;
  if (
    typeof nonce !== "string" ||
    nonce.length < 16 ||
    typeof returnTo !== "string" ||
    !isSafeOAuthReturnPath(returnTo) ||
    typeof exp !== "number" ||
    !Number.isSafeInteger(exp)
  ) {
    return { ok: false, reason: "payload" };
  }
  if (exp <= Math.floor(nowMs / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload: { nonce, returnTo, exp } };
}

export function isSafeOAuthReturnPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const url = new URL(value, "https://castles.invalid");
    return url.origin === "https://castles.invalid" && !url.hash && url.pathname.length > 0;
  } catch {
    return false;
  }
}

export function buildGoogleOAuthAuthorizationUrl(
  config: NormalizedGoogleOAuthProviderConfig,
  state: string,
  nonce: string
): string {
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

export async function exchangeGoogleOAuthCode(
  config: NormalizedGoogleOAuthProviderConfig,
  code: string
): Promise<string> {
  const response = await config.fetchImpl(config.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed with ${response.status}.`);
  }
  const body = await response.json();
  if (!isRecord(body) || typeof body.id_token !== "string") {
    throw new Error("Google OAuth token response did not include an id_token.");
  }
  return body.id_token;
}

export function decodeGoogleIdTokenClaims(idToken: string): GoogleIdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("Google ID token is malformed.");
  }
  const claims = JSON.parse(fromBase64Url(parts[1])) as unknown;
  if (!isRecord(claims)) {
    throw new Error("Google ID token claims are malformed.");
  }
  return claims as unknown as GoogleIdTokenClaims;
}

function decodeGoogleIdTokenHeader(idToken: string): GoogleIdTokenHeader {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[0]) {
    throw new Error("Google ID token is malformed.");
  }
  const header = JSON.parse(fromBase64Url(parts[0])) as unknown;
  if (!isRecord(header)) {
    throw new Error("Google ID token header is malformed.");
  }
  const alg = header.alg;
  const kid = header.kid;
  const typ = header.typ;
  if (alg !== "RS256" || typeof kid !== "string" || kid.length === 0) {
    throw new Error("Google ID token header is invalid.");
  }
  return {
    alg,
    kid,
    ...(typeof typ === "string" ? { typ } : {}),
  };
}

async function fetchGoogleJwks(config: NormalizedGoogleOAuthProviderConfig): Promise<GoogleJwksKey[]> {
  const response = await config.fetchImpl(config.jwksEndpoint);
  if (!response.ok) {
    throw new Error(`Google OAuth JWKS fetch failed with ${response.status}.`);
  }
  const body = await response.json();
  if (!isRecord(body) || !Array.isArray(body.keys)) {
    throw new Error("Google OAuth JWKS response is malformed.");
  }
  return body.keys.filter(isRecord) as GoogleJwksKey[];
}

async function verifyGoogleIdTokenSignature(
  config: NormalizedGoogleOAuthProviderConfig,
  idToken: string,
  header: GoogleIdTokenHeader
): Promise<void> {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("Google ID token is malformed.");
  }
  const key = (await fetchGoogleJwks(config)).find((candidate) => {
    return (
      candidate.kid === header.kid &&
      candidate.kty === "RSA" &&
      (!candidate.use || candidate.use === "sig") &&
      (!candidate.alg || candidate.alg === "RS256") &&
      typeof candidate.n === "string" &&
      typeof candidate.e === "string"
    );
  });
  if (!key) {
    throw new Error("Google ID token signing key was not found.");
  }
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({
      key: {
        kty: "RSA",
        n: key.n,
        e: key.e,
      },
      format: "jwk",
    });
  } catch {
    throw new Error("Google ID token signing key is invalid.");
  }
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], "base64url");
  const verified = verifySignature("RSA-SHA256", Buffer.from(signingInput), publicKey, signature);
  if (!verified) {
    throw new Error("Google ID token signature is invalid.");
  }
}

export function validateGoogleIdTokenClaims(
  claims: GoogleIdTokenClaims,
  clientId: string,
  nonce: string,
  nowMs: number
): void {
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("Google ID token issuer is invalid.");
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId)) {
    throw new Error("Google ID token audience is invalid.");
  }
  if (typeof claims.exp !== "number" || claims.exp <= Math.floor(nowMs / 1000)) {
    throw new Error("Google ID token is expired.");
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 256) {
    throw new Error("Google ID token subject is invalid.");
  }
  if (claims.nonce !== nonce) {
    throw new Error("Google ID token nonce is invalid.");
  }
  if (claims.email_verified !== undefined && claims.email_verified !== true && claims.email_verified !== "true") {
    throw new Error("Google account email is not verified.");
  }
}

export async function verifyGoogleIdToken(
  config: NormalizedGoogleOAuthProviderConfig,
  idToken: string,
  nonce: string,
  nowMs: number
): Promise<GoogleIdTokenClaims> {
  const header = decodeGoogleIdTokenHeader(idToken);
  const claims = decodeGoogleIdTokenClaims(idToken);
  await verifyGoogleIdTokenSignature(config, idToken, header);
  validateGoogleIdTokenClaims(claims, config.clientId, nonce, nowMs);
  return claims;
}

export function googleDisplayNameCandidates(claims: Pick<GoogleIdTokenClaims, "name" | "given_name" | "email" | "sub">): string[] {
  const candidates = [
    claims.name,
    claims.given_name,
    typeof claims.email === "string" ? claims.email.split("@")[0] : undefined,
    "Google Player",
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
  const suffix = claims.sub.slice(-6);
  return [
    ...candidates,
    ...candidates.map((candidate) => `${candidate} ${suffix}`),
    `Google Player ${suffix}`,
  ];
}

export function renderGoogleOAuthSessionHtml(input: {
  account: OnlineAccount;
  sessionId: string;
  token: string;
  returnTo: string;
}): string {
  const storedSession = {
    sessionId: input.sessionId,
    token: input.token,
    account: input.account,
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signing in...</title>
</head>
<body>
  <p>Signing in...</p>
  <script>
    localStorage.setItem(${htmlScriptJson(ONLINE_ACCOUNT_SESSION_STORAGE_KEY)}, ${htmlScriptJson(JSON.stringify(storedSession))});
    location.replace(${htmlScriptJson(input.returnTo)});
  </script>
</body>
</html>`;
}
