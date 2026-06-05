import type { CreatedOnlineGame } from "./OnlineGameService";
import {
  validateOnlineAccountChallengeDirectoryResponse,
  validateOnlineChallengeSummary,
  type OnlineAccountChallengeDirectoryResponse,
  type OnlineAccountChallengeDirectoryState,
  type OnlineAccountChallengeListItem,
  type OnlineChallengeSummary,
} from "./challenges";
import { validateOnlineGameSnapshot } from "./protocol";
import { ONLINE_PROTOCOL_VERSION, isSupportedOnlineProtocolVersion } from "./protocolVersion";
import { stringContainsDurableSecret } from "./secretSafety";
import {
  ONLINE_ACCOUNT_SESSION_STORAGE_KEY,
  validateOnlineAccount,
  type OnlineAccount,
  type OnlineAccountCreateResponse,
  type OnlineAccountMeResponse,
  type OnlineAccountOAuthProvidersResponse,
  type OnlineAccountSessionSummary,
  type OnlineAccountSessionsResponse,
  type OnlineAccountSessionsRevokeResponse,
  type OnlineAccountDeleteResponse,
} from "./accounts";
import {
  ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION,
  ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
  ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION,
  type OnlineAccountFollowingResponse,
  type OnlineAccountPrivacyPatch,
  type OnlineAccountPrivacyResponse,
  type OnlineAccountPrivacySettings,
  type OnlineAccountProfileResponse,
  type OnlineAccountPublicProfile,
  type OnlineAccountPublicRating,
  type OnlineAccountReportInput,
  type OnlineAccountReportReason,
  type OnlineAccountReportResponse,
  type OnlineRatingLeaderboardEntry,
  type OnlineRatingLeaderboardResponse,
  type OnlineRatingLeaderboardScope,
} from "./social";
import {
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  validateOnlineGameDirectoryResponse,
  validateOnlineGameSummary,
  type OnlineGameDirectoryClockFilter,
  type OnlineGameDirectoryResponse,
  type OnlineGameDirectoryResultFilter,
  type OnlineGameDirectoryState,
  type OnlineGameSummary,
} from "./readModel";
import {
  validateOpenSeekDirectoryResponse,
  validateOpenSeekSummary,
  type OpenSeekDirectoryResponse,
  type OpenSeekDirectoryClockFilter,
  type OpenSeekDirectoryState,
  type OpenSeekDirectoryVpFilter,
  type OpenSeekSummary,
  type OpenSeekSeat,
  type OpenSeekVisibility,
} from "./seeks";
import {
  OnlineConnectionStatus,
  OnlineGameResultDTO,
  OnlineGameSetupDTO,
  OnlineGameSnapshotDTO,
  type OnlineRatingMode,
  type OnlineRejectCode,
} from "./types";
import type { OnlinePlayerSettableGameVisibility } from "./visibility";

export class OnlineRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: OnlineRejectCode,
    message: string
  ) {
    super(message);
    this.name = "OnlineRequestError";
  }
}

const ONLINE_REJECT_CODES = new Set<OnlineRejectCode>([
  "unauthorized",
  "stale_action",
  "wrong_player",
  "illegal_action",
  "duplicate_action",
  "game_over",
  "not_found",
  "bad_request",
  "bad_json",
  "not_joined",
  "unknown_message",
  "not_allowed",
  "rate_limited",
  "persistence_failed",
]);
const MAX_ONLINE_ERROR_MESSAGE_LENGTH = 240;

export interface OnlineJoinParams {
  gameId: string;
  seat: "w" | "b";
  token: string;
}

export interface OnlineSpectatorParams {
  gameId: string;
}

export interface OnlineChallengeParams {
  challengeId: string;
  role: "challenger" | "challenged";
  token: string;
}

export interface OnlineChallengeGameInvite {
  gameId: string;
  seat: "w" | "b";
  token: string;
  url: string;
}

export interface OpenSeekCreatorParams {
  seekId: string;
  token: string;
}

export interface OpenSeekResponse {
  role: "creator";
  summary: OpenSeekSummary;
  gameInvite?: OnlineChallengeGameInvite;
}

export interface OnlineAccountSessionParams {
  token: string;
}

export interface StoredOnlineAccountSession extends OnlineAccountSessionParams {
  sessionId: string;
  account?: OnlineAccount;
}

export interface OpenSeekAcceptResponse {
  role: "acceptor";
  summary: OpenSeekSummary;
  gameInvite: OnlineChallengeGameInvite;
}

export type QuickMatchResponse =
  | {
      outcome: "matched";
      role: "acceptor";
      summary: OpenSeekSummary;
      gameInvite: OnlineChallengeGameInvite;
    }
  | {
      outcome: "waiting";
      role: "creator";
      seekId: string;
      summary: OpenSeekSummary;
      creator: { token: string };
    };

export interface OnlineChallengeResponse {
  role: "challenger" | "challenged";
  summary: OnlineChallengeSummary;
  gameInvite?: OnlineChallengeGameInvite;
}

export interface OnlineAccountGameRejoinResponse {
  gameInvite: OnlineChallengeGameInvite;
}

export interface OnlineAccountSessionRevokeResponse {
  protocolVersion: typeof ONLINE_PROTOCOL_VERSION;
  revoked: boolean;
}

export type {
  OnlineAccountSessionSummary,
  OnlineAccountSessionsResponse,
  OnlineAccountSessionsRevokeResponse,
  OnlineAccountDeleteResponse,
  OnlineAccountFollowingResponse,
  OnlineAccountPrivacyPatch,
  OnlineAccountPrivacyResponse,
  OnlineAccountProfileResponse,
  OnlineAccountPublicProfile,
  OnlineAccountPublicRating,
  OnlineAccountReportInput,
  OnlineAccountReportResponse,
  OnlineRatingLeaderboardEntry,
  OnlineRatingLeaderboardResponse,
  OnlineAccountChallengeDirectoryResponse,
  OnlineAccountChallengeListItem,
};

export interface CreatedOnlineChallenge {
  challengeId: string;
  summary: OnlineChallengeSummary;
  challenger: { url: string };
  challenged: { url: string };
}

export interface CreatedOpenSeek {
  seekId: string;
  summary: OpenSeekSummary;
  creator: { token: string };
}

interface OnlineJoinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled online connection status: ${value}`);
}

function storageKey(gameId: string, seat: "w" | "b"): string {
  return `castles_online_join:${gameId}:${seat}`;
}

function opponentInviteStorageKey(gameId: string): string {
  return `castles_online_opponent_invite:${gameId}`;
}

function challengeStorageKey(challengeId: string, role: "challenger" | "challenged"): string {
  return `castles_online_challenge:${challengeId}:${role}`;
}

function challengeShareUrlStorageKey(challengeId: string): string {
  return `castles_online_challenge_share:${challengeId}`;
}

function openSeekCreatorStorageKey(seekId: string): string {
  return `castles_online_seek_creator:${seekId}`;
}

const OPEN_SEEK_CREATOR_INDEX_STORAGE_KEY = "castles_online_seek_creator:index";
const ANONYMOUS_SESSION_STORAGE_KEY = "castles_online_anonymous_session_id";
export { ONLINE_ACCOUNT_SESSION_STORAGE_KEY };

function defaultAnonymousSessionIdFactory(): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `anon_${randomId}`;
}

function isValidAnonymousSessionId(value: string | null): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export function parseOnlineJoinParams(urlText: string): OnlineJoinParams | null {
  const url = new URL(urlText);
  const gameId = url.searchParams.get("onlineGame");
  const seat = url.searchParams.get("seat");
  const token = url.searchParams.get("token");

  if (!gameId || !token || (seat !== "w" && seat !== "b")) {
    return null;
  }

  return { gameId, seat, token };
}

export function parseOnlineSpectatorParams(urlText: string): OnlineSpectatorParams | null {
  const url = new URL(urlText);
  const gameId = url.searchParams.get("onlineGame");
  const view = url.searchParams.get("view");

  if (!gameId || view !== "spectator") {
    return null;
  }

  return { gameId };
}

export function parseOnlineChallengeParams(urlText: string): OnlineChallengeParams | null {
  const url = new URL(urlText);
  const challengeId = url.searchParams.get("onlineChallenge");
  const role = url.searchParams.get("challengeRole");
  const token = new URLSearchParams(url.hash.slice(1)).get("challengeToken");

  if (!challengeId || !token || (role !== "challenger" && role !== "challenged")) {
    return null;
  }

  return { challengeId, role, token };
}

export function buildSpectatorUrl(originOrUrl: string, gameId: string): string {
  const url = new URL(originOrUrl);
  url.searchParams.delete("seat");
  url.searchParams.delete("token");
  url.searchParams.delete("pgn");
  url.searchParams.delete("game");
  url.searchParams.delete("onlineChallenge");
  url.searchParams.delete("challengeRole");
  url.searchParams.delete("challengeToken");
  url.searchParams.set("onlineGame", gameId);
  url.searchParams.set("view", "spectator");
  url.hash = "";
  return url.toString();
}

export function rememberOnlineJoinParams(
  join: OnlineJoinParams,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.setItem(storageKey(join.gameId, join.seat), join.token);
}

export function forgetOnlineJoinParams(
  join: Pick<OnlineJoinParams, "gameId" | "seat">,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.removeItem(storageKey(join.gameId, join.seat));
}

export function rememberOnlineOpponentInviteUrl(
  gameId: string,
  inviteUrl: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.setItem(opponentInviteStorageKey(gameId), inviteUrl);
}

export function forgetOnlineOpponentInviteUrl(
  gameId: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.removeItem(opponentInviteStorageKey(gameId));
}

export function rememberOnlineChallengeParams(
  challenge: OnlineChallengeParams,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.setItem(challengeStorageKey(challenge.challengeId, challenge.role), challenge.token);
}

export function forgetOnlineChallengeParams(
  challenge: OnlineChallengeParams,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.removeItem(challengeStorageKey(challenge.challengeId, challenge.role));
}

export function rememberOnlineChallengeShareUrl(
  challengeId: string,
  shareUrl: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.setItem(challengeShareUrlStorageKey(challengeId), shareUrl);
}

export function resolveOnlineChallengeShareUrl(
  challengeId: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): string | null {
  return storage?.getItem(challengeShareUrlStorageKey(challengeId)) ?? null;
}

export function forgetOnlineChallengeShareUrl(
  challengeId: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.removeItem(challengeShareUrlStorageKey(challengeId));
}

export function rememberOpenSeekCreatorParams(
  seek: OpenSeekCreatorParams,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  if (!storage) return;
  storage.setItem(openSeekCreatorStorageKey(seek.seekId), seek.token);
  const nextIndex = [
    seek.seekId,
    ...readOpenSeekCreatorIndex(storage).filter((candidate) => candidate !== seek.seekId),
  ];
  storage.setItem(OPEN_SEEK_CREATOR_INDEX_STORAGE_KEY, JSON.stringify(nextIndex));
}

export function resolveOpenSeekCreatorParams(
  seekId: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): OpenSeekCreatorParams | null {
  const token = storage?.getItem(openSeekCreatorStorageKey(seekId));
  return token ? { seekId, token } : null;
}

function readOpenSeekCreatorIndex(storage: OnlineJoinStorage | null): string[] {
  if (!storage) return [];
  const raw = storage.getItem(OPEN_SEEK_CREATOR_INDEX_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => isValidAnonymousSessionId(value));
  } catch {
    return [];
  }
}

export function listOpenSeekCreatorParams(
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): OpenSeekCreatorParams[] {
  if (!storage) return [];
  return readOpenSeekCreatorIndex(storage)
    .map((seekId) => resolveOpenSeekCreatorParams(seekId, storage))
    .filter((value): value is OpenSeekCreatorParams => value !== null);
}

export function forgetOpenSeekCreatorParams(
  seek: Pick<OpenSeekCreatorParams, "seekId">,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  if (!storage) return;
  storage.removeItem(openSeekCreatorStorageKey(seek.seekId));
  const nextIndex = readOpenSeekCreatorIndex(storage).filter((seekId) => seekId !== seek.seekId);
  if (nextIndex.length > 0) {
    storage.setItem(OPEN_SEEK_CREATOR_INDEX_STORAGE_KEY, JSON.stringify(nextIndex));
  } else {
    storage.removeItem(OPEN_SEEK_CREATOR_INDEX_STORAGE_KEY);
  }
}

export function resolveOnlineOpponentInviteUrl(
  gameId: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): string | null {
  return storage?.getItem(opponentInviteStorageKey(gameId)) ?? null;
}

export function resolveOnlineAnonymousSessionId(
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage,
  idFactory: () => string = defaultAnonymousSessionIdFactory
): string {
  const stored = storage?.getItem(ANONYMOUS_SESSION_STORAGE_KEY) ?? null;
  if (isValidAnonymousSessionId(stored)) {
    return stored;
  }

  const nextId = idFactory();
  if (!isValidAnonymousSessionId(nextId)) {
    throw new Error("Generated online anonymous session id is invalid.");
  }
  storage?.setItem(ANONYMOUS_SESSION_STORAGE_KEY, nextId);
  return nextId;
}

function isValidStoredAccountSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isValidStoredAccountToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function parseStoredOnlineAccountSession(value: unknown): StoredOnlineAccountSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sessionId = (value as { sessionId?: unknown }).sessionId;
  const token = (value as { token?: unknown }).token;
  if (!isValidStoredAccountSessionId(sessionId) || !isValidStoredAccountToken(token)) return null;
  const rawAccount = (value as { account?: unknown }).account;
  if (rawAccount === undefined) {
    return { sessionId, token };
  }
  const account = validateOnlineAccount(rawAccount, "storedAccount");
  if (!account.ok) return null;
  return { sessionId, token, account: account.value };
}

export function rememberOnlineAccountSession(
  session: StoredOnlineAccountSession,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.localStorage
): void {
  if (!storage) return;
  storage.setItem(
    ONLINE_ACCOUNT_SESSION_STORAGE_KEY,
    JSON.stringify({
      sessionId: session.sessionId,
      token: session.token,
      ...(session.account ? { account: session.account } : {}),
    })
  );
}

export function resolveOnlineAccountSession(
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.localStorage
): StoredOnlineAccountSession | null {
  if (!storage) return null;
  const raw = storage.getItem(ONLINE_ACCOUNT_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return parseStoredOnlineAccountSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function forgetOnlineAccountSession(
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.localStorage
): void {
  storage?.removeItem(ONLINE_ACCOUNT_SESSION_STORAGE_KEY);
}

export function resolveOnlineChallengeParams(
  urlText: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): OnlineChallengeParams | null {
  const parsed = parseOnlineChallengeParams(urlText);
  if (parsed) {
    rememberOnlineChallengeParams(parsed, storage);
    return parsed;
  }

  const url = new URL(urlText);
  const challengeId = url.searchParams.get("onlineChallenge");
  const role = url.searchParams.get("challengeRole");
  if (!challengeId || (role !== "challenger" && role !== "challenged")) {
    return null;
  }
  const token = storage?.getItem(challengeStorageKey(challengeId, role));
  return token ? { challengeId, role, token } : null;
}

export function resolveOnlineJoinParams(
  urlText: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): OnlineJoinParams | null {
  const parsed = parseOnlineJoinParams(urlText);
  if (parsed) {
    rememberOnlineJoinParams(parsed, storage);
    return parsed;
  }

  const url = new URL(urlText);
  const gameId = url.searchParams.get("onlineGame");
  const seat = url.searchParams.get("seat");
  if (!gameId || (seat !== "w" && seat !== "b")) {
    return null;
  }

  const token = storage?.getItem(storageKey(gameId, seat));
  return token ? { gameId, seat, token } : null;
}

export function resolveStoredOnlineJoinParams(
  gameId: string,
  seat: "w" | "b",
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): OnlineJoinParams | null {
  const token = storage?.getItem(storageKey(gameId, seat));
  return token ? { gameId, seat, token } : null;
}

export function removeOnlineTokenFromUrl(urlText: string): string {
  const url = new URL(urlText);
  url.searchParams.delete("token");
  return url.toString();
}

export function removeOnlineChallengeTokenFromUrl(urlText: string): string {
  const url = new URL(urlText);
  const hashParams = new URLSearchParams(url.hash.slice(1));
  hashParams.delete("challengeToken");
  const nextHash = hashParams.toString();
  url.hash = nextHash ? nextHash : "";
  return url.toString();
}

export function buildOnlineWebSocketUrl(originOrUrl: string): string {
  const url = new URL(originOrUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getReconnectDelayMs(attempt: number): number {
  const cappedAttempt = Math.min(Math.max(attempt, 0), 6);
  return Math.min(10_000, 500 * 2 ** cappedAttempt);
}

export function shouldApplyOnlineSnapshotVersion(
  latestVersion: number | null,
  nextVersion: number
): boolean {
  return latestVersion === null || nextVersion > latestVersion;
}

export function shouldApplyOnlineSnapshot(
  latestSnapshot: OnlineGameSnapshotDTO | null,
  nextSnapshot: OnlineGameSnapshotDTO
): boolean {
  if (!latestSnapshot) return true;
  if (nextSnapshot.version > latestSnapshot.version) return true;
  if (nextSnapshot.version < latestSnapshot.version) return false;

  const latestResult = latestSnapshot.result;
  const nextResult = nextSnapshot.result;
  if (
    latestResult?.winner !== nextResult?.winner ||
    latestResult?.reason !== nextResult?.reason
  ) {
    return true;
  }

  const latestServerNow = latestSnapshot.clock?.serverNow;
  const nextServerNow = nextSnapshot.clock?.serverNow;
  if (latestSnapshot.clock === undefined && nextSnapshot.clock !== undefined) {
    return true;
  }

  return (
    typeof latestServerNow === "number" &&
    typeof nextServerNow === "number" &&
    nextServerNow > latestServerNow
  );
}

export function formatOnlineGameResult(result: OnlineGameResultDTO): string {
  const winner = result.winner === "w" ? "White" : "Black";
  switch (result.reason) {
    case "timeout":
      return `${winner} wins on time`;
    case "resignation":
      return `${winner} wins by resignation`;
    case "castle_control":
      return `${winner} wins by castle control`;
    case "victory_points":
      return `${winner} wins by victory points`;
    case "monarch_captured":
    default:
      return `${winner} wins`;
  }
}

export function formatOnlineConnectionStatus(status: OnlineConnectionStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Live";
    case "disconnected":
      return "Disconnected";
    case "resyncing":
      return "Resyncing";
    case "access-denied":
      return "Access denied";
    case "protocol-error":
      return "Protocol error";
    case "server-error":
      return "Server error";
    case "terminal":
      return "Complete";
    default:
      return assertNever(status);
  }
}

export function formatOnlinePendingConnectionMessage(
  status: OnlineConnectionStatus
): string {
  switch (status) {
    case "resyncing":
      return "Resyncing online game";
    case "access-denied":
    case "protocol-error":
    case "server-error":
      return formatOnlineConnectionStatus(status);
    case "disconnected":
      return "Disconnected from online game";
    case "terminal":
      return "Online game complete";
    case "idle":
    case "connecting":
    case "connected":
      return "Connecting online game";
    default:
      return assertNever(status);
  }
}

export async function copyOnlineInviteUrl(
  inviteUrl: string,
  clipboard: ClipboardWriter | undefined =
    typeof navigator === "undefined" ? undefined : navigator.clipboard
): Promise<void> {
  if (!clipboard) {
    throw new Error("Clipboard API is not available.");
  }

  await clipboard.writeText(inviteUrl);
}

function accountAuthorizationHeader(account?: OnlineAccountSessionParams): Record<string, string> {
  return account ? { authorization: `Bearer ${account.token}` } : {};
}

function validateOnlineAccountResponse(body: unknown, label: string): OnlineAccount {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} response was malformed.`);
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(`${label} response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`);
  }
  const account = validateOnlineAccount((body as { account?: unknown }).account);
  if (!account.ok) {
    throw new Error(`${label} response was malformed: ${account.error.message}`);
  }
  return account.value;
}

function validateVersionedObject(body: unknown, label: string): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} response was malformed.`);
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(`${label} response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`);
  }
  return body as Record<string, unknown>;
}

async function createOnlineRequestError(response: Response, fallbackMessage: string): Promise<Error> {
  try {
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Error(fallbackMessage);
    }
    const error = (body as { error?: unknown }).error;
    if (!error || typeof error !== "object" || Array.isArray(error)) {
      return new Error(fallbackMessage);
    }
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    if (
      typeof code === "string" &&
      ONLINE_REJECT_CODES.has(code as OnlineRejectCode) &&
      typeof message === "string" &&
      message.length > 0 &&
      message.length <= MAX_ONLINE_ERROR_MESSAGE_LENGTH &&
      !stringContainsDurableSecret(message)
    ) {
      return new OnlineRequestError(response.status, code as OnlineRejectCode, message);
    }
  } catch {
    // Keep the caller's route-specific fallback for non-JSON error responses.
  }
  return new Error(fallbackMessage);
}

function validateOnlineAccountPublicRating(
  value: unknown,
  label: string
): OnlineAccountPublicRating {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid.`);
  }
  const record = value as Record<string, unknown>;
  const allowedRatingKeys = new Set(["schemaVersion", "rating", "display", "provisional", "games", "updatedAt"]);
  for (const key of Object.keys(record)) {
    if (!allowedRatingKeys.has(key)) {
      throw new Error(`${label} contains unsupported data.`);
    }
  }
  if (record.schemaVersion !== ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION) {
    throw new Error(`${label} schemaVersion is invalid.`);
  }
  if (typeof record.rating !== "number" || !Number.isSafeInteger(record.rating)) {
    throw new Error(`${label} value is invalid.`);
  }
  if (
    typeof record.display !== "string" ||
    record.display.length === 0 ||
    record.display.length > 16 ||
    stringContainsDurableSecret(record.display)
  ) {
    throw new Error(`${label} display is invalid.`);
  }
  if (typeof record.provisional !== "boolean") {
    throw new Error(`${label} provisional flag is invalid.`);
  }
  if (typeof record.games !== "number" || !Number.isSafeInteger(record.games) || record.games < 0) {
    throw new Error(`${label} games is invalid.`);
  }
  if (
    record.updatedAt !== null &&
    (typeof record.updatedAt !== "string" || Number.isNaN(Date.parse(record.updatedAt)))
  ) {
    throw new Error(`${label} updatedAt is invalid.`);
  }
  return {
    schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
    rating: record.rating,
    display: record.display,
    provisional: record.provisional,
    games: record.games,
    updatedAt: record.updatedAt as string | null,
  };
}

function validateOnlineAccountPublicProfile(
  value: unknown,
  label: string
): OnlineAccountPublicProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} was malformed.`);
  }
  const record = value as Record<string, unknown>;
  const allowedProfileKeys = new Set(["schemaVersion", "displayName", "rating", "presence", "relationship"]);
  for (const key of Object.keys(record)) {
    if (!allowedProfileKeys.has(key)) {
      throw new Error(`${label} was malformed: profile contains unsupported data.`);
    }
  }
  if (record.schemaVersion !== ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION) {
    throw new Error(`${label} was malformed: schemaVersion is invalid.`);
  }
  if (typeof record.displayName !== "string" || record.displayName.length === 0) {
    throw new Error(`${label} was malformed: displayName is invalid.`);
  }
  if (stringContainsDurableSecret(record.displayName)) {
    throw new Error(`${label} was malformed: displayName must not contain secrets.`);
  }
  let rating: OnlineAccountPublicProfile["rating"];
  if (record.rating !== undefined) {
    rating = validateOnlineAccountPublicRating(record.rating, `${label} was malformed: rating`);
  }
  const presence = record.presence;
  if (!presence || typeof presence !== "object" || Array.isArray(presence)) {
    throw new Error(`${label} was malformed: presence is invalid.`);
  }
  const presenceRecord = presence as Record<string, unknown>;
  const allowedPresenceKeys = new Set(["visibility", "status"]);
  for (const key of Object.keys(presenceRecord)) {
    if (!allowedPresenceKeys.has(key)) {
      throw new Error(`${label} was malformed: presence contains unsupported data.`);
    }
  }
  if (presenceRecord.visibility !== "visible" && presenceRecord.visibility !== "hidden") {
    throw new Error(`${label} was malformed: presence visibility is invalid.`);
  }
  if (
    presenceRecord.status !== null &&
    presenceRecord.status !== "online" &&
    presenceRecord.status !== "recent" &&
    presenceRecord.status !== "away" &&
    presenceRecord.status !== "offline"
  ) {
    throw new Error(`${label} was malformed: presence status is invalid.`);
  }
  if (presenceRecord.visibility === "hidden" && presenceRecord.status !== null) {
    throw new Error(`${label} was malformed: hidden presence must not include status.`);
  }
  if (presenceRecord.visibility === "visible" && presenceRecord.status === null) {
    throw new Error(`${label} was malformed: visible presence must include status.`);
  }
  const relationship = record.relationship;
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
    throw new Error(`${label} was malformed: relationship is invalid.`);
  }
  const relationshipRecord = relationship as Record<string, unknown>;
  const allowedRelationshipKeys = new Set(["self", "following", "followedBy", "blocked"]);
  for (const key of Object.keys(relationshipRecord)) {
    if (!allowedRelationshipKeys.has(key)) {
      throw new Error(`${label} was malformed: relationship contains unsupported data.`);
    }
  }
  if (
    typeof relationshipRecord.self !== "boolean" ||
    typeof relationshipRecord.following !== "boolean" ||
    typeof relationshipRecord.blocked !== "boolean" ||
    (relationshipRecord.followedBy !== undefined && typeof relationshipRecord.followedBy !== "boolean")
  ) {
    throw new Error(`${label} was malformed: relationship is invalid.`);
  }
  return {
    schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
    displayName: record.displayName,
    ...(rating ? { rating } : {}),
    presence: {
      visibility: presenceRecord.visibility,
      status: presenceRecord.status,
    },
    relationship: {
      self: relationshipRecord.self,
      following: relationshipRecord.following,
      followedBy: relationshipRecord.followedBy === true,
      blocked: relationshipRecord.blocked,
    },
  };
}

function validateOnlineAccountPrivacySettings(
  value: unknown,
  label: string
): OnlineAccountPrivacySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} was malformed.`);
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION) {
    throw new Error(`${label} was malformed: schemaVersion is invalid.`);
  }
  if (record.followPolicy !== "everyone" && record.followPolicy !== "nobody") {
    throw new Error(`${label} was malformed: followPolicy is invalid.`);
  }
  if (
    record.presencePolicy !== "followed" &&
    record.presencePolicy !== "everyone" &&
    record.presencePolicy !== "nobody"
  ) {
    throw new Error(`${label} was malformed: presencePolicy is invalid.`);
  }
  if (
    record.challengePolicy !== "followed" &&
    record.challengePolicy !== "everyone" &&
    record.challengePolicy !== "nobody"
  ) {
    throw new Error(`${label} was malformed: challengePolicy is invalid.`);
  }
  if (record.updatedAt !== null && (typeof record.updatedAt !== "string" || Number.isNaN(Date.parse(record.updatedAt)))) {
    throw new Error(`${label} was malformed: updatedAt is invalid.`);
  }
  return {
    schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
    followPolicy: record.followPolicy,
    presencePolicy: record.presencePolicy,
    challengePolicy: record.challengePolicy,
    updatedAt: record.updatedAt,
  };
}

function validateProfileResponse(body: unknown, label: string): OnlineAccountProfileResponse {
  const record = validateVersionedObject(body, label);
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    profile: validateOnlineAccountPublicProfile(record.profile, `${label}.profile`),
  };
}

function validateOnlineAccountReportReason(value: unknown, label: string): OnlineAccountReportReason {
  if (
    value !== "abuse" &&
    value !== "cheating" &&
    value !== "spam" &&
    value !== "impersonation" &&
    value !== "other"
  ) {
    throw new Error(`${label} was malformed: reason is invalid.`);
  }
  return value;
}

function validateOnlineAccountReportResponse(body: unknown, label: string): OnlineAccountReportResponse {
  const record = validateVersionedObject(body, label);
  const allowedResponseKeys = new Set(["protocolVersion", "report"]);
  for (const key of Object.keys(record)) {
    if (!allowedResponseKeys.has(key)) {
      throw new Error(`${label} response was malformed: response contains unsupported data.`);
    }
  }
  const report = record.report;
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error(`${label} response was malformed: report is invalid.`);
  }
  const reportRecord = report as Record<string, unknown>;
  const allowedReportKeys = new Set(["schemaVersion", "targetDisplayName", "reason", "createdAt"]);
  for (const key of Object.keys(reportRecord)) {
    if (!allowedReportKeys.has(key)) {
      throw new Error(`${label} response was malformed: report contains unsupported data.`);
    }
  }
  if (reportRecord.schemaVersion !== ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION) {
    throw new Error(`${label} response was malformed: report schemaVersion is invalid.`);
  }
  if (typeof reportRecord.targetDisplayName !== "string" || reportRecord.targetDisplayName.length === 0) {
    throw new Error(`${label} response was malformed: targetDisplayName is invalid.`);
  }
  if (stringContainsDurableSecret(reportRecord.targetDisplayName)) {
    throw new Error(`${label} response was malformed: targetDisplayName must not contain secrets.`);
  }
  if (typeof reportRecord.createdAt !== "string" || Number.isNaN(Date.parse(reportRecord.createdAt))) {
    throw new Error(`${label} response was malformed: createdAt is invalid.`);
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    report: {
      schemaVersion: ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION,
      targetDisplayName: reportRecord.targetDisplayName,
      reason: validateOnlineAccountReportReason(reportRecord.reason, `${label}.report`),
      createdAt: reportRecord.createdAt,
    },
  };
}

export async function fetchOnlineAccountProfile(
  account: OnlineAccountSessionParams,
  displayName: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountProfileResponse> {
  const response = await fetchImpl(`/api/online/profiles/${encodeURIComponent(displayName)}`, {
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not load online profile (${response.status})`);
  }
  return validateProfileResponse(await response.json(), "Online profile");
}

export async function fetchOnlineAccountFollowing(
  account: OnlineAccountSessionParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountFollowingResponse> {
  const response = await fetchImpl("/api/online/account/follows", {
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not load followed online accounts (${response.status})`);
  }
  const record = validateVersionedObject(await response.json(), "Online following");
  if (!Array.isArray(record.following)) {
    throw new Error("Online following response was malformed: following is invalid.");
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    following: record.following.map((profile, index) =>
      validateOnlineAccountPublicProfile(profile, `Online following.following[${index}]`)
    ),
  };
}

function validateOnlineRatingLeaderboardEntry(
  value: unknown,
  label: string
): OnlineRatingLeaderboardEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} was malformed.`);
  }
  const record = value as Record<string, unknown>;
  const allowedEntryKeys = new Set(["schemaVersion", "displayName", "rating"]);
  for (const key of Object.keys(record)) {
    if (!allowedEntryKeys.has(key)) {
      throw new Error(`${label} was malformed: entry contains unsupported data.`);
    }
  }
  if (record.schemaVersion !== ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION) {
    throw new Error(`${label} was malformed: schemaVersion is invalid.`);
  }
  if (typeof record.displayName !== "string" || record.displayName.length === 0) {
    throw new Error(`${label} was malformed: displayName is invalid.`);
  }
  if (stringContainsDurableSecret(record.displayName)) {
    throw new Error(`${label} was malformed: displayName must not contain secrets.`);
  }
  return {
    schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
    displayName: record.displayName,
    rating: validateOnlineAccountPublicRating(record.rating, `${label} was malformed: rating`),
  };
}

function validateOnlineRatingLeaderboardResponse(
  body: unknown,
  label: string
): OnlineRatingLeaderboardResponse {
  const record = validateVersionedObject(body, label);
  const allowedResponseKeys = new Set(["protocolVersion", "schemaVersion", "scope", "entries"]);
  for (const key of Object.keys(record)) {
    if (!allowedResponseKeys.has(key)) {
      throw new Error(`${label} response was malformed: response contains unsupported data.`);
    }
  }
  if (record.schemaVersion !== ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION) {
    throw new Error(`${label} response was malformed: schemaVersion is invalid.`);
  }
  if (record.scope !== "global" && record.scope !== "following") {
    throw new Error(`${label} response was malformed: scope is invalid.`);
  }
  if (!Array.isArray(record.entries)) {
    throw new Error(`${label} response was malformed: entries is invalid.`);
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    schemaVersion: ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION,
    scope: record.scope,
    entries: record.entries.map((entry, index) =>
      validateOnlineRatingLeaderboardEntry(entry, `${label}.entries[${index}]`)
    ),
  };
}

export async function fetchOnlineRatingLeaderboard(
  options: { limit?: number; scope?: OnlineRatingLeaderboardScope; account?: OnlineAccountSessionParams } = {},
  fetchImpl: typeof fetch = fetch
): Promise<OnlineRatingLeaderboardResponse> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.scope !== undefined) params.set("scope", options.scope);
  const query = params.toString();
  const path = query ? `/api/online/ratings/leaderboard?${query}` : "/api/online/ratings/leaderboard";
  const response = options.scope === "following" && options.account
    ? await fetchImpl(path, { headers: accountAuthorizationHeader(options.account) })
    : await fetchImpl(path);
  if (!response.ok) {
    throw new Error(`Could not load online rating leaderboard (${response.status})`);
  }
  return validateOnlineRatingLeaderboardResponse(await response.json(), "Online rating leaderboard");
}

async function putOrDeleteOnlineAccountRelationship(
  account: OnlineAccountSessionParams,
  kind: "follows" | "blocks",
  displayName: string,
  method: "PUT" | "DELETE",
  label: string,
  fetchImpl: typeof fetch
): Promise<OnlineAccountProfileResponse> {
  const response = await fetchImpl(`/api/online/account/${kind}/${encodeURIComponent(displayName)}`, {
    method,
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not ${label} online account (${response.status})`);
  }
  return validateProfileResponse(await response.json(), `Online ${label}`);
}

export function followOnlineAccount(
  account: OnlineAccountSessionParams,
  displayName: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountProfileResponse> {
  return putOrDeleteOnlineAccountRelationship(account, "follows", displayName, "PUT", "follow", fetchImpl);
}

export function unfollowOnlineAccount(
  account: OnlineAccountSessionParams,
  displayName: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountProfileResponse> {
  return putOrDeleteOnlineAccountRelationship(account, "follows", displayName, "DELETE", "unfollow", fetchImpl);
}

export function blockOnlineAccount(
  account: OnlineAccountSessionParams,
  displayName: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountProfileResponse> {
  return putOrDeleteOnlineAccountRelationship(account, "blocks", displayName, "PUT", "block", fetchImpl);
}

export function unblockOnlineAccount(
  account: OnlineAccountSessionParams,
  displayName: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountProfileResponse> {
  return putOrDeleteOnlineAccountRelationship(account, "blocks", displayName, "DELETE", "unblock", fetchImpl);
}

export async function reportOnlineAccount(
  account: OnlineAccountSessionParams,
  displayName: string,
  input: OnlineAccountReportInput,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountReportResponse> {
  const response = await fetchImpl(`/api/online/account/reports/${encodeURIComponent(displayName)}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...accountAuthorizationHeader(account) },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Could not report online account (${response.status})`);
  }
  return validateOnlineAccountReportResponse(await response.json(), "Online account report");
}

export async function fetchOnlineAccountPrivacy(
  account: OnlineAccountSessionParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountPrivacyResponse> {
  const response = await fetchImpl("/api/online/account/privacy", {
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not load online account privacy (${response.status})`);
  }
  const record = validateVersionedObject(await response.json(), "Online account privacy");
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    privacy: validateOnlineAccountPrivacySettings(record.privacy, "Online account privacy.privacy"),
  };
}

export async function updateOnlineAccountPrivacy(
  account: OnlineAccountSessionParams,
  patch: OnlineAccountPrivacyPatch,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountPrivacyResponse> {
  const response = await fetchImpl("/api/online/account/privacy", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...accountAuthorizationHeader(account) },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`Could not update online account privacy (${response.status})`);
  }
  const record = validateVersionedObject(await response.json(), "Online account privacy update");
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    privacy: validateOnlineAccountPrivacySettings(record.privacy, "Online account privacy update.privacy"),
  };
}

export interface FetchOnlineAccountChallengesOptions {
  state?: OnlineAccountChallengeDirectoryState;
}

function buildOnlineAccountChallengesPath(options: FetchOnlineAccountChallengesOptions = {}): string {
  const params = new URLSearchParams();
  if (options.state) params.set("state", options.state);
  const query = params.toString();
  return query ? `/api/online/account/challenges?${query}` : "/api/online/account/challenges";
}

export async function fetchOnlineAccountChallenges(
  account: OnlineAccountSessionParams,
  options: FetchOnlineAccountChallengesOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountChallengeDirectoryResponse & { protocolVersion: typeof ONLINE_PROTOCOL_VERSION }> {
  const response = await fetchImpl(buildOnlineAccountChallengesPath(options), {
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not load online account challenges (${response.status})`);
  }
  const record = validateVersionedObject(await response.json(), "Online account challenges");
  const validation = validateOnlineAccountChallengeDirectoryResponse(record);
  if (!validation.ok) {
    throw new Error(`Online account challenges response was malformed: ${validation.error.message}`);
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    ...validation.value,
  };
}

export async function acceptOnlineAccountChallenge(
  account: OnlineAccountSessionParams,
  challengeId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineChallengeResponse> {
  return postOnlineAccountChallengeAction(account, challengeId, "accept", fetchImpl);
}

export async function declineOnlineAccountChallenge(
  account: OnlineAccountSessionParams,
  challengeId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineChallengeResponse> {
  return postOnlineAccountChallengeAction(account, challengeId, "decline", fetchImpl);
}

export async function cancelOnlineAccountChallenge(
  account: OnlineAccountSessionParams,
  challengeId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineChallengeResponse> {
  return postOnlineAccountChallengeAction(account, challengeId, "cancel", fetchImpl);
}

async function postOnlineAccountChallengeAction(
  account: OnlineAccountSessionParams,
  challengeId: string,
  action: "accept" | "decline" | "cancel",
  fetchImpl: typeof fetch
): Promise<OnlineChallengeResponse> {
  const response = await fetchImpl(
    `/api/online/account/challenges/${encodeURIComponent(challengeId)}/${action}`,
    {
      method: "POST",
      headers: accountAuthorizationHeader(account),
    }
  );
  if (!response.ok) {
    throw await createOnlineRequestError(
      response,
      `Could not ${action} online account challenge (${response.status})`
    );
  }

  return validateOnlineChallengeResponse(await response.json(), `Online account challenge ${action}`);
}

export async function createOnlineAccount(
  displayName: string,
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountCreateResponse> {
  const response = await fetchImpl("/api/online/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName, password }),
  });

  if (!response.ok) {
    throw new Error(`Could not create online account (${response.status})`);
  }

  return validateOnlineAccountSessionResponse(await response.json(), "Online account creation");
}

export async function signInOnlineAccount(
  displayName: string,
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountCreateResponse> {
  const response = await fetchImpl("/api/online/account/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName, password }),
  });

  if (!response.ok) {
    throw new Error(`Could not sign in online account (${response.status})`);
  }

  return validateOnlineAccountSessionResponse(await response.json(), "Online account sign-in");
}

function validateOnlineAccountOAuthProvidersResponse(body: unknown): OnlineAccountOAuthProvidersResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online account OAuth providers response was malformed.");
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `Online account OAuth providers response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }
  const providers = (body as { providers?: unknown }).providers;
  if (!Array.isArray(providers)) {
    throw new Error("Online account OAuth providers response was malformed: providers is invalid.");
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    providers: providers.map((provider, index) => {
      if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
        throw new Error(`Online account OAuth providers response.providers[${index}] was malformed.`);
      }
      const providerName = (provider as { provider?: unknown }).provider;
      const enabled = (provider as { enabled?: unknown }).enabled;
      const startUrl = (provider as { startUrl?: unknown }).startUrl;
      if (providerName !== "google") {
        throw new Error(`Online account OAuth providers response.providers[${index}].provider is invalid.`);
      }
      if (typeof enabled !== "boolean") {
        throw new Error(`Online account OAuth providers response.providers[${index}].enabled is invalid.`);
      }
      if (startUrl !== undefined && (typeof startUrl !== "string" || !startUrl.startsWith("/api/online/account/oauth/"))) {
        throw new Error(`Online account OAuth providers response.providers[${index}].startUrl is invalid.`);
      }
      return {
        provider: providerName,
        enabled,
        ...(typeof startUrl === "string" ? { startUrl } : {}),
      };
    }),
  };
}

export async function fetchOnlineAccountOAuthProviders(
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountOAuthProvidersResponse> {
  const response = await fetchImpl("/api/online/account/oauth/providers");
  if (!response.ok) {
    throw new Error(`Could not load online account sign-in providers (${response.status})`);
  }
  return validateOnlineAccountOAuthProvidersResponse(await response.json());
}

function validateOnlineAccountSessionResponse(
  body: unknown,
  label: string
): OnlineAccountCreateResponse {
  const account = validateOnlineAccountResponse(body, label);
  const session = (body as { session?: unknown }).session;
  if (
    !session ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    typeof (session as { sessionId?: unknown }).sessionId !== "string" ||
    typeof (session as { token?: unknown }).token !== "string"
  ) {
    throw new Error(`${label} response was malformed: session is invalid.`);
  }

  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    account,
    session: {
      sessionId: (session as { sessionId: string }).sessionId,
      token: (session as { token: string }).token,
    },
  };
}

export async function fetchOnlineAccountMe(
  account: OnlineAccountSessionParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountMeResponse> {
  const response = await fetchImpl("/api/online/account/me", {
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not load online account (${response.status})`);
  }
  const body = await response.json();
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    account: validateOnlineAccountResponse(body, "Online account"),
  };
}

export async function revokeOnlineAccountSession(
  account: OnlineAccountSessionParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountSessionRevokeResponse> {
  const response = await fetchImpl("/api/online/account/session", {
    method: "DELETE",
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not revoke online account session (${response.status})`);
  }
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online account session revoke response was malformed.");
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `Online account session revoke response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }
  if (typeof (body as { revoked?: unknown }).revoked !== "boolean") {
    throw new Error("Online account session revoke response was malformed: revoked is invalid.");
  }
  if ((body as { revoked: boolean }).revoked !== true) {
    throw new Error("Online account session was not revoked.");
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    revoked: (body as { revoked: boolean }).revoked,
  };
}

function validateOnlineAccountSessionSummary(
  value: unknown,
  label: string
): OnlineAccountSessionSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} was malformed.`);
  }
  const sessionId = (value as { sessionId?: unknown }).sessionId;
  const createdAt = (value as { createdAt?: unknown }).createdAt;
  const lastUsedAt = (value as { lastUsedAt?: unknown }).lastUsedAt;
  const current = (value as { current?: unknown }).current;
  if (!isValidStoredAccountSessionId(sessionId)) {
    throw new Error(`${label} was malformed: sessionId is invalid.`);
  }
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    throw new Error(`${label} was malformed: createdAt is invalid.`);
  }
  if (typeof lastUsedAt !== "string" || Number.isNaN(Date.parse(lastUsedAt))) {
    throw new Error(`${label} was malformed: lastUsedAt is invalid.`);
  }
  if (typeof current !== "boolean") {
    throw new Error(`${label} was malformed: current is invalid.`);
  }
  return {
    sessionId,
    createdAt,
    lastUsedAt,
    current,
  };
}

export async function fetchOnlineAccountSessions(
  account: OnlineAccountSessionParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountSessionsResponse> {
  const response = await fetchImpl("/api/online/account/sessions", {
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not load online account sessions (${response.status})`);
  }
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online account sessions response was malformed.");
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `Online account sessions response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }
  const sessions = (body as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) {
    throw new Error("Online account sessions response was malformed: sessions is invalid.");
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    sessions: sessions.map((session, index) =>
      validateOnlineAccountSessionSummary(session, `Online account sessions response.sessions[${index}]`)
    ),
  };
}

export async function revokeAllOnlineAccountSessions(
  account: OnlineAccountSessionParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountSessionsRevokeResponse> {
  const response = await fetchImpl("/api/online/account/sessions", {
    method: "DELETE",
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not revoke online account sessions (${response.status})`);
  }
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online account sessions revoke response was malformed.");
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `Online account sessions revoke response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }
  const revokedSessions = (body as { revokedSessions?: unknown }).revokedSessions;
  if (typeof revokedSessions !== "number" || !Number.isSafeInteger(revokedSessions) || revokedSessions <= 0) {
    throw new Error("Online account sessions revoke response was malformed: revokedSessions is invalid.");
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    revokedSessions,
  };
}

export async function deleteOnlineAccount(
  account: OnlineAccountSessionParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountDeleteResponse> {
  const response = await fetchImpl("/api/online/account", {
    method: "DELETE",
    headers: accountAuthorizationHeader(account),
  });
  if (!response.ok) {
    throw new Error(`Could not delete online account (${response.status})`);
  }
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online account delete response was malformed.");
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `Online account delete response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }
  if ((body as { deleted?: unknown }).deleted !== true) {
    throw new Error("Online account was not deleted.");
  }
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    deleted: true,
  };
}

export interface CreateOnlineGameRequestOptions {
  account?: OnlineAccountSessionParams;
  creatorSeat?: "w" | "b";
}

export async function createOnlineGame(
  setup: OnlineGameSetupDTO,
  optionsOrFetch: CreateOnlineGameRequestOptions | typeof fetch = {},
  fetchImpl: typeof fetch = fetch
): Promise<CreatedOnlineGame> {
  const options = typeof optionsOrFetch === "function" ? {} : optionsOrFetch;
  const resolvedFetch = typeof optionsOrFetch === "function" ? optionsOrFetch : fetchImpl;
  const response = await resolvedFetch("/api/online/games", {
    method: "POST",
    headers: { "content-type": "application/json", ...accountAuthorizationHeader(options.account) },
    body: JSON.stringify({
      setup,
      ...(options.creatorSeat ? { creatorSeat: options.creatorSeat } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Could not create online game (${response.status})`);
  }

  return response.json();
}

export async function createOnlineChallenge(
  setup: OnlineGameSetupDTO,
  options: {
    challengerSeat?: "w" | "b" | "random";
    visibility?: "private" | "unlisted";
    challengedDisplayName?: string;
    account?: OnlineAccountSessionParams;
  } = {},
  fetchImpl: typeof fetch = fetch
): Promise<CreatedOnlineChallenge> {
  const { account, ...bodyOptions } = options;
  const response = await fetchImpl("/api/online/challenges", {
    method: "POST",
    headers: { "content-type": "application/json", ...accountAuthorizationHeader(account) },
    body: JSON.stringify({ setup, ...bodyOptions }),
  });

  if (!response.ok) {
    throw await createOnlineRequestError(
      response,
      `Could not create online challenge (${response.status})`
    );
  }

  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online challenge creation response was malformed.");
  }
  const summary = validateOnlineChallengeSummary((body as { summary?: unknown }).summary);
  if (!summary.ok) {
    throw new Error(`Online challenge creation response was malformed: ${summary.error.message}`);
  }
  const challengeId = (body as { challengeId?: unknown }).challengeId;
  const challenger = (body as { challenger?: unknown }).challenger;
  const challenged = (body as { challenged?: unknown }).challenged;
  if (
    typeof challengeId !== "string" ||
    !challenger ||
    typeof challenger !== "object" ||
    Array.isArray(challenger) ||
    typeof (challenger as { url?: unknown }).url !== "string" ||
    !challenged ||
    typeof challenged !== "object" ||
    Array.isArray(challenged) ||
    typeof (challenged as { url?: unknown }).url !== "string"
  ) {
    throw new Error("Online challenge creation response was malformed.");
  }
  return {
    challengeId,
    summary: summary.value,
    challenger: { url: (challenger as { url: string }).url },
    challenged: { url: (challenged as { url: string }).url },
  };
}

function validateOnlineChallengeResponse(
  body: unknown,
  label: string
): OnlineChallengeResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} response was malformed: response body must be an object.`);
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(`${label} response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`);
  }
  const role = (body as { role?: unknown }).role;
  if (role !== "challenger" && role !== "challenged") {
    throw new Error(`${label} response was malformed: role is invalid.`);
  }
  const summary = validateOnlineChallengeSummary((body as { summary?: unknown }).summary);
  if (!summary.ok) {
    throw new Error(`${label} response was malformed: ${summary.error.message}`);
  }
  const gameInvite = (body as { gameInvite?: unknown }).gameInvite;
  if (gameInvite === undefined) {
    return { role, summary: summary.value };
  }
  const invite = validateTokenlessGameInvite(gameInvite, label);
  return {
    role,
    summary: summary.value,
    gameInvite: invite,
  };
}

export async function fetchOnlineChallenge(
  challenge: OnlineChallengeParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineChallengeResponse> {
  const response = await fetchImpl(`/api/online/challenges/${encodeURIComponent(challenge.challengeId)}`, {
    headers: { authorization: `Bearer ${challenge.token}` },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch online challenge (${response.status})`);
  }

  return validateOnlineChallengeResponse(await response.json(), "Online challenge");
}

export async function acceptOnlineChallenge(
  challenge: OnlineChallengeParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineChallengeResponse> {
  return postOnlineChallengeAction(challenge, "accept", fetchImpl);
}

export async function declineOnlineChallenge(
  challenge: OnlineChallengeParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineChallengeResponse> {
  return postOnlineChallengeAction(challenge, "decline", fetchImpl);
}

export async function cancelOnlineChallenge(
  challenge: OnlineChallengeParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineChallengeResponse> {
  return postOnlineChallengeAction(challenge, "cancel", fetchImpl);
}

async function postOnlineChallengeAction(
  challenge: OnlineChallengeParams,
  action: "accept" | "decline" | "cancel",
  fetchImpl: typeof fetch
): Promise<OnlineChallengeResponse> {
  const response = await fetchImpl(
    `/api/online/challenges/${encodeURIComponent(challenge.challengeId)}/${action}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${challenge.token}` },
    }
  );
  if (!response.ok) {
    throw new Error(`Could not ${action} online challenge (${response.status})`);
  }

  return validateOnlineChallengeResponse(await response.json(), `Online challenge ${action}`);
}

export async function fetchOnlineSnapshot(
  join: OnlineJoinParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSnapshotDTO> {
  const response = await fetchImpl(`/api/online/games/${encodeURIComponent(join.gameId)}`, {
    headers: {
      authorization: `Bearer ${join.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch online game (${response.status})`);
  }

  const body = await response.json();
  return validateSnapshotResponse(body, "Online snapshot");
}

export async function fetchOnlineSpectatorSnapshot(
  gameId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSnapshotDTO> {
  const response = await fetchImpl(
    `/api/online/games/${encodeURIComponent(gameId)}/spectator`
  );

  if (!response.ok) {
    throw new Error(`Could not fetch spectator game (${response.status})`);
  }

  const body = await response.json();
  return validateSnapshotResponse(body, "Online spectator snapshot");
}

function validateSnapshotResponse(
  body: unknown,
  label: string
): OnlineGameSnapshotDTO {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} response was malformed: response body must be an object.`);
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `${label} response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }

  const snapshot = (body as { snapshot?: unknown }).snapshot;
  const validation = validateOnlineGameSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`${label} response was malformed: ${validation.error.message}`);
  }
  return validation.value;
}

function validateGameInvite(value: unknown, label: string): OnlineChallengeGameInvite {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} response was malformed: gameInvite must be an object.`);
  }
  const invite = value as { gameId?: unknown; seat?: unknown; token?: unknown; url?: unknown };
  if (
    typeof invite.gameId !== "string" ||
    (invite.seat !== "w" && invite.seat !== "b") ||
    typeof invite.token !== "string" ||
    typeof invite.url !== "string"
  ) {
    throw new Error(`${label} response was malformed: gameInvite is invalid.`);
  }
  return {
    gameId: invite.gameId,
    seat: invite.seat,
    token: invite.token,
    url: invite.url,
  };
}

function validateTokenlessGameInvite(value: unknown, label: string): OnlineChallengeGameInvite {
  const invite = validateGameInvite(value, label);
  if (stringContainsDurableSecret(invite.url)) {
    throw new Error(`${label} response was malformed: gameInvite URL must not contain tokens.`);
  }
  return invite;
}

function validateQuickMatchResponse(body: unknown, label: string): QuickMatchResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} response was malformed: response body must be an object.`);
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(`${label} response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`);
  }
  const outcome = (body as { outcome?: unknown }).outcome;
  const role = (body as { role?: unknown }).role;
  const summary = validateOpenSeekSummary((body as { summary?: unknown }).summary);
  if (!summary.ok) {
    throw new Error(`${label} response was malformed: ${summary.error.message}`);
  }

  if (outcome === "matched") {
    if (role !== "acceptor") {
      throw new Error(`${label} response was malformed: role is invalid.`);
    }
    return {
      outcome: "matched",
      role: "acceptor",
      summary: summary.value,
      gameInvite: validateTokenlessGameInvite((body as { gameInvite?: unknown }).gameInvite, label),
    };
  }

  if (outcome === "waiting") {
    if (role !== "creator") {
      throw new Error(`${label} response was malformed: role is invalid.`);
    }
    const seekId = (body as { seekId?: unknown }).seekId;
    const creator = (body as { creator?: unknown }).creator;
    if (
      typeof seekId !== "string" ||
      seekId !== summary.value.seekId ||
      !creator ||
      typeof creator !== "object" ||
      Array.isArray(creator) ||
      typeof (creator as { token?: unknown }).token !== "string"
    ) {
      throw new Error(`${label} response was malformed.`);
    }
    return {
      outcome: "waiting",
      role: "creator",
      seekId,
      summary: summary.value,
      creator: { token: (creator as { token: string }).token },
    };
  }

  throw new Error(`${label} response was malformed: outcome is invalid.`);
}

function validateOpenSeekCreatorResponse(body: unknown, label: string): OpenSeekResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} response was malformed: response body must be an object.`);
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(`${label} response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`);
  }
  if ((body as { role?: unknown }).role !== "creator") {
    throw new Error(`${label} response was malformed: role is invalid.`);
  }
  const summary = validateOpenSeekSummary((body as { summary?: unknown }).summary);
  if (!summary.ok) {
    throw new Error(`${label} response was malformed: ${summary.error.message}`);
  }
  const gameInvite = (body as { gameInvite?: unknown }).gameInvite;
  return gameInvite === undefined
    ? { role: "creator", summary: summary.value }
    : { role: "creator", summary: summary.value, gameInvite: validateTokenlessGameInvite(gameInvite, label) };
}

function validateOpenSeekAcceptResponse(body: unknown, label: string): OpenSeekAcceptResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} response was malformed: response body must be an object.`);
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(`${label} response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`);
  }
  if ((body as { role?: unknown }).role !== "acceptor") {
    throw new Error(`${label} response was malformed: role is invalid.`);
  }
  const summary = validateOpenSeekSummary((body as { summary?: unknown }).summary);
  if (!summary.ok) {
    throw new Error(`${label} response was malformed: ${summary.error.message}`);
  }
  return {
    role: "acceptor",
    summary: summary.value,
    gameInvite: validateTokenlessGameInvite((body as { gameInvite?: unknown }).gameInvite, label),
  };
}

export async function createOpenSeek(
  setup: OnlineGameSetupDTO,
  options: {
    creatorSeat?: OpenSeekSeat;
    visibility?: OpenSeekVisibility;
    creatorSessionId?: string;
    expiresInMs?: number;
    account?: OnlineAccountSessionParams;
  } = {},
  fetchImpl: typeof fetch = fetch
): Promise<CreatedOpenSeek> {
  const { account, ...bodyOptions } = options;
  const creatorSessionId = bodyOptions.creatorSessionId ?? resolveOnlineAnonymousSessionId();
  const response = await fetchImpl("/api/online/seeks", {
    method: "POST",
    headers: { "content-type": "application/json", ...accountAuthorizationHeader(account) },
    body: JSON.stringify({ setup, ...bodyOptions, creatorSessionId }),
  });

  if (!response.ok) {
    throw await createOnlineRequestError(
      response,
      `Could not create open seek (${response.status})`
    );
  }

  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Open seek creation response was malformed.");
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `Open seek creation response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }
  const summary = validateOpenSeekSummary((body as { summary?: unknown }).summary);
  if (!summary.ok) {
    throw new Error(`Open seek creation response was malformed: ${summary.error.message}`);
  }
  const seekId = (body as { seekId?: unknown }).seekId;
  const creator = (body as { creator?: unknown }).creator;
  if (
    typeof seekId !== "string" ||
    !creator ||
    typeof creator !== "object" ||
    Array.isArray(creator) ||
    typeof (creator as { token?: unknown }).token !== "string"
  ) {
    throw new Error("Open seek creation response was malformed.");
  }
  return {
    seekId,
    summary: summary.value,
    creator: { token: (creator as { token: string }).token },
  };
}

export async function fetchOpenSeek(
  seek: OpenSeekCreatorParams,
  fetchImpl: typeof fetch = fetch
): Promise<OpenSeekResponse> {
  const response = await fetchImpl(`/api/online/seeks/${encodeURIComponent(seek.seekId)}`, {
    headers: { authorization: `Bearer ${seek.token}` },
  });

  if (!response.ok) {
    throw await createOnlineRequestError(
      response,
      `Could not fetch open seek (${response.status})`
    );
  }

  return validateOpenSeekCreatorResponse(await response.json(), "Open seek");
}

export async function cancelOpenSeek(
  seek: OpenSeekCreatorParams,
  fetchImpl: typeof fetch = fetch
): Promise<OpenSeekResponse> {
  const response = await fetchImpl(`/api/online/seeks/${encodeURIComponent(seek.seekId)}/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${seek.token}` },
  });

  if (!response.ok) {
    throw await createOnlineRequestError(
      response,
      `Could not cancel open seek (${response.status})`
    );
  }

  return validateOpenSeekCreatorResponse(await response.json(), "Open seek cancel");
}

export async function acceptOpenSeek(
  seekId: string,
  options: { acceptorSessionId?: string; account?: OnlineAccountSessionParams } = {},
  fetchImpl: typeof fetch = fetch
): Promise<OpenSeekAcceptResponse> {
  const { account, ...bodyOptions } = options;
  const acceptorSessionId = bodyOptions.acceptorSessionId ?? resolveOnlineAnonymousSessionId();
  const response = await fetchImpl(`/api/online/seeks/${encodeURIComponent(seekId)}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json", ...accountAuthorizationHeader(account) },
    body: JSON.stringify({ acceptorSessionId }),
  });

  if (!response.ok) {
    throw await createOnlineRequestError(
      response,
      `Could not accept open seek (${response.status})`
    );
  }

  return validateOpenSeekAcceptResponse(await response.json(), "Open seek accept");
}

export async function startQuickMatch(
  setup: OnlineGameSetupDTO,
  options: { sessionId?: string; expiresInMs?: number; account?: OnlineAccountSessionParams } = {},
  fetchImpl: typeof fetch = fetch
): Promise<QuickMatchResponse> {
  const { account, ...bodyOptions } = options;
  const sessionId = bodyOptions.sessionId ?? resolveOnlineAnonymousSessionId();
  const response = await fetchImpl("/api/online/matchmaking/quick", {
    method: "POST",
    headers: { "content-type": "application/json", ...accountAuthorizationHeader(account) },
    body: JSON.stringify({ setup, ...bodyOptions, sessionId }),
  });

  if (!response.ok) {
    throw await createOnlineRequestError(
      response,
      `Could not start quick match (${response.status})`
    );
  }

  return validateQuickMatchResponse(await response.json(), "Quick match");
}

export interface FetchOpenSeekDirectoryOptions {
  state?: OpenSeekDirectoryState;
  limit?: number;
  cursor?: string;
  creatorSeat?: OpenSeekSeat;
  clock?: OpenSeekDirectoryClockFilter;
  vp?: OpenSeekDirectoryVpFilter;
  rating?: OnlineRatingMode;
  account?: OnlineAccountSessionParams;
}

function buildOpenSeekDirectoryPath(options: FetchOpenSeekDirectoryOptions = {}): string {
  const params = new URLSearchParams();
  if (options.state) params.set("state", options.state);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.creatorSeat) params.set("creatorSeat", options.creatorSeat);
  if (options.clock) params.set("clock", options.clock);
  if (options.vp) params.set("vp", options.vp);
  if (options.rating) params.set("rating", options.rating);
  const query = params.toString();
  return query ? `/api/online/seeks?${query}` : "/api/online/seeks";
}

export async function fetchOpenSeekDirectory(
  options: FetchOpenSeekDirectoryOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<OpenSeekDirectoryResponse> {
  const { account } = options;
  const path = buildOpenSeekDirectoryPath(options);
  const response = account
    ? await fetchImpl(path, { headers: accountAuthorizationHeader(account) })
    : await fetchImpl(path);

  if (!response.ok) {
    throw new Error(`Could not fetch open seeks (${response.status})`);
  }

  const body = await response.json();
  const validation = validateOpenSeekDirectoryResponse(body);
  if (!validation.ok) {
    throw new Error(`Open seek directory response was malformed: ${validation.error.message}`);
  }
  return validation.value;
}

export interface FetchOnlineGameSummariesOptions {
  state?: OnlineGameDirectoryState;
  limit?: number;
  cursor?: string;
  clock?: OnlineGameDirectoryClockFilter;
  rating?: OnlineRatingMode;
  result?: OnlineGameDirectoryResultFilter;
  query?: string;
}

function buildOnlineDirectoryPath(options: FetchOnlineGameSummariesOptions = {}): string {
  const params = new URLSearchParams();
  if (options.state) params.set("state", options.state);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.clock) params.set("clock", options.clock);
  if (options.rating) params.set("rating", options.rating);
  if (options.result) params.set("result", options.result);
  if (options.query?.trim()) params.set("q", options.query.trim());
  const query = params.toString();
  return query ? `/api/online/games?${query}` : "/api/online/games";
}

export async function fetchOnlineGameDirectory(
  options: FetchOnlineGameSummariesOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameDirectoryResponse> {
  const response = await fetchImpl(buildOnlineDirectoryPath(options));

  if (!response.ok) {
    throw new Error(`Could not fetch online game summaries (${response.status})`);
  }

  const body = await response.json();
  const validation = validateOnlineGameDirectoryResponse(body);
  if (!validation.ok) {
    throw new Error(`Online game summary response was malformed: ${validation.error.message}`);
  }
  return validation.value;
}

export interface FetchOnlineAccountGamesOptions {
  state?: OnlineGameDirectoryState;
  limit?: number;
  cursor?: string;
}

function buildOnlineAccountGamesPath(options: FetchOnlineAccountGamesOptions = {}): string {
  const params = new URLSearchParams();
  if (options.state) params.set("state", options.state);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return query ? `/api/online/account/games?${query}` : "/api/online/account/games";
}

export async function fetchOnlineAccountGames(
  account: OnlineAccountSessionParams,
  options: FetchOnlineAccountGamesOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameDirectoryResponse> {
  const response = await fetchImpl(buildOnlineAccountGamesPath(options), {
    headers: accountAuthorizationHeader(account),
  });

  if (!response.ok) {
    throw new Error(`Could not fetch online account games (${response.status})`);
  }

  const body = await response.json();
  const validation = validateOnlineGameDirectoryResponse(body);
  if (!validation.ok) {
    throw new Error(`Online account game history response was malformed: ${validation.error.message}`);
  }
  return validation.value;
}

function buildOnlineAccountHeadToHeadGamesPath(
  displayName: string,
  options: Omit<FetchOnlineAccountGamesOptions, "state"> = {}
): string {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  const path = `/api/online/account/games/head-to-head/${encodeURIComponent(displayName)}`;
  return query ? `${path}?${query}` : path;
}

export async function fetchOnlineAccountHeadToHeadGames(
  account: OnlineAccountSessionParams,
  displayName: string,
  options: Omit<FetchOnlineAccountGamesOptions, "state"> = {},
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameDirectoryResponse> {
  const response = await fetchImpl(buildOnlineAccountHeadToHeadGamesPath(displayName, options), {
    headers: accountAuthorizationHeader(account),
  });

  if (!response.ok) {
    throw new Error(`Could not fetch online account head-to-head games (${response.status})`);
  }

  const body = await response.json();
  const validation = validateOnlineGameDirectoryResponse(body);
  if (!validation.ok) {
    throw new Error(`Online account head-to-head history response was malformed: ${validation.error.message}`);
  }
  return validation.value;
}

export async function fetchOnlineAccountGameSnapshot(
  account: OnlineAccountSessionParams,
  gameId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSnapshotDTO> {
  const response = await fetchImpl(
    `/api/online/account/games/${encodeURIComponent(gameId)}/snapshot`,
    {
      headers: accountAuthorizationHeader(account),
    }
  );

  if (!response.ok) {
    throw new Error(`Could not fetch online account game snapshot (${response.status})`);
  }

  return validateSnapshotResponse(await response.json(), "Online account game snapshot");
}

export async function rejoinOnlineAccountGame(
  account: OnlineAccountSessionParams,
  gameId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineAccountGameRejoinResponse> {
  const response = await fetchImpl(
    `/api/online/account/games/${encodeURIComponent(gameId)}/rejoin`,
    {
      method: "POST",
      headers: accountAuthorizationHeader(account),
    }
  );

  if (!response.ok) {
    throw await createOnlineRequestError(
      response,
      `Could not rejoin online account game (${response.status})`
    );
  }

  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online account game rejoin response was malformed.");
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `Online account game rejoin response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }
  return {
    gameInvite: validateTokenlessGameInvite(
      (body as { gameInvite?: unknown }).gameInvite,
      "Online account game rejoin"
    ),
  };
}

export async function fetchOnlineGameSummaries(
  options: FetchOnlineGameSummariesOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSummary[]> {
  const directory = await fetchOnlineGameDirectory(options, fetchImpl);
  return directory.games;
}

export async function fetchOnlineGameSummary(
  gameId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSummary> {
  const response = await fetchImpl(`/api/online/games/${encodeURIComponent(gameId)}/summary`);

  if (!response.ok) {
    throw new Error(`Could not fetch online game summary (${response.status})`);
  }

  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online game summary response was malformed.");
  }
  if ((body as { schemaVersion?: unknown }).schemaVersion !== ONLINE_GAME_DIRECTORY_SCHEMA_VERSION) {
    throw new Error(
      `Online game summary response was malformed: schemaVersion must be ${ONLINE_GAME_DIRECTORY_SCHEMA_VERSION}.`
    );
  }
  const summary = validateOnlineGameSummary((body as { summary?: unknown }).summary);
  if (!summary.ok) {
    throw new Error(`Online game summary response was malformed: ${summary.error.message}`);
  }
  return summary.value;
}

export async function updateOnlineGameVisibility(
  join: OnlineJoinParams,
  visibility: OnlinePlayerSettableGameVisibility,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSummary> {
  const response = await fetchImpl(
    `/api/online/games/${encodeURIComponent(join.gameId)}/visibility`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${join.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ visibility }),
    }
  );

  if (!response.ok) {
    throw new Error(`Could not update online game visibility (${response.status})`);
  }

  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Online game visibility response was malformed.");
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `Online game visibility response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }
  const summary = validateOnlineGameSummary((body as { summary?: unknown }).summary);
  if (!summary.ok) {
    throw new Error(`Online game visibility response was malformed: ${summary.error.message}`);
  }
  return summary.value;
}
