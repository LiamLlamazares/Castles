import http from "node:http";
import { randomBytes } from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { OnlineGameService } from "../OnlineGameService";
import {
  OnlineGameRoom,
  type AcceptedOnlineTimeoutRecord,
  type OnlineGameRoomRecord,
} from "../OnlineGameRoom";
import {
  ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION,
  ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_STATES,
  canSystemExpireChallenge,
  canIdentityAcceptChallenge,
  canIdentityCancelChallenge,
  canIdentityDeclineChallenge,
  createChallengeAcceptedEvent,
  createChallengeCreatedEvent,
  createChallengeCancelledEvent,
  createChallengeDeclinedEvent,
  createChallengeExpiredEvent,
  isSameOnlineIdentity,
  onlineAccountChallengeRoleForIdentity,
  projectOnlineChallengeSummaries,
  validateOnlineChallengeSummary,
  validateOnlineAccountChallengeDirectoryResponse,
  type AuthenticatedOnlineIdentity,
  type OnlineAccountChallengeDirectoryState,
  type OnlineChallengeEvent,
  type OnlineChallengeSummary,
} from "../challenges";
import {
  createOnlineActionAcceptedEvent,
  createOnlineGameCreatedEvent,
  createOnlineGameVisibilityChangedEvent,
  createOnlineTimeoutAdjudicatedEvent,
  OnlineGameEvent,
  type OnlineGameCredentials,
  ONLINE_EVENT_SCHEMA_VERSION,
  ONLINE_RULESET_VERSION,
} from "../events";
import { sameOnlineAction } from "../actionIdempotency";
import {
  ONLINE_GAME_DIRECTORY_DEFAULT_LIMIT,
  ONLINE_GAME_DIRECTORY_CLOCK_FILTERS,
  ONLINE_GAME_DIRECTORY_MAX_LIMIT,
  ONLINE_GAME_DIRECTORY_RATING_FILTERS,
  ONLINE_GAME_DIRECTORY_RESULT_FILTERS,
  ONLINE_GAME_DIRECTORY_SEARCH_MAX_LENGTH,
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  ONLINE_GAME_DIRECTORY_STATES,
  normalizeOnlineGameDirectorySearchQuery,
  onlineGameSummaryMatchesDirectoryFilters,
  onlineGameSummaryMatchesPersonalDirectoryFilters,
  type OnlineGameDirectoryClockFilter,
  type OnlineGameDirectoryListOptions,
  type OnlineGameDirectoryRatingFilter,
  type OnlinePersonalGameDirectoryListOptions,
  type OnlineGameDirectoryResultFilter,
  type OnlineGameDirectoryResponse,
  OnlineGameSummary,
  type OnlineIdentity,
  decodeOnlineGameDirectoryCursor,
  encodeOnlineGameDirectoryCursor,
  projectOnlineGameSummaries,
  stripOnlineGameDirectoryResponseOnlyFields,
  stripOnlineGameSummaryResponseOnlyFields,
  validateOnlineGameSummary,
  validateOnlineGameDirectoryResponse,
} from "../readModel";
import {
  ONLINE_SEEK_DIRECTORY_DEFAULT_LIMIT,
  ONLINE_SEEK_DIRECTORY_MAX_LIMIT,
  ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
  OPEN_SEEK_DIRECTORY_CLOCK_FILTERS,
  OPEN_SEEK_DIRECTORY_RATING_FILTERS,
  OPEN_SEEK_DIRECTORY_STATES,
  OPEN_SEEK_DIRECTORY_VP_FILTERS,
  canIdentityAcceptOpenSeek,
  canIdentityCancelOpenSeek,
  canListOpenSeekSummary,
  canSystemExpireOpenSeek,
  createOpenSeekAcceptedEvent,
  createOpenSeekCancelledEvent,
  createOpenSeekCreatedEvent,
  createOpenSeekExpiredEvent,
  decodeOpenSeekDirectoryCursor,
  encodeOpenSeekDirectoryCursor,
  isSameOnlineIdentity as isSameOpenSeekIdentity,
  openSeekMatchesDirectoryFilters,
  projectOpenSeekSummaries,
  validateOpenSeekDirectoryResponse,
  validateOpenSeekSummary,
  type OpenSeekDirectoryClockFilter,
  type OpenSeekDirectoryListOptions,
  type OpenSeekDirectoryRatingFilter,
  type OpenSeekDirectoryResponse,
  type OpenSeekEvent,
  type OpenSeekSeat,
  type OpenSeekSummary,
  type OpenSeekVisibility,
  type OpenSeekDirectoryVpFilter,
} from "../seeks";
import {
  canListOnlineGameSummary,
  canSpectateOnlineGameSummary,
} from "../accessPolicy";
import { OnlineGameSetupDTO, OnlineReject } from "../types";
import {
  OnlineClientMessage,
  validateClientMessage,
  validateOnlineGameId,
  validateOnlineGameSetup,
} from "../validation";
import { ONLINE_PROTOCOL_VERSION } from "../protocolVersion";
import type {
  OnlineChallengeAcceptInput,
  OnlineChallengeAcceptResult,
  OnlineChallengeCredentials,
  OnlineChallengeRole,
  OnlineGameStoreActionInput,
  OnlineGameStoreActionResult,
  OnlineGameStoreTimeoutInput,
  OnlineGameStoreTimeoutResult,
  OpenSeekAcceptInput,
  OpenSeekAcceptResult,
  OpenSeekCredentials,
  ResolvedOpenSeekCredential,
  ResolvedOnlineChallengeCredential,
} from "./OnlineGameStore";
import { OnlineGameSeatCredentialTerminalError } from "./OnlineGameStore";
import {
  hashOnlineToken,
  isOnlineTokenCredentialHash,
  verifyOnlineToken,
} from "./onlineTokenCredentials";
import {
  isOnlinePlayerSettableGameVisibility,
  type OnlinePlayerSettableGameVisibility,
} from "../visibility";
import {
  containsDurableSecret,
  isSecretLikeKey,
  stringContainsDurableSecret,
} from "../secretSafety";
import {
  normalizeOnlineAccountDisplayName,
  normalizeOnlineAccountDisplayNameKey,
  normalizeOnlineAccountPassword,
  type OnlineAccount,
  type OnlineAccountOAuthProviderSummary,
} from "../accounts";
import {
  ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION,
  parseOnlineAccountReportInput,
  parseOnlineAccountPrivacyPatch,
  type OnlineRatingLeaderboardScope,
  type OnlineAccountSocialActionResult,
} from "../social";
import {
  DuplicateOnlineAccountDisplayNameError,
  DuplicateOnlineAccountIdError,
  DuplicateOnlineAccountSessionCredentialError,
  MemoryOnlineAccountStore,
  type OnlineAccountReportSubmissionResult,
  type OnlineAccountStore,
} from "./OnlineAccountStore";
import { hashOnlineAccountPassword } from "./onlinePasswordCredentials";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
  buildGoogleOAuthAuthorizationUrl,
  decodeGoogleOAuthState,
  encodeGoogleOAuthState,
  exchangeGoogleOAuthCode,
  googleDisplayNameCandidates,
  isSafeOAuthReturnPath,
  normalizeGoogleOAuthProviderConfig,
  renderGoogleOAuthSessionHtml,
  verifyGoogleIdToken,
  type GoogleOAuthProviderConfig,
} from "./googleOAuth";

type OnlineConnection =
  | { role: "player"; gameId: string; token: string }
  | { role: "spectator"; gameId: string };

export type OnlineServerLogEvent = {
  event: string;
  status: "accepted" | "rejected" | "connected" | "disconnected" | "expired" | "failed";
  gameId?: string;
  role?: "player" | "spectator";
  action?: string;
  reason?: string;
};

const DEFAULT_ONLINE_TIME_CONTROL = { initial: 20, increment: 20 } as const;
const DEFAULT_HEALTH_READINESS_TIMEOUT_MS = 1_500;
const DEFAULT_CHALLENGE_EXPIRES_IN_MS = 24 * 60 * 60 * 1000;
const MIN_CHALLENGE_EXPIRES_IN_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;
const ACCOUNT_CHALLENGE_PAIR_COOLDOWN_MS = 60_000;
const ACCOUNT_SESSION_TOKEN_BYTES = 24;
const RATING_LEADERBOARD_DEFAULT_LIMIT = 10;
const RATING_LEADERBOARD_MAX_LIMIT = 50;
const RATING_LEADERBOARD_SCOPES = new Set<OnlineRatingLeaderboardScope>(["global", "following"]);

type PublicSessionIdentity = { kind: "session"; id: string };
type PublicPlayerIdentity = OnlineIdentity;

export interface CreateOnlineHttpServerOptions {
  publicBaseUrl: string;
  service?: OnlineGameService;
  onGameCreated?: (
    event: Extract<OnlineGameEvent, { type: "game_created" }>,
    credentials: OnlineGameCredentials
  ) => void | Promise<void>;
  onGameEvent?: (event: OnlineGameEvent) => void | Promise<void>;
  appendGameVisibilityChanged?: (
    event: Extract<OnlineGameEvent, { type: "visibility_changed" }>
  ) => OnlineGameSummary | Promise<OnlineGameSummary>;
  appendGameSeatCredential?: (
    gameId: string,
    seat: "w" | "b",
    credential: string
  ) => OnlineGameRoomRecord | Promise<OnlineGameRoomRecord>;
  appendChallengeCreated?: (
    event: Extract<OnlineChallengeEvent, { type: "challenge_created" }>,
    credentials: OnlineChallengeCredentials
  ) => OnlineChallengeSummary | Promise<OnlineChallengeSummary>;
  appendChallengeEvent?: (
    event: Exclude<
      OnlineChallengeEvent,
      { type: "challenge_created" } | { type: "challenge_accepted" }
    >
  ) => OnlineChallengeSummary | Promise<OnlineChallengeSummary>;
  loadChallengeSummaries?: () => OnlineChallengeSummary[] | Promise<OnlineChallengeSummary[]>;
  resolveChallengeCredential?: (
    challengeId: string,
    token: string
  ) => ResolvedOnlineChallengeCredential | null | Promise<ResolvedOnlineChallengeCredential | null>;
  acceptChallengeAndCreateGame?: (
    input: OnlineChallengeAcceptInput
  ) => OnlineChallengeAcceptResult | Promise<OnlineChallengeAcceptResult>;
  appendOpenSeekCreated?: (
    event: Extract<OpenSeekEvent, { type: "seek_created" }>,
    credentials: OpenSeekCredentials
  ) => OpenSeekSummary | Promise<OpenSeekSummary>;
  appendOpenSeekEvent?: (
    event: Exclude<OpenSeekEvent, { type: "seek_created" } | { type: "seek_accepted" }>
  ) => OpenSeekSummary | Promise<OpenSeekSummary>;
  loadOpenSeekSummaries?: () => OpenSeekSummary[] | Promise<OpenSeekSummary[]>;
  listOpenSeekSummaries?: (
    options: OpenSeekDirectoryListOptions
  ) => OpenSeekDirectoryResponse | Promise<OpenSeekDirectoryResponse>;
  resolveOpenSeekCredential?: (
    seekId: string,
    token: string
  ) => ResolvedOpenSeekCredential | null | Promise<ResolvedOpenSeekCredential | null>;
  acceptOpenSeekAndCreateGame?: (
    input: OpenSeekAcceptInput
  ) => OpenSeekAcceptResult | Promise<OpenSeekAcceptResult>;
  applyGameAction?: (
    input: OnlineGameStoreActionInput
  ) => OnlineGameStoreActionResult | Promise<OnlineGameStoreActionResult>;
  adjudicateGameTimeout?: (
    input: OnlineGameStoreTimeoutInput
  ) => OnlineGameStoreTimeoutResult | Promise<OnlineGameStoreTimeoutResult>;
  loadGameSummaries?: () => OnlineGameSummary[] | Promise<OnlineGameSummary[]>;
  listGameSummaries?: (
    options: OnlineGameDirectoryListOptions
  ) => OnlineGameDirectoryResponse | Promise<OnlineGameDirectoryResponse>;
  listPersonalGameSummaries?: (
    options: OnlinePersonalGameDirectoryListOptions
  ) => OnlineGameDirectoryResponse | Promise<OnlineGameDirectoryResponse>;
  loadGameSummary?: (gameId: string) => OnlineGameSummary | null | Promise<OnlineGameSummary | null>;
  accountStore?: OnlineAccountStore;
  oauth?: {
    google?: GoogleOAuthProviderConfig;
  };
  onLog?: (event: OnlineServerLogEvent) => void;
  now?: () => number;
  health?: {
    buildId?: string;
    commit?: string;
    storePath?: string;
    storeBackend?: string;
    readinessTimeoutMs?: number;
    checkStoreReady?: () => boolean | Promise<boolean>;
  };
}

class StoreReadinessTimeoutError extends Error {
  constructor() {
    super("Store readiness check timed out.");
  }
}

class FixedWindowRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  take(key: string): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) {
      return false;
    }
    entry.count += 1;
    return true;
  }
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    const versionedPayload =
      payload && typeof payload === "object" && !Array.isArray(payload) && "type" in payload
        ? { ...payload, protocolVersion: ONLINE_PROTOCOL_VERSION }
        : payload;
    socket.send(JSON.stringify(versionedPayload));
  }
}

function hasSensitivePublicDirectoryQuery(searchParams: URLSearchParams): boolean {
  for (const [key, value] of searchParams.entries()) {
    if (isSecretLikeKey(key) || stringContainsDurableSecret(value)) {
      return true;
    }
  }
  return false;
}

function getSingleSearchParam(searchParams: URLSearchParams, name: string): string | null {
  const values = searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
}

function parsePublicDirectoryOptions(
  originalUrl: string
): { ok: true; options: OnlineGameDirectoryListOptions } | { ok: false; message: string } {
  const url = new URL(originalUrl, "http://localhost");
  if (hasSensitivePublicDirectoryQuery(url.searchParams)) {
    return { ok: false, message: "Public directory query is invalid." };
  }

  for (const name of ["state", "limit", "cursor", "clock", "rating", "result", "q"]) {
    if (url.searchParams.getAll(name).length > 1) {
      return { ok: false, message: "Public directory query is invalid." };
    }
  }

  const state = getSingleSearchParam(url.searchParams, "state") ?? "all";
  if (!ONLINE_GAME_DIRECTORY_STATES.has(state as OnlineGameDirectoryListOptions["state"])) {
    return { ok: false, message: "Public directory state is invalid." };
  }

  const rawLimit = getSingleSearchParam(url.searchParams, "limit");
  const limit = rawLimit === null ? ONLINE_GAME_DIRECTORY_DEFAULT_LIMIT : Number(rawLimit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ONLINE_GAME_DIRECTORY_MAX_LIMIT ||
    String(limit) !== String(rawLimit ?? limit)
  ) {
    return { ok: false, message: "Public directory limit is invalid." };
  }

  const cursor = getSingleSearchParam(url.searchParams, "cursor") ?? undefined;
  if (cursor) {
    const decoded = decodeOnlineGameDirectoryCursor(cursor);
    if (!decoded.ok) {
      return { ok: false, message: "Public directory cursor is invalid." };
    }
  }

  const rawClock = getSingleSearchParam(url.searchParams, "clock");
  if (
    rawClock !== null &&
    !ONLINE_GAME_DIRECTORY_CLOCK_FILTERS.has(rawClock as OnlineGameDirectoryClockFilter)
  ) {
    return { ok: false, message: "Public directory clock filter is invalid." };
  }
  const clock = rawClock ?? undefined;

  const rawRating = getSingleSearchParam(url.searchParams, "rating");
  if (
    rawRating !== null &&
    !ONLINE_GAME_DIRECTORY_RATING_FILTERS.has(rawRating as OnlineGameDirectoryRatingFilter)
  ) {
    return { ok: false, message: "Public directory rating filter is invalid." };
  }
  const rating = rawRating ?? undefined;

  const rawResult = getSingleSearchParam(url.searchParams, "result");
  if (
    rawResult !== null &&
    !ONLINE_GAME_DIRECTORY_RESULT_FILTERS.has(rawResult as OnlineGameDirectoryResultFilter)
  ) {
    return { ok: false, message: "Public directory result filter is invalid." };
  }
  const result = rawResult ?? undefined;

  const rawQuery = getSingleSearchParam(url.searchParams, "q");
  let query: string | undefined;
  if (rawQuery !== null) {
    const normalizedQuery = normalizeOnlineGameDirectorySearchQuery(rawQuery);
    if (!normalizedQuery) {
      return {
        ok: false,
        message: `Public directory search must be 1-${ONLINE_GAME_DIRECTORY_SEARCH_MAX_LENGTH} visible characters.`,
      };
    }
    query = normalizedQuery;
  }

  return {
    ok: true,
    options: {
      visibility: "public",
      state: state as OnlineGameDirectoryListOptions["state"],
      limit,
      cursor,
      clock: clock as OnlineGameDirectoryClockFilter | undefined,
      rating: rating as OnlineGameDirectoryListOptions["rating"],
      result: result as OnlineGameDirectoryResultFilter | undefined,
      query,
    },
  };
}

function parsePersonalDirectoryOptions(
  originalUrl: string,
  identity: OnlineIdentity
):
  | { ok: true; options: OnlinePersonalGameDirectoryListOptions }
  | { ok: false; message: string } {
  const url = new URL(originalUrl, "http://localhost");
  if (hasSensitivePublicDirectoryQuery(url.searchParams)) {
    return { ok: false, message: "Personal history query is invalid." };
  }

  for (const name of ["state", "limit", "cursor"]) {
    if (url.searchParams.getAll(name).length > 1) {
      return { ok: false, message: "Personal history query is invalid." };
    }
  }
  for (const name of url.searchParams.keys()) {
    if (name !== "state" && name !== "limit" && name !== "cursor") {
      return { ok: false, message: "Personal history query is invalid." };
    }
  }

  const state = getSingleSearchParam(url.searchParams, "state") ?? "all";
  if (!ONLINE_GAME_DIRECTORY_STATES.has(state as OnlinePersonalGameDirectoryListOptions["state"])) {
    return { ok: false, message: "Personal history state is invalid." };
  }

  const rawLimit = getSingleSearchParam(url.searchParams, "limit");
  const limit = rawLimit === null ? ONLINE_GAME_DIRECTORY_DEFAULT_LIMIT : Number(rawLimit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ONLINE_GAME_DIRECTORY_MAX_LIMIT ||
    String(limit) !== String(rawLimit ?? limit)
  ) {
    return { ok: false, message: "Personal history limit is invalid." };
  }

  const cursor = getSingleSearchParam(url.searchParams, "cursor") ?? undefined;
  if (cursor) {
    const decoded = decodeOnlineGameDirectoryCursor(cursor);
    if (!decoded.ok) {
      return { ok: false, message: "Personal history cursor is invalid." };
    }
  }

  return {
    ok: true,
    options: {
      identity,
      state: state as OnlinePersonalGameDirectoryListOptions["state"],
      limit,
      cursor,
    },
  };
}

function parseAccountHeadToHeadDirectoryOptions(
  originalUrl: string,
  identity: OnlineIdentity,
  opponentDisplayNameKey: string
):
  | { ok: true; options: OnlinePersonalGameDirectoryListOptions }
  | { ok: false; message: string } {
  const url = new URL(originalUrl, "http://localhost");
  if (hasSensitivePublicDirectoryQuery(url.searchParams)) {
    return { ok: false, message: "Head-to-head history query is invalid." };
  }

  for (const name of ["limit", "cursor"]) {
    if (url.searchParams.getAll(name).length > 1) {
      return { ok: false, message: "Head-to-head history query is invalid." };
    }
  }
  for (const name of url.searchParams.keys()) {
    if (name !== "limit" && name !== "cursor") {
      return { ok: false, message: "Head-to-head history query is invalid." };
    }
  }

  const rawLimit = getSingleSearchParam(url.searchParams, "limit");
  const limit = rawLimit === null ? ONLINE_GAME_DIRECTORY_DEFAULT_LIMIT : Number(rawLimit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ONLINE_GAME_DIRECTORY_MAX_LIMIT ||
    String(limit) !== String(rawLimit ?? limit)
  ) {
    return { ok: false, message: "Head-to-head history limit is invalid." };
  }

  const cursor = getSingleSearchParam(url.searchParams, "cursor") ?? undefined;
  if (cursor) {
    const decoded = decodeOnlineGameDirectoryCursor(cursor);
    if (!decoded.ok) {
      return { ok: false, message: "Head-to-head history cursor is invalid." };
    }
  }

  return {
    ok: true,
    options: {
      identity,
      state: "archived",
      limit,
      cursor,
      opponentDisplayNameKey,
    },
  };
}

function parseAccountChallengeDirectoryOptions(
  originalUrl: string
): { ok: true; state: OnlineAccountChallengeDirectoryState } | { ok: false; message: string } {
  const url = new URL(originalUrl, "http://localhost");
  if (hasSensitivePublicDirectoryQuery(url.searchParams)) {
    return { ok: false, message: "Account challenge query is invalid." };
  }
  for (const name of url.searchParams.keys()) {
    if (name !== "state") {
      return { ok: false, message: "Account challenge query is invalid." };
    }
  }
  if (url.searchParams.getAll("state").length > 1) {
    return { ok: false, message: "Account challenge query is invalid." };
  }
  const state = getSingleSearchParam(url.searchParams, "state") ?? "pending";
  if (!ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_STATES.has(state as OnlineAccountChallengeDirectoryState)) {
    return { ok: false, message: "Account challenge state is invalid." };
  }
  return { ok: true, state: state as OnlineAccountChallengeDirectoryState };
}

function parseRatingLeaderboardOptions(
  originalUrl: string
): { ok: true; limit: number; scope: OnlineRatingLeaderboardScope } | { ok: false; message: string } {
  const url = new URL(originalUrl, "http://localhost");
  if (hasSensitivePublicDirectoryQuery(url.searchParams)) {
    return { ok: false, message: "Rating leaderboard query is invalid." };
  }
  for (const name of url.searchParams.keys()) {
    if (name !== "limit" && name !== "scope") {
      return { ok: false, message: "Rating leaderboard query is invalid." };
    }
  }
  if (url.searchParams.getAll("limit").length > 1) {
    return { ok: false, message: "Rating leaderboard query is invalid." };
  }
  if (url.searchParams.getAll("scope").length > 1) {
    return { ok: false, message: "Rating leaderboard query is invalid." };
  }
  const rawLimit = getSingleSearchParam(url.searchParams, "limit");
  const limit = rawLimit === null ? RATING_LEADERBOARD_DEFAULT_LIMIT : Number(rawLimit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > RATING_LEADERBOARD_MAX_LIMIT ||
    String(limit) !== String(rawLimit ?? limit)
  ) {
    return { ok: false, message: "Rating leaderboard limit is invalid." };
  }
  const rawScope = getSingleSearchParam(url.searchParams, "scope") ?? "global";
  if (!RATING_LEADERBOARD_SCOPES.has(rawScope as OnlineRatingLeaderboardScope)) {
    return { ok: false, message: "Rating leaderboard scope is invalid." };
  }
  return { ok: true, limit, scope: rawScope as OnlineRatingLeaderboardScope };
}

function parseOpenSeekDirectoryOptions(
  originalUrl: string
): { ok: true; options: OpenSeekDirectoryListOptions } | { ok: false; message: string } {
  const url = new URL(originalUrl, "http://localhost");
  if (hasSensitivePublicDirectoryQuery(url.searchParams)) {
    return { ok: false, message: "Public seek query is invalid." };
  }

  for (const name of ["state", "limit", "cursor", "creatorSeat", "clock", "vp", "rating"]) {
    if (url.searchParams.getAll(name).length > 1) {
      return { ok: false, message: "Public seek query is invalid." };
    }
  }

  const state = getSingleSearchParam(url.searchParams, "state") ?? "open";
  if (!OPEN_SEEK_DIRECTORY_STATES.has(state as OpenSeekDirectoryListOptions["state"])) {
    return { ok: false, message: "Public seek state is invalid." };
  }

  const rawLimit = getSingleSearchParam(url.searchParams, "limit");
  const limit = rawLimit === null ? ONLINE_SEEK_DIRECTORY_DEFAULT_LIMIT : Number(rawLimit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ONLINE_SEEK_DIRECTORY_MAX_LIMIT ||
    String(limit) !== String(rawLimit ?? limit)
  ) {
    return { ok: false, message: "Public seek limit is invalid." };
  }

  const cursor = getSingleSearchParam(url.searchParams, "cursor") ?? undefined;
  if (cursor) {
    const decoded = decodeOpenSeekDirectoryCursor(cursor);
    if (!decoded.ok) {
      return { ok: false, message: "Public seek cursor is invalid." };
    }
  }

  const creatorSeat = getSingleSearchParam(url.searchParams, "creatorSeat") ?? undefined;
  if (creatorSeat && !["w", "b", "random"].includes(creatorSeat)) {
    return { ok: false, message: "Public seek creator side is invalid." };
  }

  const clock = getSingleSearchParam(url.searchParams, "clock") ?? undefined;
  if (clock && !OPEN_SEEK_DIRECTORY_CLOCK_FILTERS.has(clock as OpenSeekDirectoryClockFilter)) {
    return { ok: false, message: "Public seek clock filter is invalid." };
  }

  const vp = getSingleSearchParam(url.searchParams, "vp") ?? undefined;
  if (vp && !OPEN_SEEK_DIRECTORY_VP_FILTERS.has(vp as OpenSeekDirectoryVpFilter)) {
    return { ok: false, message: "Public seek victory points filter is invalid." };
  }

  const rating = getSingleSearchParam(url.searchParams, "rating") ?? undefined;
  if (
    rating &&
    !OPEN_SEEK_DIRECTORY_RATING_FILTERS.has(rating as OpenSeekDirectoryRatingFilter)
  ) {
    return { ok: false, message: "Public seek rating filter is invalid." };
  }

  return {
    ok: true,
    options: {
      state: state as OpenSeekDirectoryListOptions["state"],
      limit,
      cursor,
      creatorSeat: creatorSeat as OpenSeekSeat | undefined,
      clock: clock as OpenSeekDirectoryClockFilter | undefined,
      vp: vp as OpenSeekDirectoryVpFilter | undefined,
      rating: rating as OpenSeekDirectoryListOptions["rating"],
    },
  };
}

function compareDirectorySummaries(left: OnlineGameSummary, right: OnlineGameSummary): number {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  return left.gameId.localeCompare(right.gameId);
}

function applyDirectoryCursor(
  summaries: OnlineGameSummary[],
  cursor: string | undefined
): OnlineGameSummary[] {
  if (!cursor) return summaries;
  const decoded = decodeOnlineGameDirectoryCursor(cursor);
  if (!decoded.ok) {
    throw new Error(decoded.error.message);
  }
  return summaries.filter((summary) =>
    summary.updatedAt < decoded.value.updatedAt ||
    (summary.updatedAt === decoded.value.updatedAt && summary.gameId > decoded.value.gameId)
  );
}

function paginateDirectorySummaries(
  summaries: OnlineGameSummary[],
  options: OnlineGameDirectoryListOptions
): OnlineGameDirectoryResponse {
  const filtered = applyDirectoryCursor(
    summaries
      .filter((summary) => onlineGameSummaryMatchesDirectoryFilters(summary, options))
      .sort(compareDirectorySummaries),
    options.cursor
  );
  const games = filtered.slice(0, options.limit);
  const nextCursor =
    filtered.length > options.limit && games.length > 0
      ? encodeOnlineGameDirectoryCursor(games[games.length - 1])
      : undefined;
  return {
    schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
    games,
    nextCursor,
  };
}

function paginatePersonalDirectorySummaries(
  summaries: OnlineGameSummary[],
  options: OnlinePersonalGameDirectoryListOptions
): OnlineGameDirectoryResponse {
  const filtered = applyDirectoryCursor(
    summaries
      .filter((summary) => onlineGameSummaryMatchesPersonalDirectoryFilters(summary, options))
      .sort(compareDirectorySummaries),
    options.cursor
  );
  const games = filtered.slice(0, options.limit);
  const nextCursor =
    filtered.length > options.limit && games.length > 0
      ? encodeOnlineGameDirectoryCursor(games[games.length - 1])
      : undefined;
  return {
    schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
    games,
    nextCursor,
  };
}

function compareOpenSeekSummaries(left: OpenSeekSummary, right: OpenSeekSummary): number {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  return left.seekId.localeCompare(right.seekId);
}

function applyOpenSeekDirectoryCursor(
  summaries: OpenSeekSummary[],
  cursor: string | undefined
): OpenSeekSummary[] {
  if (!cursor) return summaries;
  const decoded = decodeOpenSeekDirectoryCursor(cursor);
  if (!decoded.ok) throw new Error(decoded.error.message);
  return summaries.filter((summary) =>
    summary.updatedAt < decoded.value.updatedAt ||
    (summary.updatedAt === decoded.value.updatedAt && summary.seekId > decoded.value.seekId)
  );
}

function paginateOpenSeekSummaries(
  summaries: OpenSeekSummary[],
  options: OpenSeekDirectoryListOptions,
  now: string | number | Date = Date.now()
): OpenSeekDirectoryResponse {
  const filtered = applyOpenSeekDirectoryCursor(
    summaries
      .filter((summary) => canListOpenSeekSummary(summary, now))
      .filter((summary) => openSeekMatchesDirectoryFilters(summary, options))
      .sort(compareOpenSeekSummaries),
    options.cursor
  );
  const seeks = filtered.slice(0, options.limit);
  const nextCursor =
    filtered.length > options.limit && seeks.length > 0
      ? encodeOpenSeekDirectoryCursor(seeks[seeks.length - 1])
      : undefined;
  return {
    schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
    seeks,
    nextCursor,
  };
}

function sendSocketError(socket: WebSocket, error: OnlineReject): void {
  sendJson(socket, {
    type: "error",
    error,
  });
}

function parseMessage(data: RawData): unknown {
  const text = typeof data === "string" ? data : data.toString("utf8");
  return JSON.parse(text);
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function lastHeaderValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const values = raw?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  return values.at(-1) ?? null;
}

function getTrustedForwardedClient(headers: http.IncomingHttpHeaders, remoteAddress: string | undefined): string | null {
  if (!isLoopbackAddress(remoteAddress)) return null;
  return lastHeaderValue(headers["x-forwarded-for"]) ?? lastHeaderValue(headers["x-real-ip"]);
}

function getClientKey(req: Request): string {
  return getTrustedForwardedClient(req.headers, req.socket.remoteAddress) ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function getSocketClientKey(req: http.IncomingMessage): string {
  return getTrustedForwardedClient(req.headers, req.socket.remoteAddress) ?? req.socket.remoteAddress ?? "unknown";
}

function getBearerToken(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function setOnlineNoStoreHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.vary("Authorization");
}

function httpStatusForOnlineError(error: OnlineReject): number {
  switch (error.code) {
    case "bad_json":
    case "bad_request":
    case "unknown_message":
      return 400;
    case "unauthorized":
    case "not_found":
    case "not_joined":
      return 404;
    case "rate_limited":
      return 429;
    case "not_allowed":
      return 409;
    case "persistence_failed":
      return 503;
    default:
      return 409;
  }
}

function responseBodyWithOptionalSnapshot(
  error: OnlineReject,
  snapshot?: unknown
): { error: OnlineReject; protocolVersion?: typeof ONLINE_PROTOCOL_VERSION; snapshot?: unknown } {
  return snapshot ? { error, protocolVersion: ONLINE_PROTOCOL_VERSION, snapshot } : { error };
}

function spectatorNotFoundError(): OnlineReject {
  return {
    code: "not_found",
    message: "No online game was found for that id.",
  };
}

function challengeNotFoundError(): OnlineReject {
  return {
    code: "not_found",
    message: "No online challenge was found for that id and token.",
  };
}

function defaultChallengeIdFactory(): string {
  return `challenge_${randomBytes(9).toString("base64url")}`;
}

function defaultChallengeTokenFactory(): string {
  return randomBytes(18).toString("base64url");
}

function defaultOpenSeekIdFactory(): string {
  return `seek_${randomBytes(9).toString("base64url")}`;
}

function defaultOpenSeekTokenFactory(): string {
  return randomBytes(18).toString("base64url");
}

function defaultAccountIdFactory(): string {
  return `account_${randomBytes(9).toString("base64url")}`;
}

function defaultAccountSessionIdFactory(): string {
  return `account_session_${randomBytes(9).toString("base64url")}`;
}

function defaultAccountReportIdFactory(): string {
  return `report_${randomBytes(9).toString("base64url")}`;
}

function defaultAccountSessionTokenFactory(): string {
  return randomBytes(ACCOUNT_SESSION_TOKEN_BYTES).toString("base64url");
}

function buildChallengeUrl(
  publicBaseUrl: string,
  challengeId: string,
  role: OnlineChallengeRole,
  token: string
): string {
  const url = new URL(publicBaseUrl);
  url.searchParams.set("onlineChallenge", challengeId);
  url.searchParams.set("challengeRole", role);
  url.hash = new URLSearchParams({ challengeToken: token }).toString();
  return url.toString();
}

function buildOnlineGameInviteUrl(
  publicBaseUrl: string,
  gameId: string,
  seat: "w" | "b",
  token: string
): string {
  const url = new URL(publicBaseUrl);
  url.searchParams.set("onlineGame", gameId);
  url.searchParams.set("seat", seat);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildTokenlessOnlineGameUrl(
  publicBaseUrl: string,
  gameId: string,
  seat: "w" | "b"
): string {
  const url = new URL(publicBaseUrl);
  url.searchParams.set("onlineGame", gameId);
  url.searchParams.set("seat", seat);
  return url.toString();
}

function parseChallengeExpiry(value: unknown): { ok: true; value: number } | { ok: false; error: OnlineReject } {
  if (value === undefined) return { ok: true, value: DEFAULT_CHALLENGE_EXPIRES_IN_MS };
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return {
      ok: false,
      error: { code: "bad_request", message: "Challenge expiry must be a whole number of milliseconds." },
    };
  }
  if (value < MIN_CHALLENGE_EXPIRES_IN_MS || value > MAX_CHALLENGE_EXPIRES_IN_MS) {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Challenge expiry must be between 5 minutes and 7 days.",
      },
    };
  }
  return { ok: true, value };
}

function normalizeChallengeSeat(value: unknown): "w" | "b" | "random" | null {
  if (value === undefined) return "random";
  return value === "w" || value === "b" || value === "random" ? value : null;
}

function normalizeOpenSeekSeat(value: unknown): "w" | "b" | "random" | null {
  if (value === undefined) return "random";
  return value === "w" || value === "b" || value === "random" ? value : null;
}

function normalizeOpenSeekVisibility(value: unknown): OpenSeekVisibility | null {
  if (value === undefined) return "public";
  return value === "public" || value === "followed" ? value : null;
}

function normalizeDirectGameCreatorSeat(value: unknown): "w" | "b" | null {
  if (value === undefined) return "w";
  return value === "w" || value === "b" ? value : null;
}

function normalizeOnlineSetupForCreation(setup: OnlineGameSetupDTO): OnlineGameSetupDTO {
  return {
    ...setup,
    timeControl: setup.timeControl ?? { ...DEFAULT_ONLINE_TIME_CONTROL },
    ratingMode: setup.ratingMode ?? "casual",
  };
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }
  return cookies;
}

function setGoogleOAuthStateCookie(
  res: Response,
  nonce: string,
  secure: boolean
): void {
  res.cookie(GOOGLE_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/online/account/oauth/google/callback",
    maxAge: GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS * 1000,
  });
}

function clearGoogleOAuthStateCookie(res: Response, secure: boolean): void {
  res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/online/account/oauth/google/callback",
  });
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObjectKeys(entry)])
  );
}

function canonicalSetupSignature(setup: OnlineGameSetupDTO): string {
  return JSON.stringify(sortObjectKeys({
    ...setup,
    ratingMode: setup.ratingMode ?? "casual",
  }));
}

function normalizePublicSessionIdentity(
  value: unknown,
  label: string
): { ok: true; identity: { kind: "session"; id: string } } | { ok: false; error: OnlineReject } {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    return {
      ok: false,
      error: { code: "bad_request", message: `${label} must be a public session id.` },
    };
  }
  if (stringContainsDurableSecret(value)) {
    return {
      ok: false,
      error: { code: "bad_request", message: `${label} must not contain secrets.` },
    };
  }
  return { ok: true, identity: { kind: "session", id: value } };
}

function publicPlayerIdentityQueueKey(identity: PublicPlayerIdentity): string {
  return `${identity.kind}:${identity.id}`;
}

function normalizeChallengeVisibility(value: unknown): "private" | "unlisted" | null {
  if (value === undefined) return "unlisted";
  return value === "private" || value === "unlisted" ? value : null;
}

function normalizeGameVisibility(value: unknown): OnlinePlayerSettableGameVisibility | null {
  return isOnlinePlayerSettableGameVisibility(value) ? value : null;
}

function challengeTerminalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /already terminal|no longer pending|must be before expiry|expired|expiry/i.test(message);
}

function openSeekTerminalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /already terminal|no longer open|own open seek|must be before expiry|expired|expiry/i.test(message);
}

async function checkStoreReadyWithTimeout(
  checkStoreReady: () => boolean | Promise<boolean>,
  timeoutMs: number
): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(checkStoreReady),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new StoreReadinessTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function createOnlineHttpServer(options: CreateOnlineHttpServerOptions) {
  const app = express();
  app.set("trust proxy", "loopback");
  const service =
    options.service ??
    new OnlineGameService({
      credentialFactory: hashOnlineToken,
      verifyToken: verifyOnlineToken,
      now: options.now,
    });
  const accountStore = options.accountStore ?? new MemoryOnlineAccountStore();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
  const connections = new Map<WebSocket, OnlineConnection>();
  const disconnectedSockets = new WeakSet<WebSocket>();
  const actionQueues = new Map<string, Promise<void>>();
  const createGameLimiter = new FixedWindowRateLimiter(20, 60_000);
  const accountCreateLimiter = new FixedWindowRateLimiter(10, 60_000);
  const accountAuthLimiter = new FixedWindowRateLimiter(30, 60_000);
  const accountReadLimiter = new FixedWindowRateLimiter(120, 10_000);
  const createChallengeLimiter = new FixedWindowRateLimiter(20, 60_000);
  const createOpenSeekLimiter = new FixedWindowRateLimiter(20, 60_000);
  const quickMatchLimiter = new FixedWindowRateLimiter(20, 60_000);
  const challengeActionLimiter = new FixedWindowRateLimiter(120, 10_000);
  const openSeekActionLimiter = new FixedWindowRateLimiter(120, 10_000);
  const publicDirectoryLimiter = new FixedWindowRateLimiter(240, 10_000);
  const spectatorSnapshotLimiter = new FixedWindowRateLimiter(120, 10_000);
  const socketMessageLimiter = new FixedWindowRateLimiter(120, 10_000);
  const accountChallengePairQueues = new Map<string, Promise<void>>();
  const memoryChallengeEvents: OnlineChallengeEvent[] = [];
  const memoryChallengeCredentials = new Map<string, OnlineChallengeCredentials>();
  const memoryOpenSeekEvents: OpenSeekEvent[] = [];
  const memoryOpenSeekCredentials = new Map<string, OpenSeekCredentials>();
  const quickMatchSessionQueues = new Map<string, Promise<void>>();
  const googleOAuthStateSecret = randomBytes(32).toString("base64url");
  const googleOAuthConfig = normalizeGoogleOAuthProviderConfig(
    options.oauth?.google,
    options.publicBaseUrl,
    googleOAuthStateSecret
  );
  const googleOAuthCookieSecure = new URL(options.publicBaseUrl).protocol === "https:";

  const log = (event: OnlineServerLogEvent): void => {
    try {
      options.onLog?.(event);
    } catch (error) {
      console.error("Online server log hook failed", error);
    }
  };

  const resolveAccountBearer = async (
    req: Request
  ): Promise<
    | { ok: true; account: OnlineAccount; identity: AuthenticatedOnlineIdentity; sessionId: string; usedAt: string }
    | { ok: false; status: number; error: OnlineReject; reason: string }
  > => {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return {
        ok: false,
        status: 401,
        error: { code: "unauthorized", message: "Account session is required." },
        reason: "missing_account_token",
      };
    }
    try {
      const usedAt = new Date(options.now?.() ?? Date.now()).toISOString();
      const resolved = await accountStore.resolveSessionToken(token, usedAt);
      if (!resolved) {
        return {
          ok: false,
          status: 401,
          error: { code: "unauthorized", message: "Account session is invalid." },
          reason: "bad_account_token",
        };
      }
      return {
        ok: true,
        account: resolved.account,
        identity: resolved.account.identity as AuthenticatedOnlineIdentity,
        sessionId: resolved.sessionId,
        usedAt,
      };
    } catch (error) {
      console.error("Failed to resolve account session", error);
      return {
        ok: false,
        status: 503,
        error: { code: "persistence_failed", message: "Account session could not be checked." },
        reason: "account_store_failed",
      };
    }
  };

  const resolveOptionalAccountIdentity = async (
    req: Request
  ): Promise<
    | { ok: true; identity: OnlineIdentity | null }
    | { ok: false; status: number; error: OnlineReject; reason: string }
  > => {
    if (req.headers.authorization === undefined) {
      return { ok: true, identity: null };
    }
    const resolved = await resolveAccountBearer(req);
    if (!resolved.ok) return resolved;
    return { ok: true, identity: resolved.account.identity };
  };

  const resolveOptionalAccountSession = async (
    req: Request
  ): Promise<
    | { ok: true; account: OnlineAccount | null; identity: OnlineIdentity | null }
    | { ok: false; status: number; error: OnlineReject; reason: string }
  > => {
    if (req.headers.authorization === undefined) {
      return { ok: true, account: null, identity: null };
    }
    const resolved = await resolveAccountBearer(req);
    if (!resolved.ok) return resolved;
    return { ok: true, account: resolved.account, identity: resolved.account.identity };
  };

  const canAccountViewOpenSeek = async (
    summary: OpenSeekSummary,
    viewerAccount: OnlineAccount | null
  ): Promise<boolean> => {
    if ((summary.visibility ?? "public") === "public") return true;
    if (summary.creatorIdentity.kind !== "registered") return false;
    if (!viewerAccount) return false;
    if (isSameOpenSeekIdentity(viewerAccount.identity, summary.creatorIdentity)) return true;
    if (!summary.creatorIdentity.displayName) return false;
    const creatorProfile = await accountStore.getProfileForDisplayName(
      viewerAccount.accountId,
      summary.creatorIdentity.displayName
    );
    return creatorProfile?.relationship.followedBy === true &&
      creatorProfile.relationship.blocked !== true;
  };

  const filterOpenSeekSummariesForViewer = async (
    summaries: OpenSeekSummary[],
    viewerAccount: OnlineAccount | null
  ): Promise<OpenSeekSummary[]> => {
    const visible: OpenSeekSummary[] = [];
    for (const summary of summaries) {
      if (await canAccountViewOpenSeek(summary, viewerAccount)) {
        visible.push(summary);
      }
    }
    return visible;
  };

  const parseProfileDisplayNameParam = (raw: unknown): string | null => {
    const displayName = normalizeOnlineAccountDisplayName(raw);
    return displayName.ok ? displayName.value : null;
  };

  const socialActionError = (
    result: OnlineAccountSocialActionResult,
    actionLabel: string
  ): { status: number; error: OnlineReject } => {
    switch (result.status) {
      case "not_found":
      case "blocked":
        return {
          status: 404,
          error: { code: "not_found", message: "No online account was found for that action." },
        };
      case "self":
        return {
          status: 400,
          error: { code: "bad_request", message: `You cannot ${actionLabel} your own account.` },
        };
      case "not_allowed":
        return {
          status: 409,
          error: { code: "not_allowed", message: "That account is not accepting follows." },
        };
      case "ok":
        return {
          status: 500,
          error: { code: "persistence_failed", message: "Social action result was incomplete." },
        };
      default:
        return {
          status: 500,
          error: { code: "persistence_failed", message: "Social action result was invalid." },
        };
    }
  };

  const accountReportError = (
    result: OnlineAccountReportSubmissionResult,
  ): { status: number; error: OnlineReject } => {
    switch (result.status) {
      case "not_found":
        return {
          status: 404,
          error: { code: "not_found", message: "No online account was found for that report." },
        };
      case "self":
        return {
          status: 400,
          error: { code: "bad_request", message: "You cannot report your own account." },
        };
      case "ok":
        return {
          status: 500,
          error: { code: "persistence_failed", message: "Report submission result was incomplete." },
        };
      default:
        return {
          status: 500,
          error: { code: "persistence_failed", message: "Report submission result was invalid." },
        };
    }
  };

  const challengeTargetError = (
    status: "not_found" | "self" | "blocked" | "not_allowed"
  ): { status: number; error: OnlineReject } => {
    switch (status) {
      case "not_found":
      case "blocked":
        return {
          status: 404,
          error: { code: "not_found", message: "No online account was found for that challenge." },
        };
      case "self":
        return {
          status: 400,
          error: { code: "bad_request", message: "You cannot challenge your own account." },
        };
      case "not_allowed":
        return {
          status: 409,
          error: { code: "not_allowed", message: "That account is not accepting challenges." },
        };
      default:
        return {
          status: 500,
          error: { code: "persistence_failed", message: "Challenge target result was incomplete." },
        };
    }
  };

  const runQuickMatchForSession = async <T>(
    sessionId: string,
    task: () => Promise<T>
  ): Promise<T> => {
    const previous = quickMatchSessionQueues.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => gate);
    quickMatchSessionQueues.set(sessionId, queued);
    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (quickMatchSessionQueues.get(sessionId) === queued) {
        quickMatchSessionQueues.delete(sessionId);
      }
    }
  };

  const accountChallengePairQueueKey = (
    challengerIdentity: OnlineIdentity,
    challengedIdentity: OnlineIdentity
  ): string => {
    return [
      publicPlayerIdentityQueueKey(challengerIdentity),
      publicPlayerIdentityQueueKey(challengedIdentity),
    ].join("\u0000");
  };

  const runAccountChallengePairTask = async <T>(
    pairKey: string,
    task: () => Promise<T>
  ): Promise<T> => {
    const previous = accountChallengePairQueues.get(pairKey) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => gate);
    accountChallengePairQueues.set(pairKey, queued);
    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (accountChallengePairQueues.get(pairKey) === queued) {
        accountChallengePairQueues.delete(pairKey);
      }
    }
  };

  const logSocketDisconnect = (socket: WebSocket, reason?: string): void => {
    if (disconnectedSockets.has(socket)) return;
    disconnectedSockets.add(socket);
    const connection = connections.get(socket);
    log({
      event: "online.socket.disconnect",
      gameId: connection?.gameId,
      role: connection?.role,
      status: "disconnected",
      reason,
    });
    connections.delete(socket);
  };

  const closeStalePlayerSocket = (socket: WebSocket, connection: Extract<OnlineConnection, { role: "player" }>): void => {
    sendSocketError(socket, {
      code: "unauthorized",
      message: "This player session is no longer authorized.",
    });
    log({
      event: "online.socket.credential",
      gameId: connection.gameId,
      role: "player",
      status: "rejected",
      reason: "credential_pruned",
    });
    logSocketDisconnect(socket, "credential_pruned");
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1008, "player credential pruned");
    }
  };

  const disconnectStalePlayerSockets = (gameId: string): void => {
    const room = service.getRoom(gameId);
    if (!room) return;
    for (const [socket, connection] of Array.from(connections.entries())) {
      if (connection.gameId !== gameId || connection.role !== "player") continue;
      if (!room.authenticate(connection.token)) {
        closeStalePlayerSocket(socket, connection);
      }
    }
  };

  const enqueueGameAction = (gameId: string, operation: () => Promise<void>): Promise<void> => {
    const previous = actionQueues.get(gameId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const settled = next.catch(() => undefined);
    actionQueues.set(gameId, settled);
    settled.finally(() => {
      if (actionQueues.get(gameId) === settled) {
        actionQueues.delete(gameId);
      }
    });
    return next;
  };

  const countConnectedSpectators = (gameId: string): number => {
    let count = 0;
    for (const connection of connections.values()) {
      if (connection.role === "spectator" && connection.gameId === gameId) {
        count += 1;
      }
    }
    return count;
  };

  const stripLiveResponseFields = (summary: OnlineGameSummary): OnlineGameSummary => {
    const hasSpectatorCount = summary.livePreview.spectatorCount !== undefined;
    const hasClockServerNow = summary.livePreview.clock?.serverNow !== undefined;
    if (!hasSpectatorCount && !hasClockServerNow) return summary;

    const { spectatorCount: _spectatorCount, ...livePreview } = summary.livePreview;
    if (hasClockServerNow && livePreview.clock) {
      const { serverNow: _serverNow, ...clock } = livePreview.clock;
      livePreview.clock = clock;
    }
    return { ...summary, livePreview };
  };

  const withLiveServerPresence = (summary: OnlineGameSummary): OnlineGameSummary => {
    const base = stripLiveResponseFields(summary);
    if (base.status !== "active") return base;

    const spectatorCount = countConnectedSpectators(base.gameId);
    const clock = base.livePreview.clock
      ? {
          ...base.livePreview.clock,
          serverNow: options.now?.() ?? Date.now(),
        }
      : undefined;
    if (spectatorCount <= 0 && !clock) return base;

    return {
      ...base,
      livePreview: {
        ...base.livePreview,
        ...(clock ? { clock } : {}),
        ...(spectatorCount > 0 ? { spectatorCount } : {}),
      },
    };
  };

  const withLiveServerPresenceDirectory = (
    response: OnlineGameDirectoryResponse
  ): OnlineGameDirectoryResponse => ({
    ...response,
    games: response.games.map(withLiveServerPresence),
  });

  const loadValidatedSummaryForGame = async (
    gameId: string
  ): Promise<
    | { ok: true; summary: OnlineGameSummary | null }
    | { ok: false; reason: "summary_load_failed" | "summary_invalid" }
  > => {
    if (options.loadGameSummary) {
      let summary: OnlineGameSummary | null;
      try {
        summary = await options.loadGameSummary(gameId);
      } catch {
        return { ok: false, reason: "summary_load_failed" };
      }
      if (!summary) return { ok: true, summary: null };
      const validation = validateOnlineGameSummary(
        stripOnlineGameSummaryResponseOnlyFields(summary)
      );
      if (!validation.ok) {
        return { ok: false, reason: "summary_invalid" };
      }
      return { ok: true, summary: withLiveServerPresence(validation.value) };
    }

    if (!options.loadGameSummaries) return { ok: true, summary: null };
    let summaries: OnlineGameSummary[];
    try {
      summaries = await options.loadGameSummaries();
    } catch {
      return { ok: false, reason: "summary_load_failed" };
    }

    for (const summary of summaries) {
      if (summary.gameId !== gameId) continue;
      const validation = validateOnlineGameSummary(
        stripOnlineGameSummaryResponseOnlyFields(summary)
      );
      if (!validation.ok) {
        return { ok: false, reason: "summary_invalid" };
      }
      return { ok: true, summary: withLiveServerPresence(validation.value) };
    }
    return { ok: true, summary: null };
  };

  const checkSpectatorAccess = async (
    gameId: string
  ): Promise<{ ok: true } | { ok: false; error: OnlineReject; reason: string }> => {
    if (!options.loadGameSummary && !options.loadGameSummaries) {
      return { ok: true };
    }

    const lookup = await loadValidatedSummaryForGame(gameId);
    if (!lookup.ok) {
      return { ok: false, error: spectatorNotFoundError(), reason: lookup.reason };
    }
    if (!lookup.summary) {
      return { ok: false, error: spectatorNotFoundError(), reason: "summary_missing" };
    }
    if (!canSpectateOnlineGameSummary(lookup.summary)) {
      return { ok: false, error: spectatorNotFoundError(), reason: "access_denied" };
    }
    return { ok: true };
  };

  const loadChallengeSummaries = async (): Promise<OnlineChallengeSummary[]> => {
    const summaries = options.loadChallengeSummaries
      ? await options.loadChallengeSummaries()
      : projectOnlineChallengeSummaries(memoryChallengeEvents);
    return summaries.map((summary, index) => {
      const validation = validateOnlineChallengeSummary(summary);
      if (!validation.ok) {
        throw new Error(`Invalid online challenge summary ${index + 1}: ${validation.error.message}`);
      }
      return validation.value;
    });
  };

  const listPublicGameDirectory = async (
    directoryOptions: OnlineGameDirectoryListOptions
  ): Promise<OnlineGameDirectoryResponse> => {
    if (options.listGameSummaries) {
      const response = await options.listGameSummaries(directoryOptions);
      const validation = validateOnlineGameDirectoryResponse(
        stripOnlineGameDirectoryResponseOnlyFields(response)
      );
      if (!validation.ok) {
        throw new Error(validation.error.message);
      }
      if (validation.value.games.some((summary) => !canListOnlineGameSummary(summary))) {
        throw new Error("Public directory returned a hidden game summary.");
      }
      return withLiveServerPresenceDirectory(validation.value);
    }

    const summaries = options.loadGameSummaries ? await options.loadGameSummaries() : [];
    const validated = summaries.map((summary, index) => {
      const validation = validateOnlineGameSummary(
        stripOnlineGameSummaryResponseOnlyFields(summary)
      );
      if (!validation.ok) {
        throw new Error(`Invalid online game summary ${index + 1}: ${validation.error.message}`);
      }
      return validation.value;
    });
    return withLiveServerPresenceDirectory(paginateDirectorySummaries(validated, directoryOptions));
  };

  const listPersonalGameDirectory = async (
    directoryOptions: OnlinePersonalGameDirectoryListOptions
  ): Promise<OnlineGameDirectoryResponse> => {
    if (options.listPersonalGameSummaries) {
      const response = await options.listPersonalGameSummaries(directoryOptions);
      const validation = validateOnlineGameDirectoryResponse(
        stripOnlineGameDirectoryResponseOnlyFields(response)
      );
      if (!validation.ok) {
        throw new Error(validation.error.message);
      }
      if (
        validation.value.games.some(
          (summary) => !onlineGameSummaryMatchesPersonalDirectoryFilters(summary, directoryOptions)
        )
      ) {
        throw new Error("Personal history returned a game for a different identity.");
      }
      return withLiveServerPresenceDirectory(validation.value);
    }

    const summaries = options.loadGameSummaries ? await options.loadGameSummaries() : [];
    const validated = summaries.map((summary, index) => {
      const validation = validateOnlineGameSummary(
        stripOnlineGameSummaryResponseOnlyFields(summary)
      );
      if (!validation.ok) {
        throw new Error(`Invalid online game summary ${index + 1}: ${validation.error.message}`);
      }
      return validation.value;
    });
    return withLiveServerPresenceDirectory(
      paginatePersonalDirectorySummaries(validated, directoryOptions)
    );
  };

  const seatForGameIdentity = (
    summary: OnlineGameSummary,
    identity: OnlineIdentity
  ): "w" | "b" | null => {
    const participant = summary.participants.find((candidate) =>
      isSameOnlineIdentity(candidate.identity, identity)
    );
    return participant?.seat === "w" || participant?.seat === "b" ? participant.seat : null;
  };

  const loadChallengeSummary = async (challengeId: string): Promise<OnlineChallengeSummary | null> => {
    return (await loadChallengeSummaries()).find((summary) => summary.challengeId === challengeId) ?? null;
  };

  const accountChallengeOpponentIdentity = (
    summary: OnlineChallengeSummary,
    identity: OnlineIdentity
  ): OnlineIdentity | null => {
    if (isSameOnlineIdentity(summary.challengerIdentity, identity)) return summary.challengedIdentity;
    if (isSameOnlineIdentity(summary.challengedIdentity, identity)) return summary.challengerIdentity;
    return null;
  };

  const canAccountAccessChallengeSummary = async (
    account: OnlineAccount,
    summary: OnlineChallengeSummary
  ): Promise<boolean> => {
    const opponent = accountChallengeOpponentIdentity(summary, account.identity);
    if (!opponent) return false;
    if (opponent.kind !== "registered") return true;
    if (!opponent.displayName) return false;
    const profile = await accountStore.getProfileForDisplayName(account.accountId, opponent.displayName);
    return profile !== null && profile.relationship.blocked !== true;
  };

  const registeredIdentityMatchesDisplayNameKey = (
    identity: OnlineIdentity,
    displayNameKey: string
  ): boolean => {
    return identity.kind === "registered" &&
      typeof identity.displayName === "string" &&
      normalizeOnlineAccountDisplayNameKey(identity.displayName) === displayNameKey;
  };

  const terminatePendingAccountChallengesForBlock = async (
    blockerIdentity: AuthenticatedOnlineIdentity,
    blockedDisplayName: string,
    terminatedAt: string
  ): Promise<number> => {
    const blockedDisplayNameKey = normalizeOnlineAccountDisplayNameKey(blockedDisplayName);
    const summaries = await Promise.all(
      (await loadChallengeSummaries()).map((summary) => expireChallengeIfNeeded(summary, terminatedAt))
    );
    let terminatedCount = 0;

    for (const summary of summaries) {
      if (summary.status !== "pending") continue;
      const blockerIsChallenged =
        isSameOnlineIdentity(summary.challengedIdentity, blockerIdentity) &&
        registeredIdentityMatchesDisplayNameKey(summary.challengerIdentity, blockedDisplayNameKey);
      const blockerIsChallenger =
        isSameOnlineIdentity(summary.challengerIdentity, blockerIdentity) &&
        registeredIdentityMatchesDisplayNameKey(summary.challengedIdentity, blockedDisplayNameKey);

      try {
        if (blockerIsChallenged && canIdentityDeclineChallenge(summary, blockerIdentity, terminatedAt)) {
          await appendChallengeLifecycleEvent(
            createChallengeDeclinedEvent(
              {
                type: "challenge_declined",
                challengeId: summary.challengeId,
                declinedBy: blockerIdentity,
                declinedAt: terminatedAt,
              },
              { createdAt: terminatedAt }
            )
          );
          terminatedCount += 1;
          continue;
        }
        if (blockerIsChallenger && canIdentityCancelChallenge(summary, blockerIdentity, terminatedAt)) {
          await appendChallengeLifecycleEvent(
            createChallengeCancelledEvent(
              {
                type: "challenge_cancelled",
                challengeId: summary.challengeId,
                cancelledBy: blockerIdentity,
                cancelledAt: terminatedAt,
              },
              { createdAt: terminatedAt }
            )
          );
          terminatedCount += 1;
        }
      } catch (error) {
        if (challengeTerminalError(error)) continue;
        throw error;
      }
    }

    return terminatedCount;
  };

  const getAuthorizedAccountChallenge = async (
    rawChallengeId: string,
    account: OnlineAccount,
    identity: AuthenticatedOnlineIdentity
  ): Promise<
    | { ok: true; credential: ResolvedOnlineChallengeCredential; summary: OnlineChallengeSummary }
    | { ok: false; status: number; error: OnlineReject; reason: string }
  > => {
    const challengeId = validateOnlineGameId(rawChallengeId, "account.challenge.challengeId");
    if (!challengeId.ok) {
      return { ok: false, status: 400, error: challengeId.error, reason: challengeId.error.code };
    }
    const summary = await loadChallengeSummary(challengeId.value);
    if (!summary) {
      return { ok: false, status: 404, error: challengeNotFoundError(), reason: "summary_missing" };
    }
    const role = onlineAccountChallengeRoleForIdentity(summary, identity);
    if (!role) {
      return { ok: false, status: 404, error: challengeNotFoundError(), reason: "not_participant" };
    }
    if (!await canAccountAccessChallengeSummary(account, summary)) {
      return { ok: false, status: 404, error: challengeNotFoundError(), reason: "blocked" };
    }
    return {
      ok: true,
      summary,
      credential: {
        challengeId: summary.challengeId,
        role,
        identity,
      },
    };
  };

  const listAccountChallengeDirectory = async (
    account: OnlineAccount,
    state: OnlineAccountChallengeDirectoryState
  ) => {
    const now = new Date(options.now?.() ?? Date.now()).toISOString();
    const summaries = await Promise.all(
      (await loadChallengeSummaries()).map((summary) => expireChallengeIfNeeded(summary, now))
    );
    const challenges = summaries
      .map((summary) => {
        const role = onlineAccountChallengeRoleForIdentity(summary, account.identity);
        return role ? { role, summary } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const visibleChallenges: typeof challenges = [];
    for (const item of challenges) {
      if (state !== "all" && item.summary.status !== "pending") continue;
      if (!await canAccountAccessChallengeSummary(account, item.summary)) continue;
      visibleChallenges.push(item);
    }
    visibleChallenges
      .sort((left, right) => {
        if (left.summary.updatedAt !== right.summary.updatedAt) {
          return right.summary.updatedAt.localeCompare(left.summary.updatedAt);
        }
        return left.summary.challengeId.localeCompare(right.summary.challengeId);
      });
    const response = {
      schemaVersion: ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION,
      challenges: visibleChallenges,
    };
    const validation = validateOnlineAccountChallengeDirectoryResponse(response);
    if (!validation.ok) throw new Error(validation.error.message);
    return validation.value;
  };

  const appendChallengeCreated = async (
    event: Extract<OnlineChallengeEvent, { type: "challenge_created" }>,
    credentials: OnlineChallengeCredentials
  ): Promise<OnlineChallengeSummary> => {
    if (options.appendChallengeCreated) {
      return options.appendChallengeCreated(event, credentials);
    }
    const eventLength = memoryChallengeEvents.length;
    const previousCredentials = memoryChallengeCredentials.get(event.challengeId);
    try {
      memoryChallengeEvents.push(event);
      memoryChallengeCredentials.set(event.challengeId, credentials);
      const summary = projectOnlineChallengeSummaries(memoryChallengeEvents).find(
        (candidate) => candidate.challengeId === event.challengeId
      );
      if (!summary) throw new Error(`Online challenge summary was not refreshed for ${event.challengeId}.`);
      return summary;
    } catch (error) {
      memoryChallengeEvents.splice(eventLength);
      if (previousCredentials) {
        memoryChallengeCredentials.set(event.challengeId, previousCredentials);
      } else {
        memoryChallengeCredentials.delete(event.challengeId);
      }
      throw error;
    }
  };

  const appendChallengeLifecycleEvent = async (
    event: Exclude<
      OnlineChallengeEvent,
      { type: "challenge_created" } | { type: "challenge_accepted" }
    >
  ): Promise<OnlineChallengeSummary> => {
    if (options.appendChallengeEvent) {
      return options.appendChallengeEvent(event);
    }
    const eventLength = memoryChallengeEvents.length;
    try {
      memoryChallengeEvents.push(event);
      const summary = projectOnlineChallengeSummaries(memoryChallengeEvents).find(
        (candidate) => candidate.challengeId === event.challengeId
      );
      if (!summary) throw new Error(`Online challenge summary was not refreshed for ${event.challengeId}.`);
      return summary;
    } catch (error) {
      memoryChallengeEvents.splice(eventLength);
      throw error;
    }
  };

  const resolveChallengeCredential = async (
    challengeId: string,
    token: string
  ): Promise<ResolvedOnlineChallengeCredential | null> => {
    if (options.resolveChallengeCredential) {
      return options.resolveChallengeCredential(challengeId, token);
    }
    const credentials = memoryChallengeCredentials.get(challengeId);
    if (!credentials) return null;
    if (verifyOnlineToken(token, credentials.challengerCredential)) {
      return {
        challengeId,
        role: "challenger",
        identity: credentials.challengerIdentity as ResolvedOnlineChallengeCredential["identity"],
      };
    }
    if (verifyOnlineToken(token, credentials.challengedCredential)) {
      return {
        challengeId,
        role: "challenged",
        identity: credentials.challengedIdentity as ResolvedOnlineChallengeCredential["identity"],
      };
    }
    return null;
  };

  const getAuthorizedChallenge = async (
    req: Request
  ): Promise<
    | { ok: true; token: string; credential: ResolvedOnlineChallengeCredential; summary: OnlineChallengeSummary }
    | { ok: false; status: number; error: OnlineReject; reason: string }
  > => {
    const challengeId = validateOnlineGameId(req.params.challengeId, "challenge.challengeId");
    if (!challengeId.ok) {
      return { ok: false, status: 400, error: challengeId.error, reason: challengeId.error.code };
    }
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return { ok: false, status: 404, error: challengeNotFoundError(), reason: "missing_token" };
    }
    const credential = await resolveChallengeCredential(challengeId.value, token);
    if (!credential) {
      return { ok: false, status: 404, error: challengeNotFoundError(), reason: "bad_token" };
    }
    const summary = await loadChallengeSummary(challengeId.value);
    if (!summary) {
      return { ok: false, status: 404, error: challengeNotFoundError(), reason: "summary_missing" };
    }
    return { ok: true, token, credential, summary };
  };

  const seatForChallengeIdentity = (
    summary: OnlineChallengeSummary,
    identity: ResolvedOnlineChallengeCredential["identity"]
  ): "w" | "b" | null => {
    if (summary.status !== "accepted") return null;
    if (summary.whiteIdentity && isSameOnlineIdentity(summary.whiteIdentity, identity)) return "w";
    if (summary.blackIdentity && isSameOnlineIdentity(summary.blackIdentity, identity)) return "b";
    return null;
  };

  const gameInviteForChallenge = (
    summary: OnlineChallengeSummary,
    credential: ResolvedOnlineChallengeCredential,
    token: string
  ) => {
    if (summary.status !== "accepted" || !summary.gameId) return undefined;
    const seat = seatForChallengeIdentity(summary, credential.identity);
    if (!seat) return undefined;
    return {
      gameId: summary.gameId,
      seat,
      token,
      url: buildTokenlessOnlineGameUrl(options.publicBaseUrl, summary.gameId, seat),
    };
  };

  const createFreshGameSeatInvite = async (
    gameId: string,
    seat: "w" | "b"
  ) => {
    const token = service.createSeatToken(seat);
    const credential = service.credentialForToken(token);
    if (options.appendGameSeatCredential && !isOnlineTokenCredentialHash(credential)) {
      throw new Error("Fresh account game credential was not persistable.");
    }
    const record = options.appendGameSeatCredential
      ? await options.appendGameSeatCredential(gameId, seat, credential)
      : service.addSeatCredential(gameId, seat, credential);
    if (!record) {
      throw new Error(`Online game ${gameId} was not found while adding account challenge credential.`);
    }
    service.replaceRoom(record);
    disconnectStalePlayerSockets(gameId);
    return {
      gameId,
      seat,
      token,
      url: buildTokenlessOnlineGameUrl(options.publicBaseUrl, gameId, seat),
    };
  };

  const createInitialClockRecord = (setup: OnlineGameSetupDTO, gameId: string) => {
    const room = OnlineGameRoom.create({
      setup,
      gameId,
      whiteCredential: "",
      blackCredential: "",
      now: options.now,
    });
    return room.toRecord().clock;
  };

  const createMemoryChallengeAcceptedGame = async (
    input: OnlineChallengeAcceptInput
  ): Promise<OnlineChallengeAcceptResult> => {
    const summary = await loadChallengeSummary(input.challengeId);
    if (!summary) throw new Error(`Online challenge ${input.challengeId} was not found.`);
    if (summary.status !== "pending") throw new Error(`Online challenge ${input.challengeId} is already terminal.`);
    if (!canIdentityAcceptChallenge(summary, input.acceptedBy.identity, input.acceptedAt)) {
      throw new Error(`Resolved challenged role cannot accept online challenge ${input.challengeId}.`);
    }
    if (JSON.stringify(summary.setup) !== JSON.stringify(input.gameCreatedEvent.setup)) {
      throw new Error(`Accepted online game setup must match challenge ${input.challengeId}.`);
    }
    const credentials = memoryChallengeCredentials.get(input.challengeId);
    if (!credentials) throw new Error(`Missing online challenge credentials for ${input.challengeId}.`);
    const challengerSeat = isSameOnlineIdentity(input.whiteIdentity, summary.challengerIdentity) ? "w" : "b";
    const challengedSeat = challengerSeat === "w" ? "b" : "w";
    const gameCredentials: OnlineGameCredentials =
      challengerSeat === "w"
        ? {
            whiteCredential: credentials.challengerCredential,
            blackCredential: credentials.challengedCredential,
          }
        : {
            whiteCredential: credentials.challengedCredential,
            blackCredential: credentials.challengerCredential,
          };
    const challengeEvent = createChallengeAcceptedEvent(
      {
        type: "challenge_accepted",
        challengeId: input.challengeId,
        acceptedBy: input.acceptedBy.identity,
        acceptedAt: input.acceptedAt,
        gameId: input.gameCreatedEvent.gameId,
        whiteIdentity: input.whiteIdentity,
        blackIdentity: input.blackIdentity,
      },
      { createdAt: input.acceptedAt }
    );
    const gameCreatedEvent = {
      ...input.gameCreatedEvent,
      whiteIdentity: input.whiteIdentity,
      blackIdentity: input.blackIdentity,
    };
    const eventLength = memoryChallengeEvents.length;
    try {
      memoryChallengeEvents.push(challengeEvent);
      const challengeSummary = projectOnlineChallengeSummaries(memoryChallengeEvents).find(
        (candidate) => candidate.challengeId === input.challengeId
      );
      if (!challengeSummary) throw new Error(`Online challenge summary was not refreshed for ${input.challengeId}.`);
      const [gameSummary] = projectOnlineGameSummaries([gameCreatedEvent]);
      if (!gameSummary) throw new Error(`Online game summary was not refreshed for ${gameCreatedEvent.gameId}.`);
      const gameRecord: OnlineGameRoomRecord = {
        gameId: gameCreatedEvent.gameId,
        setup: gameCreatedEvent.setup,
        whiteCredential: gameCredentials.whiteCredential,
        blackCredential: gameCredentials.blackCredential,
        clock: gameCreatedEvent.clock,
        acceptedActions: [],
      };
      return {
        challengeEvent,
        challengeSummary,
        gameSummary,
        gameCredentials,
        gameRecord,
        gameSeats: { challenger: challengerSeat, challenged: challengedSeat },
      };
    } catch (error) {
      memoryChallengeEvents.splice(eventLength);
      throw error;
    }
  };

  const acceptChallengeAndCreateGame = async (
    input: OnlineChallengeAcceptInput
  ): Promise<OnlineChallengeAcceptResult> =>
    options.acceptChallengeAndCreateGame
      ? options.acceptChallengeAndCreateGame(input)
      : createMemoryChallengeAcceptedGame(input);

  const acceptPendingChallengeAndCreateGame = async (
    summary: OnlineChallengeSummary,
    acceptedBy: ResolvedOnlineChallengeCredential
  ): Promise<OnlineChallengeAcceptResult> => {
    const challengerSeat =
      summary.challengerSeat === "random"
        ? randomBytes(1)[0] % 2 === 0
          ? "w"
          : "b"
        : summary.challengerSeat;
    const whiteIdentity = challengerSeat === "w" ? summary.challengerIdentity : summary.challengedIdentity;
    const blackIdentity = challengerSeat === "w" ? summary.challengedIdentity : summary.challengerIdentity;
    let gameId = `game_${randomBytes(9).toString("base64url")}`;
    while (service.getRoom(gameId)) {
      gameId = `game_${randomBytes(9).toString("base64url")}`;
    }
    const acceptedAt = new Date(options.now?.() ?? Date.now()).toISOString();
    const clock = createInitialClockRecord(summary.setup, gameId);
    const gameCreatedEvent = createOnlineGameCreatedEvent(
      {
        type: "game_created",
        gameId,
        setup: summary.setup,
        clock,
        initialVisibility: summary.visibility,
        whiteIdentity,
        blackIdentity,
      },
      { createdAt: acceptedAt }
    );
    return acceptChallengeAndCreateGame({
      challengeId: summary.challengeId,
      acceptedBy,
      acceptedAt,
      gameCreatedEvent,
      whiteIdentity,
      blackIdentity,
    });
  };

  const loadOpenSeekSummaries = async (): Promise<OpenSeekSummary[]> => {
    const summaries = options.loadOpenSeekSummaries
      ? await options.loadOpenSeekSummaries()
      : projectOpenSeekSummaries(memoryOpenSeekEvents);
    return summaries.map((summary, index) => {
      const validation = validateOpenSeekSummary(summary);
      if (!validation.ok) {
        throw new Error(`Invalid open seek summary ${index + 1}: ${validation.error.message}`);
      }
      return validation.value;
    });
  };

  const loadOpenSeekSummary = async (seekId: string): Promise<OpenSeekSummary | null> => {
    return (await loadOpenSeekSummaries()).find((summary) => summary.seekId === seekId) ?? null;
  };

  const listPublicOpenSeekDirectory = async (
    directoryOptions: OpenSeekDirectoryListOptions,
    viewerAccount: OnlineAccount | null = null,
    source: "access-controlled" | "store-paginated" = "access-controlled"
  ): Promise<OpenSeekDirectoryResponse> => {
    const now = new Date(options.now?.() ?? Date.now()).toISOString();
    if (source === "store-paginated" && options.listOpenSeekSummaries) {
      const response = await options.listOpenSeekSummaries(directoryOptions);
      const validation = validateOpenSeekDirectoryResponse(response);
      if (!validation.ok) throw new Error(validation.error.message);
      const visible = await filterOpenSeekSummariesForViewer(validation.value.seeks, viewerAccount);
      return {
        ...validation.value,
        seeks: visible.filter((summary) => canListOpenSeekSummary(summary, now)),
      };
    }

    const visible = await filterOpenSeekSummariesForViewer(await loadOpenSeekSummaries(), viewerAccount);
    return paginateOpenSeekSummaries(visible, directoryOptions, now);
  };

  const listQuickMatchOpenSeekCandidates = async (
    viewerAccount: OnlineAccount | null
  ): Promise<OpenSeekSummary[]> => {
    const candidates: OpenSeekSummary[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    do {
      const directoryOptions: OpenSeekDirectoryListOptions = {
        state: "open",
        limit: ONLINE_SEEK_DIRECTORY_MAX_LIMIT,
        ...(cursor ? { cursor } : {}),
      };
      const directory = await listPublicOpenSeekDirectory(directoryOptions, viewerAccount, "store-paginated");
      candidates.push(...directory.seeks);
      if (!directory.nextCursor) break;
      if (seenCursors.has(directory.nextCursor)) {
        throw new Error("Open seek directory returned a repeated cursor.");
      }
      seenCursors.add(directory.nextCursor);
      cursor = directory.nextCursor;
    } while (cursor);

    return candidates;
  };

  const appendOpenSeekCreated = async (
    event: Extract<OpenSeekEvent, { type: "seek_created" }>,
    credentials: OpenSeekCredentials
  ): Promise<OpenSeekSummary> => {
    if (options.appendOpenSeekCreated) {
      return options.appendOpenSeekCreated(event, credentials);
    }
    const eventLength = memoryOpenSeekEvents.length;
    const previousCredentials = memoryOpenSeekCredentials.get(event.seekId);
    try {
      memoryOpenSeekEvents.push(event);
      memoryOpenSeekCredentials.set(event.seekId, credentials);
      const summary = projectOpenSeekSummaries(memoryOpenSeekEvents).find(
        (candidate) => candidate.seekId === event.seekId
      );
      if (!summary) throw new Error(`Open seek summary was not refreshed for ${event.seekId}.`);
      return summary;
    } catch (error) {
      memoryOpenSeekEvents.splice(eventLength);
      if (previousCredentials) {
        memoryOpenSeekCredentials.set(event.seekId, previousCredentials);
      } else {
        memoryOpenSeekCredentials.delete(event.seekId);
      }
      throw error;
    }
  };

  const createOpenSeekForIdentity = async (
    setup: OnlineGameSetupDTO,
    creatorSeat: OpenSeekSeat,
    creatorIdentity: PublicPlayerIdentity,
    visibility: OpenSeekVisibility,
    expiresInMs: number,
    createdAt: string
  ): Promise<{ seekId: string; summary: OpenSeekSummary; token: string }> => {
    let seekId = defaultOpenSeekIdFactory();
    while (await loadOpenSeekSummary(seekId)) {
      seekId = defaultOpenSeekIdFactory();
    }
    const expiresAt = new Date(Date.parse(createdAt) + expiresInMs).toISOString();
    const creatorToken = defaultOpenSeekTokenFactory();
    const event = createOpenSeekCreatedEvent(
      {
        type: "seek_created",
        seekId,
        creatorIdentity,
        creatorSeat,
        setup,
        visibility,
        expiresAt,
      },
      { createdAt }
    );
    const summary = await appendOpenSeekCreated(event, {
      creatorCredential: hashOnlineToken(creatorToken),
      creatorIdentity,
    });
    return { seekId, summary, token: creatorToken };
  };

  const appendOpenSeekLifecycleEvent = async (
    event: Exclude<OpenSeekEvent, { type: "seek_created" } | { type: "seek_accepted" }>
  ): Promise<OpenSeekSummary> => {
    if (options.appendOpenSeekEvent) {
      return options.appendOpenSeekEvent(event);
    }
    const eventLength = memoryOpenSeekEvents.length;
    try {
      memoryOpenSeekEvents.push(event);
      const summary = projectOpenSeekSummaries(memoryOpenSeekEvents).find(
        (candidate) => candidate.seekId === event.seekId
      );
      if (!summary) throw new Error(`Open seek summary was not refreshed for ${event.seekId}.`);
      return summary;
    } catch (error) {
      memoryOpenSeekEvents.splice(eventLength);
      throw error;
    }
  };

  const resolveOpenSeekCredential = async (
    seekId: string,
    token: string
  ): Promise<ResolvedOpenSeekCredential | null> => {
    if (options.resolveOpenSeekCredential) {
      return options.resolveOpenSeekCredential(seekId, token);
    }
    const credentials = memoryOpenSeekCredentials.get(seekId);
    if (!credentials) return null;
    if (!verifyOnlineToken(token, credentials.creatorCredential)) return null;
    return {
      seekId,
      role: "creator",
      identity: credentials.creatorIdentity as ResolvedOpenSeekCredential["identity"],
    };
  };

  const expireOpenSeekIfNeeded = async (
    summary: OpenSeekSummary,
    expiredAt = new Date(options.now?.() ?? Date.now()).toISOString()
  ): Promise<OpenSeekSummary> => {
    if (!canSystemExpireOpenSeek(summary, expiredAt)) return summary;
    try {
      return await appendOpenSeekLifecycleEvent(
        createOpenSeekExpiredEvent(
          {
            type: "seek_expired",
            seekId: summary.seekId,
            expiredBy: "system",
            expiredAt,
          },
          { createdAt: expiredAt }
        )
      );
    } catch (error) {
      if (openSeekTerminalError(error)) {
        const current = await loadOpenSeekSummary(summary.seekId);
        if (current && current.status !== "open") return current;
      }
      throw error;
    }
  };

  const getAuthorizedOpenSeek = async (
    req: Request
  ): Promise<
    | { ok: true; token: string; credential: ResolvedOpenSeekCredential; summary: OpenSeekSummary }
    | { ok: false; status: number; error: OnlineReject; reason: string }
  > => {
    const seekId = validateOnlineGameId(req.params.seekId, "seek.seekId");
    if (!seekId.ok) {
      return { ok: false, status: 400, error: seekId.error, reason: seekId.error.code };
    }
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return {
        ok: false,
        status: 404,
        error: { code: "not_found", message: "No open seek was found for that id and token." },
        reason: "missing_token",
      };
    }
    const credential = await resolveOpenSeekCredential(seekId.value, token);
    if (!credential) {
      return {
        ok: false,
        status: 404,
        error: { code: "not_found", message: "No open seek was found for that id and token." },
        reason: "bad_token",
      };
    }
    const summary = await loadOpenSeekSummary(seekId.value);
    if (!summary) {
      return {
        ok: false,
        status: 404,
        error: { code: "not_found", message: "No open seek was found for that id and token." },
        reason: "summary_missing",
      };
    }
    return { ok: true, token, credential, summary };
  };

  const seatForOpenSeekIdentity = (
    summary: OpenSeekSummary,
    identity: ResolvedOpenSeekCredential["identity"]
  ): "w" | "b" | null => {
    if (summary.status !== "accepted") return null;
    if (summary.whiteIdentity && isSameOpenSeekIdentity(summary.whiteIdentity, identity)) return "w";
    if (summary.blackIdentity && isSameOpenSeekIdentity(summary.blackIdentity, identity)) return "b";
    return null;
  };

  const gameInviteForOpenSeekCreator = (
    summary: OpenSeekSummary,
    credential: ResolvedOpenSeekCredential,
    token: string
  ) => {
    if (summary.status !== "accepted" || !summary.gameId) return undefined;
    const seat = seatForOpenSeekIdentity(summary, credential.identity);
    if (!seat) return undefined;
    return {
      gameId: summary.gameId,
      seat,
      token,
      url: buildTokenlessOnlineGameUrl(options.publicBaseUrl, summary.gameId, seat),
    };
  };

  const createMemoryOpenSeekAcceptedGame = async (
    input: OpenSeekAcceptInput
  ): Promise<OpenSeekAcceptResult> => {
    const summary = await loadOpenSeekSummary(input.seekId);
    if (!summary) throw new Error(`Open seek ${input.seekId} was not found.`);
    if (summary.status !== "open") throw new Error(`Open seek ${input.seekId} is already terminal.`);
    if (!canIdentityAcceptOpenSeek(summary, input.acceptedBy, input.acceptedAt)) {
      throw new Error(`A creator cannot accept their own open seek ${input.seekId}.`);
    }
    if (JSON.stringify(summary.setup) !== JSON.stringify(input.gameCreatedEvent.setup)) {
      throw new Error(`Accepted online game setup must match open seek ${input.seekId}.`);
    }
    const credentials = memoryOpenSeekCredentials.get(input.seekId);
    if (!credentials) throw new Error(`Missing open seek credentials for ${input.seekId}.`);
    const creatorSeat = isSameOpenSeekIdentity(input.whiteIdentity, summary.creatorIdentity) ? "w" : "b";
    const acceptorSeat = creatorSeat === "w" ? "b" : "w";
    const gameCredentials: OnlineGameCredentials =
      creatorSeat === "w"
        ? {
            whiteCredential: credentials.creatorCredential,
            blackCredential: input.acceptorCredential,
          }
        : {
            whiteCredential: input.acceptorCredential,
            blackCredential: credentials.creatorCredential,
          };
    const seekEvent = createOpenSeekAcceptedEvent(
      {
        type: "seek_accepted",
        seekId: input.seekId,
        acceptedBy: input.acceptedBy,
        acceptedAt: input.acceptedAt,
        gameId: input.gameCreatedEvent.gameId,
        whiteIdentity: input.whiteIdentity,
        blackIdentity: input.blackIdentity,
      },
      { createdAt: input.acceptedAt }
    );
    const gameCreatedEvent = {
      ...input.gameCreatedEvent,
      whiteIdentity: input.whiteIdentity,
      blackIdentity: input.blackIdentity,
    };
    const eventLength = memoryOpenSeekEvents.length;
    try {
      memoryOpenSeekEvents.push(seekEvent);
      const seekSummary = projectOpenSeekSummaries(memoryOpenSeekEvents).find(
        (candidate) => candidate.seekId === input.seekId
      );
      if (!seekSummary) throw new Error(`Open seek summary was not refreshed for ${input.seekId}.`);
      const [gameSummary] = projectOnlineGameSummaries([gameCreatedEvent]);
      if (!gameSummary) throw new Error(`Online game summary was not refreshed for ${gameCreatedEvent.gameId}.`);
      const gameRecord: OnlineGameRoomRecord = {
        gameId: gameCreatedEvent.gameId,
        setup: gameCreatedEvent.setup,
        whiteCredential: gameCredentials.whiteCredential,
        blackCredential: gameCredentials.blackCredential,
        clock: gameCreatedEvent.clock,
        acceptedActions: [],
      };
      return {
        seekEvent,
        seekSummary,
        gameSummary,
        gameCredentials,
        gameRecord,
        gameSeats: { creator: creatorSeat, acceptor: acceptorSeat },
      };
    } catch (error) {
      memoryOpenSeekEvents.splice(eventLength);
      throw error;
    }
  };

  const acceptOpenSeekAndCreateGame = async (
    input: OpenSeekAcceptInput
  ): Promise<OpenSeekAcceptResult> =>
    options.acceptOpenSeekAndCreateGame
      ? options.acceptOpenSeekAndCreateGame(input)
      : createMemoryOpenSeekAcceptedGame(input);

  const isActiveSeekForSession = (
    summary: OpenSeekSummary,
    identity: PublicPlayerIdentity,
    now: string
  ): boolean => {
    if (summary.status !== "open" && summary.status !== "accepted") return false;
    if (summary.status === "open" && !canListOpenSeekSummary(summary, now)) return false;
    return (
      isSameOpenSeekIdentity(summary.creatorIdentity, identity) ||
      (summary.acceptedBy ? isSameOpenSeekIdentity(summary.acceptedBy, identity) : false) ||
      (summary.whiteIdentity ? isSameOpenSeekIdentity(summary.whiteIdentity, identity) : false) ||
      (summary.blackIdentity ? isSameOpenSeekIdentity(summary.blackIdentity, identity) : false)
    );
  };

  const loadActiveSeekForSession = async (
    identity: PublicPlayerIdentity,
    now: string
  ): Promise<OpenSeekSummary | null> => {
    return (await loadOpenSeekSummaries()).find((summary) =>
      isActiveSeekForSession(summary, identity, now)
    ) ?? null;
  };

  const acceptOpenSeekSummary = async (
    summary: OpenSeekSummary,
    acceptorIdentity: PublicPlayerIdentity,
    acceptedAt: string
  ) => {
    if (
      summary.status !== "open" ||
      !canIdentityAcceptOpenSeek(summary, acceptorIdentity, acceptedAt)
    ) {
      throw new Error(`This open seek ${summary.seekId} is no longer open.`);
    }
    const creatorSeat =
      summary.creatorSeat === "random"
        ? randomBytes(1)[0] % 2 === 0
          ? "w"
          : "b"
        : summary.creatorSeat;
    const whiteIdentity = creatorSeat === "w" ? summary.creatorIdentity : acceptorIdentity;
    const blackIdentity = creatorSeat === "w" ? acceptorIdentity : summary.creatorIdentity;
    let gameId = `game_${randomBytes(9).toString("base64url")}`;
    while (service.getRoom(gameId)) {
      gameId = `game_${randomBytes(9).toString("base64url")}`;
    }
    const acceptorToken = defaultOpenSeekTokenFactory();
    const clock = createInitialClockRecord(summary.setup, gameId);
    const gameCreatedEvent = createOnlineGameCreatedEvent(
      {
        type: "game_created",
        gameId,
        setup: summary.setup,
        clock,
        initialVisibility: "public",
        whiteIdentity,
        blackIdentity,
      },
      { createdAt: acceptedAt }
    );
    const result = await acceptOpenSeekAndCreateGame({
      seekId: summary.seekId,
      acceptedBy: acceptorIdentity,
      acceptedAt,
      gameCreatedEvent,
      whiteIdentity,
      blackIdentity,
      acceptorCredential: hashOnlineToken(acceptorToken),
    });
    service.replaceRoom(result.gameRecord);
    const acceptedGameId = result.seekSummary.gameId;
    if (!acceptedGameId) {
      throw new Error(`Accepted open seek ${summary.seekId} did not include a game id.`);
    }
    return {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "acceptor" as const,
      summary: result.seekSummary,
      gameInvite: {
        gameId: acceptedGameId,
        seat: result.gameSeats.acceptor,
        token: acceptorToken,
        url: buildTokenlessOnlineGameUrl(
          options.publicBaseUrl,
          acceptedGameId,
          result.gameSeats.acceptor
        ),
      },
    };
  };

  const persistActionAccepted = async (
    gameId: string,
    playerColor: Extract<OnlineGameEvent, { type: "action_accepted" }>["playerColor"],
    clientActionId: string,
    version: number,
    action: Extract<OnlineGameEvent, { type: "action_accepted" }>["action"],
    playedAt: number,
    clock?: Extract<OnlineGameEvent, { type: "action_accepted" }>["clock"]
  ) => {
    await options.onGameEvent?.(
      createOnlineActionAcceptedEvent({
        type: "action_accepted",
        gameId,
        playerColor,
        clientActionId,
        version,
        action,
        playedAt,
        clock,
      })
    );
  };

  const persistTimeoutAdjudicated = async (
    gameId: string,
    timeout: AcceptedOnlineTimeoutRecord
  ) => {
    await options.onGameEvent?.(
      createOnlineTimeoutAdjudicatedEvent({
        type: "timeout_adjudicated",
        gameId,
        playerColor: timeout.playerColor,
        version: timeout.version,
        adjudicatedAt: timeout.adjudicatedAt,
        result: timeout.result,
        clock: timeout.clock,
      })
    );
  };

  const adjudicateTimeoutForRoom = async (
    gameId: string,
    room: NonNullable<ReturnType<OnlineGameService["getRoom"]>>
  ):
    Promise<
      | { ok: true; timeout: AcceptedOnlineTimeoutRecord | null }
      | { ok: false; error: OnlineReject; snapshot?: ReturnType<typeof room.getSnapshot> }
    > => {
    if (options.adjudicateGameTimeout) {
      try {
        const transition = await options.adjudicateGameTimeout({
          gameId,
          now: options.now,
        });
        if (!transition.ok) {
          return {
            ok: false,
            error: transition.error,
            snapshot: transition.snapshot,
          };
        }
        if (transition.room) {
          service.replaceRoom(transition.room);
        }
        if (!transition.event) {
          return { ok: true, timeout: null };
        }
        log({
          event: "online.timeout",
          gameId,
          role: "player",
          status: "expired",
          reason: transition.event.playerColor,
        });
        return {
          ok: true,
          timeout: {
            playerColor: transition.event.playerColor,
            version: transition.event.version,
            adjudicatedAt: transition.event.adjudicatedAt,
            result: transition.event.result,
            clock: transition.event.clock,
          },
        };
      } catch (error) {
        log({
          event: "online.persistence",
          gameId,
          role: "player",
          status: "failed",
          reason: "timeout_adjudicated",
        });
        log({
          event: "online.timeout",
          gameId,
          role: "player",
          status: "rejected",
          reason: "persistence_failed",
        });
        console.error("Failed to persist online game timeout", error);
        return {
          ok: false,
          error: {
            code: "persistence_failed",
            message: "The timeout result could not be saved.",
          },
          snapshot: room.getSnapshot(),
        };
      }
    }

    const beforeTimeout = room.toRecord();
    const timeout = room.adjudicateTimeout();
    if (!timeout) {
      return { ok: true, timeout: null };
    }

    try {
      await persistTimeoutAdjudicated(gameId, timeout);
      log({
        event: "online.timeout",
        gameId,
        role: "player",
        status: "expired",
        reason: timeout.playerColor,
      });
      return { ok: true, timeout };
    } catch (error) {
      service.replaceRoom(beforeTimeout);
      const restoredSnapshot = service.getRoom(gameId)?.getSnapshot() ?? room.getSnapshot();
      log({
        event: "online.persistence",
        gameId,
        role: "player",
        status: "failed",
        reason: "timeout_adjudicated",
      });
      log({
        event: "online.timeout",
        gameId,
        role: "player",
        status: "rejected",
        reason: "persistence_failed",
      });
      console.error("Failed to persist online game timeout", error);
      return {
        ok: false,
        error: {
          code: "persistence_failed",
          message: "The timeout result could not be saved.",
        },
        snapshot: restoredSnapshot,
      };
    }
  };

  app.use((_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  app.use(express.json({ limit: "256kb" }));

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof SyntaxError) {
      res.status(400).json({
        error: {
          code: "bad_json",
          message: "Request body was not valid JSON.",
        },
      });
      return;
    }
    next(error);
  });

  app.get("/api/health", async (_req, res) => {
    let storeOk = true;
    let storeError: string | undefined;
    try {
      storeOk = options.health?.checkStoreReady
        ? await checkStoreReadyWithTimeout(
            options.health.checkStoreReady,
            options.health.readinessTimeoutMs ?? DEFAULT_HEALTH_READINESS_TIMEOUT_MS
          )
        : true;
    } catch (error) {
      storeOk = false;
      storeError =
        error instanceof StoreReadinessTimeoutError
          ? "Store readiness check timed out."
          : "Store readiness check failed.";
    }

    res.status(storeOk ? 200 : 503).json({
      ok: storeOk,
      build: {
        buildId: options.health?.buildId ?? "development",
        commit: options.health?.commit ?? "unknown",
      },
      online: {
        eventSchemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
        rulesetVersion: ONLINE_RULESET_VERSION,
        store: {
          ok: storeOk,
          backend: options.health?.storeBackend ?? "unknown",
          path: options.health?.storePath ?? null,
          error: storeError,
        },
      },
    });
  });

  app.use("/api/online", (_req, res, next) => {
    setOnlineNoStoreHeaders(res);
    next();
  });

  app.get("/api/online/account/oauth/providers", (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const providers: OnlineAccountOAuthProviderSummary[] = [
      {
        provider: "google",
        enabled: Boolean(googleOAuthConfig),
        ...(googleOAuthConfig ? { startUrl: "/api/online/account/oauth/google/start" } : {}),
      },
    ];
    res.json({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      providers,
    });
  });

  app.get("/api/online/account/oauth/google/start", (req, res) => {
    if (!accountAuthLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many sign-in attempts were sent too quickly." },
      });
      return;
    }
    if (!googleOAuthConfig) {
      res.status(404).json({
        error: { code: "not_found", message: "Google sign-in is not configured." },
      });
      return;
    }
    const requestedReturnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";
    const returnTo = isSafeOAuthReturnPath(requestedReturnTo) ? requestedReturnTo : "/";
    const nonce = randomBytes(18).toString("base64url");
    const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
    const state = encodeGoogleOAuthState(
      {
        nonce,
        returnTo,
        exp: nowSeconds + GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
      },
      googleOAuthConfig.stateSecret
    );
    setGoogleOAuthStateCookie(res, nonce, googleOAuthCookieSecure);
    res.redirect(302, buildGoogleOAuthAuthorizationUrl(googleOAuthConfig, state, nonce));
  });

  app.get("/api/online/account/oauth/google/callback", async (req, res) => {
    clearGoogleOAuthStateCookie(res, googleOAuthCookieSecure);
    if (!accountAuthLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many sign-in attempts were sent too quickly." },
      });
      return;
    }
    if (!googleOAuthConfig) {
      res.status(404).json({
        error: { code: "not_found", message: "Google sign-in is not configured." },
      });
      return;
    }
    if (typeof req.query.error === "string") {
      res.status(400).json({
        error: { code: "bad_request", message: "Google sign-in was cancelled or rejected." },
      });
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || code.length > 2048 || !state) {
      res.status(400).json({
        error: { code: "bad_request", message: "Google sign-in callback is invalid." },
      });
      return;
    }
    const decodedState = decodeGoogleOAuthState(
      state,
      googleOAuthConfig.stateSecret,
      options.now?.() ?? Date.now()
    );
    if (!decodedState.ok) {
      res.status(401).json({
        error: { code: "unauthorized", message: "Google sign-in state is invalid." },
      });
      return;
    }
    const stateCookie = parseCookieHeader(req.headers.cookie).get(GOOGLE_OAUTH_STATE_COOKIE);
    if (stateCookie !== decodedState.payload.nonce) {
      res.status(401).json({
        error: { code: "unauthorized", message: "Google sign-in state is invalid." },
      });
      return;
    }

    const createdAt = new Date(options.now?.() ?? Date.now()).toISOString();
    const token = defaultAccountSessionTokenFactory();
    try {
      const idToken = await exchangeGoogleOAuthCode(googleOAuthConfig, code);
      const claims = await verifyGoogleIdToken(
        googleOAuthConfig,
        idToken,
        decodedState.payload.nonce,
        options.now?.() ?? Date.now()
      );
      const resolved = await accountStore.createSessionWithExternalLogin({
        provider: "google",
        providerSubject: claims.sub,
        accountId: defaultAccountIdFactory(),
        sessionId: defaultAccountSessionIdFactory(),
        displayNameCandidates: googleDisplayNameCandidates(claims),
        tokenHash: hashOnlineToken(token),
        createdAt,
      });
      res
        .status(200)
        .type("html")
        .send(renderGoogleOAuthSessionHtml({
          account: resolved.account,
          sessionId: resolved.sessionId,
          token,
          returnTo: decodedState.payload.returnTo,
        }));
      log({ event: "online.account.oauth.google", status: "accepted" });
    } catch (error) {
      if (error instanceof DuplicateOnlineAccountSessionCredentialError) {
        res.status(409).json({
          error: {
            code: "bad_request",
            message: "Account credential collision. Try again.",
          },
        });
        return;
      }
      console.error("Failed to complete Google sign-in", error);
      res.status(503).json({
        error: { code: "persistence_failed", message: "Google sign-in could not be completed." },
      });
    }
  });

  app.post("/api/online/accounts", async (req, res) => {
    if (!accountCreateLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many accounts have been created from this client. Try again shortly.",
        },
      });
      return;
    }

    const displayName = normalizeOnlineAccountDisplayName(req.body?.displayName);
    if (!displayName.ok) {
      res.status(400).json({ error: displayName.error });
      return;
    }
    const password = normalizeOnlineAccountPassword(req.body?.password);
    if (!password.ok) {
      res.status(400).json({ error: password.error });
      return;
    }

    const createdAt = new Date(options.now?.() ?? Date.now()).toISOString();
    const token = defaultAccountSessionTokenFactory();
    try {
      const resolved = await accountStore.createAccount({
        accountId: defaultAccountIdFactory(),
        sessionId: defaultAccountSessionIdFactory(),
        displayName: displayName.value,
        passwordHash: await hashOnlineAccountPassword(password.value),
        tokenHash: hashOnlineToken(token),
        createdAt,
      });
      res.status(201).json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        account: resolved.account,
        session: {
          sessionId: resolved.sessionId,
          token,
        },
      });
      log({ event: "online.account.create", status: "accepted" });
    } catch (error) {
      if (
        error instanceof DuplicateOnlineAccountDisplayNameError ||
        error instanceof DuplicateOnlineAccountIdError ||
        error instanceof DuplicateOnlineAccountSessionCredentialError
      ) {
        res.status(409).json({
          error: {
            code: "bad_request",
            message:
              error instanceof DuplicateOnlineAccountDisplayNameError
                ? "That display name is already taken."
                : "Account credential collision. Try again.",
          },
        });
        return;
      }
      console.error("Failed to create account", error);
      res.status(503).json({
        error: { code: "persistence_failed", message: "The account could not be created." },
      });
    }
  });

  app.post("/api/online/account/session", async (req, res) => {
    if (!accountAuthLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many sign-in attempts were sent too quickly." },
      });
      return;
    }

    const displayName = normalizeOnlineAccountDisplayName(req.body?.displayName);
    if (!displayName.ok) {
      res.status(400).json({ error: displayName.error });
      return;
    }
    const password = normalizeOnlineAccountPassword(req.body?.password);
    if (!password.ok) {
      res.status(400).json({ error: password.error });
      return;
    }

    const createdAt = new Date(options.now?.() ?? Date.now()).toISOString();
    const token = defaultAccountSessionTokenFactory();
    try {
      const resolved = await accountStore.createSessionWithPassword({
        sessionId: defaultAccountSessionIdFactory(),
        displayName: displayName.value,
        password: password.value,
        tokenHash: hashOnlineToken(token),
        createdAt,
      });
      if (!resolved) {
        res.status(401).json({
          error: {
            code: "unauthorized",
            message: "Display name or password is incorrect.",
          },
        });
        log({ event: "online.account.session.create", status: "rejected", reason: "bad_credentials" });
        return;
      }
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        account: resolved.account,
        session: {
          sessionId: resolved.sessionId,
          token,
        },
      });
      log({ event: "online.account.session.create", status: "accepted" });
    } catch (error) {
      if (error instanceof DuplicateOnlineAccountSessionCredentialError) {
        res.status(409).json({
          error: {
            code: "bad_request",
            message: "Account credential collision. Try again.",
          },
        });
        return;
      }
      console.error("Failed to create account session", error);
      res.status(503).json({
        error: { code: "persistence_failed", message: "The account session could not be created." },
      });
    }
  });

  app.get("/api/online/account/me", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    res.json({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      account: auth.account,
    });
  });

  app.get("/api/online/ratings/leaderboard", async (req, res) => {
    if (!publicDirectoryLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many public rating requests were sent too quickly." },
      });
      return;
    }
    const parsed = parseRatingLeaderboardOptions(req.originalUrl);
    if (!parsed.ok) {
      res.status(400).json({
        error: { code: "bad_request", message: parsed.message },
      });
      return;
    }
    try {
      let entries;
      if (parsed.scope === "following") {
        const auth = await resolveAccountBearer(req);
        if (!auth.ok) {
          log({ event: "online.rating.leaderboard", status: "rejected", reason: auth.reason });
          res.status(auth.status).json({ error: auth.error });
          return;
        }
        entries = await accountStore.listFollowingRatingLeaderboard(auth.account.accountId, parsed.limit);
      } else {
        entries = await accountStore.listRatingLeaderboard(parsed.limit);
      }
      log({ event: "online.rating.leaderboard", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        schemaVersion: ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION,
        scope: parsed.scope,
        entries,
      });
    } catch (error) {
      console.error("Failed to load rating leaderboard", error);
      log({ event: "online.rating.leaderboard", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Rating leaderboard could not be loaded." },
      });
    }
  });

  app.get("/api/online/profiles/:displayName", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.profile.lookup", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const displayName = parseProfileDisplayNameParam(req.params.displayName);
    if (!displayName) {
      res.status(400).json({
        error: { code: "bad_request", message: "Profile display name is invalid." },
      });
      return;
    }
    try {
      const profile = await accountStore.getProfileForDisplayName(auth.account.accountId, displayName, auth.usedAt);
      if (!profile) {
        log({ event: "online.account.profile.lookup", status: "rejected", reason: "not_found" });
        res.status(404).json({
          error: { code: "not_found", message: "No online account was found for that profile." },
        });
        return;
      }
      log({ event: "online.account.profile.lookup", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile,
      });
    } catch (error) {
      console.error("Failed to load account profile", error);
      log({ event: "online.account.profile.lookup", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Online profile could not be loaded." },
      });
    }
  });

  app.get("/api/online/account/follows", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.follows.list", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    try {
      const following = await accountStore.listFollowingProfiles(auth.account.accountId, auth.usedAt);
      log({ event: "online.account.follows.list", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        following,
      });
    } catch (error) {
      console.error("Failed to list followed accounts", error);
      log({ event: "online.account.follows.list", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Followed accounts could not be loaded." },
      });
    }
  });

  app.put("/api/online/account/follows/:displayName", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.follow", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const displayName = parseProfileDisplayNameParam(req.params.displayName);
    if (!displayName) {
      res.status(400).json({
        error: { code: "bad_request", message: "Follow target display name is invalid." },
      });
      return;
    }
    try {
      const createdAt = auth.usedAt;
      const result = await accountStore.followAccount(auth.account.accountId, displayName, createdAt);
      if (result.status !== "ok" || !result.profile) {
        const failure = socialActionError(result, "follow");
        log({ event: "online.account.follow", status: "rejected", reason: result.status });
        res.status(failure.status).json({ error: failure.error });
        return;
      }
      log({ event: "online.account.follow", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: result.profile,
      });
    } catch (error) {
      console.error("Failed to follow account", error);
      log({ event: "online.account.follow", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account could not be followed." },
      });
    }
  });

  app.delete("/api/online/account/follows/:displayName", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.unfollow", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const displayName = parseProfileDisplayNameParam(req.params.displayName);
    if (!displayName) {
      res.status(400).json({
        error: { code: "bad_request", message: "Follow target display name is invalid." },
      });
      return;
    }
    try {
      const result = await accountStore.unfollowAccount(auth.account.accountId, displayName, auth.usedAt);
      if (result.status !== "ok" || !result.profile) {
        const failure = socialActionError(result, "unfollow");
        log({ event: "online.account.unfollow", status: "rejected", reason: result.status });
        res.status(failure.status).json({ error: failure.error });
        return;
      }
      log({ event: "online.account.unfollow", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: result.profile,
      });
    } catch (error) {
      console.error("Failed to unfollow account", error);
      log({ event: "online.account.unfollow", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account could not be unfollowed." },
      });
    }
  });

  app.put("/api/online/account/blocks/:displayName", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.block", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const displayName = parseProfileDisplayNameParam(req.params.displayName);
    if (!displayName) {
      res.status(400).json({
        error: { code: "bad_request", message: "Block target display name is invalid." },
      });
      return;
    }
    try {
      const createdAt = auth.usedAt;
      const result = await accountStore.blockAccount(auth.account.accountId, displayName, createdAt);
      if (result.status !== "ok" || !result.profile) {
        const failure = socialActionError(result, "block");
        log({ event: "online.account.block", status: "rejected", reason: result.status });
        res.status(failure.status).json({ error: failure.error });
        return;
      }
      try {
        await terminatePendingAccountChallengesForBlock(auth.identity, result.profile.displayName, createdAt);
      } catch (error) {
        console.error("Failed to terminate blocked account challenges", error);
        log({ event: "online.account.block.challenge_cleanup", status: "failed", reason: "persistence_failed" });
      }
      log({ event: "online.account.block", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: result.profile,
      });
    } catch (error) {
      console.error("Failed to block account", error);
      log({ event: "online.account.block", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account could not be blocked." },
      });
    }
  });

  app.delete("/api/online/account/blocks/:displayName", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.unblock", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const displayName = parseProfileDisplayNameParam(req.params.displayName);
    if (!displayName) {
      res.status(400).json({
        error: { code: "bad_request", message: "Block target display name is invalid." },
      });
      return;
    }
    try {
      const result = await accountStore.unblockAccount(auth.account.accountId, displayName, auth.usedAt);
      if (result.status !== "ok" || !result.profile) {
        const failure = socialActionError(result, "unblock");
        log({ event: "online.account.unblock", status: "rejected", reason: result.status });
        res.status(failure.status).json({ error: failure.error });
        return;
      }
      log({ event: "online.account.unblock", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: result.profile,
      });
    } catch (error) {
      console.error("Failed to unblock account", error);
      log({ event: "online.account.unblock", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account could not be unblocked." },
      });
    }
  });

  app.post("/api/online/account/reports/:displayName", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.report", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const displayName = parseProfileDisplayNameParam(req.params.displayName);
    if (!displayName) {
      res.status(400).json({
        error: { code: "bad_request", message: "Report target display name is invalid." },
      });
      return;
    }
    const reportInput = parseOnlineAccountReportInput(req.body);
    if (!reportInput.ok) {
      res.status(400).json({ error: reportInput.error });
      return;
    }
    if (containsDurableSecret(req.body)) {
      res.status(400).json({
        error: { code: "bad_request", message: "Report details must not contain account or invite secrets." },
      });
      return;
    }
    try {
      const result = await accountStore.submitAccountReport({
        reportId: defaultAccountReportIdFactory(),
        reporterAccountId: auth.account.accountId,
        targetDisplayName: displayName,
        reason: reportInput.value.reason,
        details: reportInput.value.details,
        createdAt: auth.usedAt,
      });
      if (result.status !== "ok") {
        const failure = accountReportError(result);
        log({ event: "online.account.report", status: "rejected", reason: result.status });
        res.status(failure.status).json({ error: failure.error });
        return;
      }
      log({ event: "online.account.report", status: "accepted" });
      res.status(201).json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        report: result.report,
      });
    } catch (error) {
      console.error("Failed to submit account report", error);
      log({ event: "online.account.report", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account report could not be submitted." },
      });
    }
  });

  app.get("/api/online/account/privacy", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.privacy.get", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    try {
      const privacy = await accountStore.getPrivacySettings(auth.account.accountId);
      log({ event: "online.account.privacy.get", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        privacy,
      });
    } catch (error) {
      console.error("Failed to load account privacy settings", error);
      log({ event: "online.account.privacy.get", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account privacy settings could not be loaded." },
      });
    }
  });

  app.patch("/api/online/account/privacy", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.privacy.update", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const patch = parseOnlineAccountPrivacyPatch(req.body);
    if (!patch.ok) {
      res.status(400).json({ error: patch.error });
      return;
    }
    try {
      const updatedAt = auth.usedAt;
      const privacy = await accountStore.updatePrivacySettings(auth.account.accountId, patch.value, updatedAt);
      if (!privacy) {
        log({ event: "online.account.privacy.update", status: "rejected", reason: "not_found" });
        res.status(409).json({
          error: { code: "bad_request", message: "Account privacy settings could not be updated." },
        });
        return;
      }
      log({ event: "online.account.privacy.update", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        privacy,
      });
    } catch (error) {
      console.error("Failed to update account privacy settings", error);
      log({ event: "online.account.privacy.update", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account privacy settings could not be updated." },
      });
    }
  });

  app.get("/api/online/account/challenges", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.challenges.list", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const parsed = parseAccountChallengeDirectoryOptions(req.originalUrl);
    if (!parsed.ok) {
      res.status(400).json({ error: { code: "bad_request", message: parsed.message } });
      return;
    }
    try {
      const directory = await listAccountChallengeDirectory(auth.account, parsed.state);
      log({ event: "online.account.challenges.list", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...directory,
      });
    } catch (error) {
      console.error("Failed to list account challenges", error);
      log({ event: "online.account.challenges.list", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account challenges could not be loaded." },
      });
    }
  });

  app.post("/api/online/account/challenges/:challengeId/accept", async (req, res) => {
    if (!challengeActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many online challenge requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.challenge.accept", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    try {
      const accountChallenge = await getAuthorizedAccountChallenge(req.params.challengeId, auth.account, auth.identity);
      if (!accountChallenge.ok) {
        log({ event: "online.account.challenge.accept", status: "rejected", reason: accountChallenge.reason });
        res.status(accountChallenge.status).json({ error: accountChallenge.error });
        return;
      }
      const summary = await expireChallengeIfNeeded(accountChallenge.summary);
      if (summary.status !== "pending") {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      if (accountChallenge.credential.role !== "challenged") {
        res.status(404).json({ error: challengeNotFoundError() });
        return;
      }
      if (!canIdentityAcceptChallenge(summary, auth.identity, new Date(options.now?.() ?? Date.now()).toISOString())) {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }

      const result = await acceptPendingChallengeAndCreateGame(summary, accountChallenge.credential);
      service.replaceRoom(result.gameRecord);
      const gameId = result.challengeSummary.gameId;
      if (!gameId) {
        throw new Error(`Accepted account challenge ${summary.challengeId} did not create a game.`);
      }
      const gameInvite = await createFreshGameSeatInvite(gameId, result.gameSeats.challenged);
      log({ event: "online.account.challenge.accept", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        role: accountChallenge.credential.role,
        summary: result.challengeSummary,
        gameInvite,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const terminal = /terminal|pending|expiry|expired/i.test(message);
      console.error("Failed to accept account challenge", error);
      log({
        event: "online.account.challenge.accept",
        status: terminal ? "rejected" : "failed",
        reason: terminal ? "game_over" : "persistence_failed",
      });
      res.status(terminal ? 409 : 503).json({
        error: terminal
          ? { code: "game_over", message: "This challenge is no longer pending." }
          : { code: "persistence_failed", message: "The online challenge could not be accepted." },
      });
    }
  });

  app.post("/api/online/account/challenges/:challengeId/decline", async (req, res) => {
    if (!challengeActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many online challenge requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.challenge.decline", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    try {
      const accountChallenge = await getAuthorizedAccountChallenge(req.params.challengeId, auth.account, auth.identity);
      if (!accountChallenge.ok) {
        log({ event: "online.account.challenge.decline", status: "rejected", reason: accountChallenge.reason });
        res.status(accountChallenge.status).json({ error: accountChallenge.error });
        return;
      }
      const declinedAt = new Date(options.now?.() ?? Date.now()).toISOString();
      const summary = await expireChallengeIfNeeded(accountChallenge.summary, declinedAt);
      if (summary.status !== "pending") {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      if (accountChallenge.credential.role !== "challenged") {
        res.status(404).json({ error: challengeNotFoundError() });
        return;
      }
      if (!canIdentityDeclineChallenge(summary, auth.identity, declinedAt)) {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      const declinedSummary = await appendChallengeLifecycleEvent(
        createChallengeDeclinedEvent(
          {
            type: "challenge_declined",
            challengeId: summary.challengeId,
            declinedBy: auth.identity,
            declinedAt,
          },
          { createdAt: declinedAt }
        )
      );
      log({ event: "online.account.challenge.decline", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        role: accountChallenge.credential.role,
        summary: declinedSummary,
      });
    } catch (error) {
      console.error("Failed to decline account challenge", error);
      res.status(challengeTerminalError(error) ? 409 : 503).json({
        error: challengeTerminalError(error)
          ? { code: "game_over", message: "This challenge is no longer pending." }
          : { code: "persistence_failed", message: "The online challenge could not be declined." },
      });
    }
  });

  app.post("/api/online/account/challenges/:challengeId/cancel", async (req, res) => {
    if (!challengeActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many online challenge requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.challenge.cancel", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    try {
      const accountChallenge = await getAuthorizedAccountChallenge(req.params.challengeId, auth.account, auth.identity);
      if (!accountChallenge.ok) {
        log({ event: "online.account.challenge.cancel", status: "rejected", reason: accountChallenge.reason });
        res.status(accountChallenge.status).json({ error: accountChallenge.error });
        return;
      }
      const cancelledAt = new Date(options.now?.() ?? Date.now()).toISOString();
      const summary = await expireChallengeIfNeeded(accountChallenge.summary, cancelledAt);
      if (summary.status !== "pending") {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      if (accountChallenge.credential.role !== "challenger") {
        res.status(404).json({ error: challengeNotFoundError() });
        return;
      }
      if (!canIdentityCancelChallenge(summary, auth.identity, cancelledAt)) {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      const cancelledSummary = await appendChallengeLifecycleEvent(
        createChallengeCancelledEvent(
          {
            type: "challenge_cancelled",
            challengeId: summary.challengeId,
            cancelledBy: auth.identity,
            cancelledAt,
          },
          { createdAt: cancelledAt }
        )
      );
      log({ event: "online.account.challenge.cancel", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        role: accountChallenge.credential.role,
        summary: cancelledSummary,
      });
    } catch (error) {
      console.error("Failed to cancel account challenge", error);
      res.status(challengeTerminalError(error) ? 409 : 503).json({
        error: challengeTerminalError(error)
          ? { code: "game_over", message: "This challenge is no longer pending." }
          : { code: "persistence_failed", message: "The online challenge could not be cancelled." },
      });
    }
  });

  app.get("/api/online/account/sessions", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.sessions.list", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const sessions = await accountStore.listSessionsForAccount(auth.account.accountId);
      log({ event: "online.account.sessions.list", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        sessions: sessions.map((session) => ({
          sessionId: session.sessionId,
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
          current: session.sessionId === auth.sessionId,
        })),
      });
    } catch (error) {
      console.error("Failed to list account sessions", error);
      log({ event: "online.account.sessions.list", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account sessions could not be loaded." },
      });
    }
  });

  app.delete("/api/online/account/session", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }

    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.session.revoke", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      log({ event: "online.account.session.revoke", status: "rejected", reason: "missing_account_token" });
      res.status(401).json({
        error: { code: "unauthorized", message: "Account session is required." },
      });
      return;
    }

    try {
      const revoked = await accountStore.revokeSessionToken(token);
      log({
        event: "online.account.session.revoke",
        status: revoked ? "accepted" : "rejected",
        reason: revoked ? undefined : "already_revoked",
      });
      if (!revoked) {
        res.status(409).json({
          error: { code: "session_not_revoked", message: "Account session could not be revoked." },
        });
        return;
      }
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        revoked,
      });
    } catch (error) {
      console.error("Failed to revoke account session", error);
      log({ event: "online.account.session.revoke", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account session could not be revoked." },
      });
    }
  });

  app.delete("/api/online/account/sessions", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }

    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.sessions.revoke", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const revokedSessions = await accountStore.revokeSessionsForAccount(auth.account.accountId);
      log({
        event: "online.account.sessions.revoke",
        status: revokedSessions > 0 ? "accepted" : "rejected",
        reason: revokedSessions > 0 ? undefined : "already_revoked",
      });
      if (revokedSessions <= 0) {
        res.status(409).json({
          error: { code: "sessions_not_revoked", message: "Account sessions could not be revoked." },
        });
        return;
      }
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        revokedSessions,
      });
    } catch (error) {
      console.error("Failed to revoke account sessions", error);
      log({ event: "online.account.sessions.revoke", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account sessions could not be revoked." },
      });
    }
  });

  app.delete("/api/online/account", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }

    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.delete", status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const deleted = await accountStore.deleteAccount(auth.account.accountId);
      log({
        event: "online.account.delete",
        status: deleted ? "accepted" : "rejected",
        reason: deleted ? undefined : "already_deleted",
      });
      if (!deleted) {
        res.status(409).json({
          error: { code: "account_not_deleted", message: "Account could not be deleted." },
        });
        return;
      }
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        deleted,
      });
    } catch (error) {
      console.error("Failed to delete account", error);
      log({ event: "online.account.delete", status: "failed", reason: "persistence_failed" });
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account could not be deleted." },
      });
    }
  });

  app.get("/api/online/account/games", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const parsed = parsePersonalDirectoryOptions(req.originalUrl, auth.account.identity);
    if (!parsed.ok) {
      res.status(400).json({
        error: { code: "bad_request", message: parsed.message },
      });
      return;
    }
    try {
      res.json(await listPersonalGameDirectory(parsed.options));
    } catch (error) {
      console.error("Failed to load account game history", error);
      res.status(503).json({
        error: { code: "persistence_failed", message: "Account game history could not be loaded." },
      });
    }
  });

  app.get("/api/online/account/games/head-to-head/:displayName", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }
    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const displayName = parseProfileDisplayNameParam(req.params.displayName);
    if (!displayName) {
      res.status(400).json({
        error: { code: "bad_request", message: "Profile display name is invalid." },
      });
      return;
    }
    const parsed = parseAccountHeadToHeadDirectoryOptions(
      req.originalUrl,
      auth.account.identity,
      normalizeOnlineAccountDisplayNameKey(displayName)
    );
    if (!parsed.ok) {
      res.status(400).json({
        error: { code: "bad_request", message: parsed.message },
      });
      return;
    }
    try {
      res.json(await listPersonalGameDirectory(parsed.options));
    } catch (error) {
      console.error("Failed to load account head-to-head history", error);
      res.status(503).json({
        error: { code: "persistence_failed", message: "Head-to-head history could not be loaded." },
      });
    }
  });

  app.get("/api/online/account/games/:gameId/snapshot", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }

    const gameId = validateOnlineGameId(req.params.gameId, "account.snapshot.gameId");
    if (!gameId.ok) {
      res.status(400).json({ error: gameId.error });
      return;
    }

    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.snapshot", gameId: gameId.value, status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    await enqueueGameAction(gameId.value, async () => {
      const lookup = await loadValidatedSummaryForGame(gameId.value);
      if (!lookup.ok) {
        log({ event: "online.account.snapshot", gameId: gameId.value, status: "failed", reason: lookup.reason });
        res.status(503).json({
          error: { code: "persistence_failed", message: "Online game summary could not be loaded." },
        });
        return;
      }
      if (!lookup.summary) {
        log({ event: "online.account.snapshot", gameId: gameId.value, status: "rejected", reason: "not_found" });
        res.status(404).json({
          error: { code: "not_found", message: "No account game was found." },
        });
        return;
      }

      const seat = seatForGameIdentity(lookup.summary, auth.account.identity);
      if (!seat) {
        log({ event: "online.account.snapshot", gameId: gameId.value, status: "rejected", reason: "not_participant" });
        res.status(404).json({
          error: { code: "not_found", message: "No account game was found." },
        });
        return;
      }

      const room = service.getRoom(gameId.value);
      if (!room) {
        log({ event: "online.account.snapshot", gameId: gameId.value, status: "rejected", reason: "not_found" });
        res.status(404).json({
          error: { code: "not_found", message: "No account game was found." },
        });
        return;
      }

      const timeout = await adjudicateTimeoutForRoom(gameId.value, room);
      if (!timeout.ok) {
        log({ event: "online.account.snapshot", gameId: gameId.value, status: "rejected", reason: timeout.error.code });
        res
          .status(httpStatusForOnlineError(timeout.error))
          .json(responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot));
        return;
      }
      if (timeout.timeout) {
        broadcastSnapshot(gameId.value);
      }

      log({ event: "online.account.snapshot", gameId: gameId.value, role: "player", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        role: "account",
        snapshot: (service.getRoom(gameId.value) ?? room).getSnapshot(),
      });
    });
  });

  app.post("/api/online/account/games/:gameId/rejoin", async (req, res) => {
    if (!accountReadLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: { code: "rate_limited", message: "Too many account requests were sent too quickly." },
      });
      return;
    }

    const gameId = validateOnlineGameId(req.params.gameId, "account.rejoin.gameId");
    if (!gameId.ok) {
      res.status(400).json({ error: gameId.error });
      return;
    }

    const auth = await resolveAccountBearer(req);
    if (!auth.ok) {
      log({ event: "online.account.rejoin", gameId: gameId.value, status: "rejected", reason: auth.reason });
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    await enqueueGameAction(gameId.value, async () => {
      const lookup = await loadValidatedSummaryForGame(gameId.value);
      if (!lookup.ok) {
        log({ event: "online.account.rejoin", gameId: gameId.value, status: "failed", reason: lookup.reason });
        res.status(503).json({
          error: { code: "persistence_failed", message: "Online game summary could not be loaded." },
        });
        return;
      }
      if (!lookup.summary) {
        log({ event: "online.account.rejoin", gameId: gameId.value, status: "rejected", reason: "not_found" });
        res.status(404).json({
          error: { code: "not_found", message: "No active account game was found." },
        });
        return;
      }

      const seat = seatForGameIdentity(lookup.summary, auth.account.identity);
      if (!seat) {
        log({ event: "online.account.rejoin", gameId: gameId.value, status: "rejected", reason: "not_participant" });
        res.status(404).json({
          error: { code: "not_found", message: "No active account game was found." },
        });
        return;
      }
      if (lookup.summary.status !== "active" || lookup.summary.archiveState !== "active") {
        log({ event: "online.account.rejoin", gameId: gameId.value, status: "rejected", reason: "game_over" });
        res.status(409).json({
          error: { code: "game_over", message: "This account game is already complete." },
        });
        return;
      }

      const room = service.getRoom(gameId.value);
      if (!room) {
        log({ event: "online.account.rejoin", gameId: gameId.value, status: "rejected", reason: "not_found" });
        res.status(404).json({
          error: { code: "not_found", message: "No active account game was found." },
        });
        return;
      }

      const timeout = await adjudicateTimeoutForRoom(gameId.value, room);
      if (!timeout.ok) {
        log({ event: "online.account.rejoin", gameId: gameId.value, status: "rejected", reason: timeout.error.code });
        res
          .status(httpStatusForOnlineError(timeout.error))
          .json(responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot));
        return;
      }
      if (timeout.timeout) {
        broadcastSnapshot(gameId.value);
        res.status(409).json({
          error: { code: "game_over", message: "This account game is already complete." },
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          snapshot: (service.getRoom(gameId.value) ?? room).getSnapshot(),
        });
        return;
      }

      const token = service.createSeatToken(seat);
      const credential = service.credentialForToken(token);
      if (options.appendGameSeatCredential && !isOnlineTokenCredentialHash(credential)) {
        log({
          event: "online.account.rejoin",
          gameId: gameId.value,
          status: "failed",
          reason: "invalid_credential_factory",
        });
        res.status(503).json({
          error: { code: "persistence_failed", message: "The account game could not be rejoined." },
        });
        return;
      }

      try {
        const record = options.appendGameSeatCredential
          ? await options.appendGameSeatCredential(gameId.value, seat, credential)
          : service.addSeatCredential(gameId.value, seat, credential);
        if (!record) {
          throw new Error(`Online game ${gameId.value} was not found while adding rejoin credential.`);
        }
        service.replaceRoom(record);
        disconnectStalePlayerSockets(gameId.value);
      } catch (error) {
        if (error instanceof OnlineGameSeatCredentialTerminalError) {
          log({ event: "online.account.rejoin", gameId: gameId.value, status: "rejected", reason: "game_over" });
          res.status(409).json({
            error: { code: "game_over", message: "This account game is already complete." },
          });
          return;
        }
        log({ event: "online.account.rejoin", gameId: gameId.value, status: "failed", reason: "persistence_failed" });
        console.error("Failed to persist account game rejoin credential", error);
        res.status(503).json({
          error: { code: "persistence_failed", message: "The account game could not be rejoined." },
        });
        return;
      }

      log({ event: "online.account.rejoin", gameId: gameId.value, role: "player", status: "accepted" });
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        gameInvite: {
          gameId: gameId.value,
          seat,
          token,
          url: buildTokenlessOnlineGameUrl(options.publicBaseUrl, gameId.value, seat),
        },
      });
    });
  });

  const expireChallengeIfNeeded = async (
    summary: OnlineChallengeSummary,
    expiredAt = new Date(options.now?.() ?? Date.now()).toISOString()
  ): Promise<OnlineChallengeSummary> => {
    if (!canSystemExpireChallenge(summary, expiredAt)) return summary;
    try {
      return await appendChallengeLifecycleEvent(
        createChallengeExpiredEvent(
          {
            type: "challenge_expired",
            challengeId: summary.challengeId,
            expiredBy: "system",
            expiredAt,
          },
          { createdAt: expiredAt }
        )
      );
    } catch (error) {
      if (challengeTerminalError(error)) {
        const current = await loadChallengeSummary(summary.challengeId);
        if (current && current.status !== "pending") return current;
      }
      throw error;
    }
  };

  const accountChallengePairRestriction = async (
    challengerIdentity: OnlineIdentity,
    challengedIdentity: OnlineIdentity,
    checkedAt: string
  ): Promise<"pending" | "cooldown" | null> => {
    const summaries = await Promise.all(
      (await loadChallengeSummaries()).map((summary) => expireChallengeIfNeeded(summary, checkedAt))
    );
    let latestRestrictedTerminalAt = 0;
    for (const summary of summaries) {
      if (
        !isSameOnlineIdentity(summary.challengerIdentity, challengerIdentity) ||
        !isSameOnlineIdentity(summary.challengedIdentity, challengedIdentity)
      ) {
        continue;
      }
      if (summary.status === "pending") {
        return "pending";
      }
      if (summary.status === "declined" || summary.status === "cancelled" || summary.status === "expired") {
        const updatedAt = Date.parse(summary.updatedAt);
        if (Number.isFinite(updatedAt)) {
          latestRestrictedTerminalAt = Math.max(latestRestrictedTerminalAt, updatedAt);
        }
      }
    }
    const checkedAtMs = Date.parse(checkedAt);
    if (
      Number.isFinite(checkedAtMs) &&
      latestRestrictedTerminalAt > 0 &&
      checkedAtMs - latestRestrictedTerminalAt < ACCOUNT_CHALLENGE_PAIR_COOLDOWN_MS
    ) {
      return "cooldown";
    }
    return null;
  };

  app.get("/api/online/seeks", async (req, res) => {
    if (!publicDirectoryLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many public seek requests were sent too quickly.",
        },
      });
      return;
    }

    try {
      const parsed = parseOpenSeekDirectoryOptions(req.originalUrl);
      if (!parsed.ok) {
        res.status(400).json({
          error: { code: "bad_request", message: parsed.message },
        });
        return;
      }
      const accountSession = await resolveOptionalAccountSession(req);
      if (!accountSession.ok) {
        res.status(accountSession.status).json({ error: accountSession.error });
        return;
      }
      const directory = await listPublicOpenSeekDirectory(parsed.options, accountSession.account);
      res.json(directory);
      log({ event: "online.seek.list", status: "accepted" });
    } catch (error) {
      log({ event: "online.seek.list", status: "failed", reason: "summary_load_failed" });
      console.error("Failed to load open seeks", error);
      res.status(503).json({
        error: { code: "persistence_failed", message: "Open seeks could not be loaded." },
      });
    }
  });

  app.post("/api/online/seeks", async (req, res) => {
    if (!createOpenSeekLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many open seeks have been created from this client. Try again shortly.",
        },
      });
      return;
    }

    const setup = validateOnlineGameSetup(req.body?.setup);
    if (!setup.ok) {
      res.status(400).json({ error: setup.error });
      return;
    }
    const creatorSeat = normalizeOpenSeekSeat(req.body?.creatorSeat);
    if (!creatorSeat) {
      res.status(400).json({
        error: { code: "bad_request", message: "Open seek creatorSeat must be w, b, or random." },
      });
      return;
    }
    const visibility = normalizeOpenSeekVisibility(req.body?.visibility);
    if (!visibility) {
      res.status(400).json({
        error: { code: "bad_request", message: "Open seek visibility must be public or followed." },
      });
      return;
    }
    const accountIdentity = await resolveOptionalAccountSession(req);
    if (!accountIdentity.ok) {
      res.status(accountIdentity.status).json({ error: accountIdentity.error });
      return;
    }
    if (visibility === "followed" && accountIdentity.identity?.kind !== "registered") {
      res.status(400).json({
        error: {
          code: "bad_request",
          message: "Followed-only open seeks require a registered account creator.",
        },
      });
      return;
    }
    const creatorIdentity = accountIdentity.identity
      ? { ok: true as const, identity: accountIdentity.identity }
      : normalizePublicSessionIdentity(req.body?.creatorSessionId, "creatorSessionId");
    if (!creatorIdentity.ok) {
      res.status(400).json({ error: creatorIdentity.error });
      return;
    }
    const expiry = parseChallengeExpiry(req.body?.expiresInMs);
    if (!expiry.ok) {
      res.status(400).json({ error: expiry.error });
      return;
    }

    const normalizedSetup = normalizeOnlineSetupForCreation(setup.value);
    const createdAt = new Date(options.now?.() ?? Date.now()).toISOString();

    try {
      const created = await createOpenSeekForIdentity(
        normalizedSetup,
        creatorSeat,
        creatorIdentity.identity,
        visibility,
        expiry.value,
        createdAt
      );
      res.status(201).json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        seekId: created.seekId,
        summary: created.summary,
        creator: {
          token: created.token,
        },
      });
    } catch (error) {
      console.error("Failed to create open seek", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "The open seek could not be saved.",
        },
      });
    }
  });

  app.get("/api/online/seeks/:seekId", async (req, res) => {
    if (!openSeekActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many open seek requests were sent too quickly.",
        },
      });
      return;
    }

    try {
      const auth = await getAuthorizedOpenSeek(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      const summary = await expireOpenSeekIfNeeded(auth.summary);
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        role: "creator",
        summary,
        gameInvite: gameInviteForOpenSeekCreator(summary, auth.credential, auth.token),
      });
    } catch (error) {
      console.error("Failed to load open seek", error);
      res.status(503).json({
        error: { code: "persistence_failed", message: "The open seek could not be loaded." },
      });
    }
  });

  app.post("/api/online/seeks/:seekId/cancel", async (req, res) => {
    if (!openSeekActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many open seek requests were sent too quickly.",
        },
      });
      return;
    }

    try {
      const auth = await getAuthorizedOpenSeek(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      const cancelledAt = new Date(options.now?.() ?? Date.now()).toISOString();
      const summary = await expireOpenSeekIfNeeded(auth.summary, cancelledAt);
      if (summary.status !== "open") {
        res.status(409).json({
          error: { code: "game_over", message: "This open seek is no longer open." },
        });
        return;
      }
      if (!canIdentityCancelOpenSeek(summary, auth.credential.identity, cancelledAt)) {
        res.status(409).json({
          error: { code: "game_over", message: "This open seek is no longer open." },
        });
        return;
      }
      const cancelledSummary = await appendOpenSeekLifecycleEvent(
        createOpenSeekCancelledEvent(
          {
            type: "seek_cancelled",
            seekId: summary.seekId,
            cancelledBy: auth.credential.identity,
            cancelledAt,
          },
          { createdAt: cancelledAt }
        )
      );
      res.json({ protocolVersion: ONLINE_PROTOCOL_VERSION, role: "creator", summary: cancelledSummary });
    } catch (error) {
      res.status(openSeekTerminalError(error) ? 409 : 503).json({
        error: openSeekTerminalError(error)
          ? { code: "game_over", message: "This open seek is no longer open." }
          : { code: "persistence_failed", message: "The open seek could not be cancelled." },
      });
    }
  });

  app.post("/api/online/seeks/:seekId/accept", async (req, res) => {
    if (!openSeekActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many open seek requests were sent too quickly.",
        },
      });
      return;
    }

    const seekId = validateOnlineGameId(req.params.seekId, "seek.seekId");
    if (!seekId.ok) {
      res.status(400).json({ error: seekId.error });
      return;
    }
    const accountIdentity = await resolveOptionalAccountSession(req);
    if (!accountIdentity.ok) {
      res.status(accountIdentity.status).json({ error: accountIdentity.error });
      return;
    }
    const acceptorIdentity = accountIdentity.identity
      ? { ok: true as const, identity: accountIdentity.identity }
      : normalizePublicSessionIdentity(req.body?.acceptorSessionId, "acceptorSessionId");
    if (!acceptorIdentity.ok) {
      res.status(400).json({ error: acceptorIdentity.error });
      return;
    }

    try {
      const loadedSummary = await loadOpenSeekSummary(seekId.value);
      if (!loadedSummary) {
        res.status(404).json({
          error: { code: "not_found", message: "No open seek was found for that id." },
        });
        return;
      }
      if (!(await canAccountViewOpenSeek(loadedSummary, accountIdentity.account))) {
        res.status(404).json({
          error: { code: "not_found", message: "No open seek was found for that id." },
        });
        return;
      }
      const acceptedAt = new Date(options.now?.() ?? Date.now()).toISOString();
      const summary = await expireOpenSeekIfNeeded(loadedSummary, acceptedAt);
      if (
        summary.status !== "open" ||
        !canIdentityAcceptOpenSeek(summary, acceptorIdentity.identity, acceptedAt)
      ) {
        res.status(409).json({
          error: { code: "game_over", message: "This open seek is no longer open." },
        });
        return;
      }

      res.json(await acceptOpenSeekSummary(summary, acceptorIdentity.identity, acceptedAt));
    } catch (error) {
      const terminal = openSeekTerminalError(error);
      res.status(terminal ? 409 : 503).json({
        error: {
          code: terminal ? "game_over" : "persistence_failed",
          message: terminal
            ? "This open seek is no longer open."
            : "The open seek could not be accepted.",
        },
      });
    }
  });

  app.post("/api/online/matchmaking/quick", async (req, res) => {
    if (!quickMatchLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many quick match requests were sent too quickly.",
        },
      });
      return;
    }

    const setup = validateOnlineGameSetup(req.body?.setup);
    if (!setup.ok) {
      res.status(400).json({ error: setup.error });
      return;
    }
    const accountIdentity = await resolveOptionalAccountSession(req);
    if (!accountIdentity.ok) {
      res.status(accountIdentity.status).json({ error: accountIdentity.error });
      return;
    }
    const sessionIdentity = accountIdentity.identity
      ? { ok: true as const, identity: accountIdentity.identity }
      : normalizePublicSessionIdentity(req.body?.sessionId, "sessionId");
    if (!sessionIdentity.ok) {
      res.status(400).json({ error: sessionIdentity.error });
      return;
    }
    const expiry = parseChallengeExpiry(req.body?.expiresInMs);
    if (!expiry.ok) {
      res.status(400).json({ error: expiry.error });
      return;
    }

    const normalizedSetup = normalizeOnlineSetupForCreation(setup.value);
    const setupSignature = canonicalSetupSignature(normalizedSetup);

    try {
      const response = await runQuickMatchForSession(publicPlayerIdentityQueueKey(sessionIdentity.identity), async () => {
        const checkedAt = new Date(options.now?.() ?? Date.now()).toISOString();
        if (await loadActiveSeekForSession(sessionIdentity.identity, checkedAt)) {
          return {
            status: 409,
            body: {
              error: {
                code: "existing_open_seek",
                message: "This session already has an active open seek.",
              },
            },
          };
        }

        const candidates = await listQuickMatchOpenSeekCandidates(accountIdentity.account);
        for (const candidate of candidates) {
          if (isSameOpenSeekIdentity(candidate.creatorIdentity, sessionIdentity.identity)) continue;
          if (canonicalSetupSignature(candidate.setup) !== setupSignature) continue;
          const acceptedAt = new Date(options.now?.() ?? Date.now()).toISOString();
          try {
            const accepted = await acceptOpenSeekSummary(candidate, sessionIdentity.identity, acceptedAt);
            return {
              status: 200,
              body: {
                ...accepted,
                outcome: "matched",
              },
            };
          } catch (error) {
            if (openSeekTerminalError(error)) continue;
            throw error;
          }
        }

        const createdAt = new Date(options.now?.() ?? Date.now()).toISOString();
        if (await loadActiveSeekForSession(sessionIdentity.identity, createdAt)) {
          return {
            status: 409,
            body: {
              error: {
                code: "existing_open_seek",
                message: "This session already has an active open seek.",
              },
            },
          };
        }
        const created = await createOpenSeekForIdentity(
          normalizedSetup,
          "random",
          sessionIdentity.identity,
          "public",
          expiry.value,
          createdAt
        );
        return {
          status: 200,
          body: {
            protocolVersion: ONLINE_PROTOCOL_VERSION,
            outcome: "waiting",
            role: "creator",
            seekId: created.seekId,
            summary: created.summary,
            creator: { token: created.token },
          },
        };
      });
      res.status(response.status).json(response.body);
    } catch (error) {
      console.error("Failed to start quick match", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "Quick match could not be started.",
        },
      });
    }
  });

  app.post("/api/online/challenges", async (req, res) => {
    if (!createChallengeLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many online challenges have been created from this client. Try again shortly.",
        },
      });
      return;
    }

    const setup = validateOnlineGameSetup(req.body?.setup);
    if (!setup.ok) {
      res.status(400).json({ error: setup.error });
      return;
    }
    const challengerSeat = normalizeChallengeSeat(req.body?.challengerSeat);
    if (!challengerSeat) {
      res.status(400).json({
        error: { code: "bad_request", message: "Challenge challengerSeat must be w, b, or random." },
      });
      return;
    }
    const visibility = normalizeChallengeVisibility(req.body?.visibility);
    if (!visibility) {
      res.status(400).json({
        error: { code: "bad_request", message: "Challenge visibility must be private or unlisted." },
      });
      return;
    }
    const expiry = parseChallengeExpiry(req.body?.expiresInMs);
    if (!expiry.ok) {
      res.status(400).json({ error: expiry.error });
      return;
    }

    const challengedDisplayName =
      req.body?.challengedDisplayName === undefined
        ? null
        : normalizeOnlineAccountDisplayName(req.body.challengedDisplayName);
    if (challengedDisplayName && !challengedDisplayName.ok) {
      res.status(400).json({ error: challengedDisplayName.error });
      return;
    }

    let resolvedChallengerIdentity: OnlineIdentity | null = null;
    let resolvedChallengedIdentity: OnlineIdentity | null = null;
    if (challengedDisplayName) {
      const auth = await resolveAccountBearer(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      try {
        const target = await accountStore.resolveChallengeTarget(
          auth.account.accountId,
          challengedDisplayName.value
        );
        if (target.status !== "ok") {
          const failure = challengeTargetError(target.status);
          res.status(failure.status).json({ error: failure.error });
          return;
        }
        resolvedChallengerIdentity = auth.account.identity;
        resolvedChallengedIdentity = target.account.identity;
      } catch (error) {
        console.error("Failed to resolve online challenge target", error);
        res.status(503).json({
          error: {
            code: "persistence_failed",
            message: "The online challenge target could not be checked.",
          },
        });
        return;
      }
    } else {
      const accountIdentity = await resolveOptionalAccountIdentity(req);
      if (!accountIdentity.ok) {
        res.status(accountIdentity.status).json({ error: accountIdentity.error });
        return;
      }
      resolvedChallengerIdentity = accountIdentity.identity;
    }

    const normalizedSetup = normalizeOnlineSetupForCreation(setup.value);
    let challengeId = defaultChallengeIdFactory();
    while (await loadChallengeSummary(challengeId)) {
      challengeId = defaultChallengeIdFactory();
    }
    const createdAt = new Date(options.now?.() ?? Date.now()).toISOString();
    const expiresAt = new Date(Date.parse(createdAt) + expiry.value).toISOString();
    let challengerToken = defaultChallengeTokenFactory();
    let challengedToken = defaultChallengeTokenFactory();
    while (challengerToken === challengedToken) {
      challengedToken = defaultChallengeTokenFactory();
    }
    const challengerIdentity =
      resolvedChallengerIdentity ?? { kind: "session" as const, id: `${challengeId}_challenger` };
    const challengedIdentity =
      resolvedChallengedIdentity ?? { kind: "session" as const, id: `${challengeId}_challenged` };

    try {
      const createChallenge = async (): Promise<{ status: number; body: unknown }> => {
        const pairRestriction = challengedDisplayName
          ? await accountChallengePairRestriction(challengerIdentity, challengedIdentity, createdAt)
          : null;
        if (pairRestriction) {
          return {
            status: 429,
            body: {
              error: {
                code: "rate_limited",
                message: pairRestriction === "pending"
                  ? "That account already has a pending challenge from you."
                  : "Please wait before challenging that account again.",
              },
            },
          };
        }
        const event = createChallengeCreatedEvent(
          {
            type: "challenge_created",
            challengeId,
            challengerIdentity,
            challengedIdentity,
            challengerSeat,
            visibility,
            setup: normalizedSetup,
            expiresAt,
          },
          { createdAt }
        );
        const summary = await appendChallengeCreated(event, {
          challengerCredential: hashOnlineToken(challengerToken),
          challengedCredential: hashOnlineToken(challengedToken),
          challengerIdentity,
          challengedIdentity,
        });
        return {
          status: 201,
          body: {
            challengeId,
            summary,
            challenger: {
              url: buildChallengeUrl(options.publicBaseUrl, challengeId, "challenger", challengerToken),
            },
            challenged: {
              url: buildChallengeUrl(options.publicBaseUrl, challengeId, "challenged", challengedToken),
            },
          },
        };
      };
      const response = challengedDisplayName
        ? await runAccountChallengePairTask(
            accountChallengePairQueueKey(challengerIdentity, challengedIdentity),
            createChallenge
          )
        : await createChallenge();
      res.status(response.status).json(response.body);
    } catch (error) {
      console.error("Failed to create online challenge", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "The online challenge could not be saved.",
        },
      });
    }
  });

  app.get("/api/online/challenges/:challengeId", async (req, res) => {
    if (!challengeActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many online challenge requests were sent too quickly.",
        },
      });
      return;
    }

    try {
      const auth = await getAuthorizedChallenge(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      const summary = await expireChallengeIfNeeded(auth.summary);
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        role: auth.credential.role,
        summary,
        gameInvite: gameInviteForChallenge(summary, auth.credential, auth.token),
      });
    } catch (error) {
      console.error("Failed to load online challenge", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "The online challenge could not be loaded.",
        },
      });
    }
  });

  app.post("/api/online/challenges/:challengeId/accept", async (req, res) => {
    if (!challengeActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many online challenge requests were sent too quickly.",
        },
      });
      return;
    }

    try {
      const auth = await getAuthorizedChallenge(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      const summary = await expireChallengeIfNeeded(auth.summary);
      if (summary.status !== "pending") {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      if (auth.credential.role !== "challenged") {
        res.status(404).json({ error: challengeNotFoundError() });
        return;
      }

      const result = await acceptPendingChallengeAndCreateGame(summary, auth.credential);
      service.replaceRoom(result.gameRecord);
      const gameInvite = gameInviteForChallenge(result.challengeSummary, auth.credential, auth.token);
      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        role: auth.credential.role,
        summary: result.challengeSummary,
        gameInvite,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      res.status(/terminal|pending|expiry|expired/i.test(message) ? 409 : 503).json({
        error: {
          code: /terminal|pending|expiry|expired/i.test(message) ? "game_over" : "persistence_failed",
          message: /terminal|pending|expiry|expired/i.test(message)
            ? "This challenge is no longer pending."
            : "The online challenge could not be accepted.",
        },
      });
    }
  });

  app.post("/api/online/challenges/:challengeId/decline", async (req, res) => {
    if (!challengeActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many online challenge requests were sent too quickly.",
        },
      });
      return;
    }

    try {
      const auth = await getAuthorizedChallenge(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      const declinedAt = new Date(options.now?.() ?? Date.now()).toISOString();
      const summary = await expireChallengeIfNeeded(auth.summary, declinedAt);
      if (summary.status !== "pending") {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      if (auth.credential.role !== "challenged") {
        res.status(404).json({ error: challengeNotFoundError() });
        return;
      }
      if (!canIdentityDeclineChallenge(summary, auth.credential.identity, declinedAt)) {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      const declinedSummary = await appendChallengeLifecycleEvent(
        createChallengeDeclinedEvent(
          {
            type: "challenge_declined",
            challengeId: summary.challengeId,
            declinedBy: auth.credential.identity,
            declinedAt,
          },
          { createdAt: declinedAt }
        )
      );
      res.json({ protocolVersion: ONLINE_PROTOCOL_VERSION, role: auth.credential.role, summary: declinedSummary });
    } catch (error) {
      res.status(challengeTerminalError(error) ? 409 : 503).json({
        error: challengeTerminalError(error)
          ? { code: "game_over", message: "This challenge is no longer pending." }
          : { code: "persistence_failed", message: "The online challenge could not be declined." },
      });
    }
  });

  app.post("/api/online/challenges/:challengeId/cancel", async (req, res) => {
    if (!challengeActionLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many online challenge requests were sent too quickly.",
        },
      });
      return;
    }

    try {
      const auth = await getAuthorizedChallenge(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      const cancelledAt = new Date(options.now?.() ?? Date.now()).toISOString();
      const summary = await expireChallengeIfNeeded(auth.summary, cancelledAt);
      if (summary.status !== "pending") {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      if (auth.credential.role !== "challenger") {
        res.status(404).json({ error: challengeNotFoundError() });
        return;
      }
      if (!canIdentityCancelChallenge(summary, auth.credential.identity, cancelledAt)) {
        res.status(409).json({
          error: { code: "game_over", message: "This challenge is no longer pending." },
        });
        return;
      }
      const cancelledSummary = await appendChallengeLifecycleEvent(
        createChallengeCancelledEvent(
          {
            type: "challenge_cancelled",
            challengeId: summary.challengeId,
            cancelledBy: auth.credential.identity,
            cancelledAt,
          },
          { createdAt: cancelledAt }
        )
      );
      res.json({ protocolVersion: ONLINE_PROTOCOL_VERSION, role: auth.credential.role, summary: cancelledSummary });
    } catch (error) {
      res.status(challengeTerminalError(error) ? 409 : 503).json({
        error: challengeTerminalError(error)
          ? { code: "game_over", message: "This challenge is no longer pending." }
          : { code: "persistence_failed", message: "The online challenge could not be cancelled." },
      });
    }
  });

  app.get("/api/online/games", async (req, res) => {
    if (!publicDirectoryLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many public directory requests were sent too quickly.",
        },
      });
      return;
    }

    try {
      const parsed = parsePublicDirectoryOptions(req.originalUrl);
      if (!parsed.ok) {
        res.status(400).json({
          error: {
            code: "bad_request",
            message: parsed.message,
          },
        });
        return;
      }

      const directory = await listPublicGameDirectory(parsed.options);
      res.json(directory);
      log({ event: "online.summary.list", status: "accepted" });
    } catch (error) {
      log({ event: "online.summary.list", status: "failed", reason: "summary_load_failed" });
      console.error("Failed to load online game summaries", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "Online game summaries could not be loaded.",
        },
      });
    }
  });

  app.get("/api/online/games/:gameId/summary", async (req, res) => {
    if (!publicDirectoryLimiter.take(getClientKey(req))) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many public directory requests were sent too quickly.",
        },
      });
      return;
    }

    if (hasSensitivePublicDirectoryQuery(new URL(req.originalUrl, "http://localhost").searchParams)) {
      res.status(400).json({
        error: {
          code: "bad_request",
          message: "Public summary query is invalid.",
        },
      });
      return;
    }

    try {
      const validation = validateOnlineGameId(req.params.gameId, "gameId");
      if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const lookup = await loadValidatedSummaryForGame(validation.value);
      if (!lookup.ok) {
        res.status(503).json({
          error: {
            code: "persistence_failed",
            message: "Online game summary could not be loaded.",
          },
        });
        return;
      }
      if (!lookup.summary || !canListOnlineGameSummary(lookup.summary)) {
        res.status(404).json({
          error: {
            code: "not_found",
            message: "Online game summary was not found.",
          },
        });
        return;
      }

      res.json({
        schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
        summary: lookup.summary,
      });
      log({ event: "online.summary.detail", gameId: validation.value, status: "accepted" });
    } catch (error) {
      log({ event: "online.summary.detail", status: "failed", reason: "summary_load_failed" });
      console.error("Failed to load online game summary", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "Online game summary could not be loaded.",
        },
      });
    }
  });

  app.post("/api/online/games", async (req, res) => {
    if (!createGameLimiter.take(getClientKey(req))) {
      log({ event: "online.game.create", status: "rejected", reason: "rate_limited" });
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many online games have been created from this client. Try again shortly.",
        },
      });
      return;
    }

    const setup = validateOnlineGameSetup(req.body?.setup);
    if (!setup.ok) {
      log({ event: "online.game.create", status: "rejected", reason: setup.error.code });
      res.status(400).json({
        error: setup.error,
      });
      return;
    }

    const creatorSeat = normalizeDirectGameCreatorSeat(req.body?.creatorSeat);
    if (!creatorSeat) {
      log({ event: "online.game.create", status: "rejected", reason: "bad_creator_seat" });
      res.status(400).json({
        error: { code: "bad_request", message: "Online game creatorSeat must be w or b." },
      });
      return;
    }

    const accountIdentity = await resolveOptionalAccountIdentity(req);
    if (!accountIdentity.ok) {
      log({ event: "online.game.create", status: "rejected", reason: accountIdentity.reason });
      res.status(accountIdentity.status).json({ error: accountIdentity.error });
      return;
    }

    const normalizedSetup = normalizeOnlineSetupForCreation(setup.value);

    const created = service.createGame(normalizedSetup, {
      publicBaseUrl: options.publicBaseUrl,
    });
    const room = service.getRoom(created.gameId);

    try {
      if (!room) {
        throw new Error(`Created online game ${created.gameId} is missing from service.`);
      }
      const record = room.toRecord();
      const event = createOnlineGameCreatedEvent({
        type: "game_created",
        gameId: record.gameId,
        setup: record.setup,
        clock: record.clock,
        whiteIdentity:
          accountIdentity.identity && creatorSeat === "w"
            ? accountIdentity.identity
            : { kind: "anonymous", id: `anon_${record.gameId}_w` },
        blackIdentity:
          accountIdentity.identity && creatorSeat === "b"
            ? accountIdentity.identity
            : { kind: "anonymous", id: `anon_${record.gameId}_b` },
      });
      const credentials: OnlineGameCredentials = {
        whiteCredential: record.whiteCredential,
        blackCredential: record.blackCredential,
      };
      if (options.onGameCreated) {
        if (
          !isOnlineTokenCredentialHash(credentials.whiteCredential) ||
          !isOnlineTokenCredentialHash(credentials.blackCredential)
        ) {
          throw new Error(`Created online game ${created.gameId} has invalid credential hashes.`);
        }
        await options.onGameCreated(event, credentials);
      } else {
        await options.onGameEvent?.(event);
      }
    } catch (error) {
      service.deleteGame(created.gameId);
      log({
        event: "online.persistence",
        gameId: created.gameId,
        status: "failed",
        reason: "game_created",
      });
      log({
        event: "online.game.create",
        gameId: created.gameId,
        status: "rejected",
        reason: "persistence_failed",
      });
      console.error("Failed to persist online game creation", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "The online game could not be saved.",
        },
      });
      return;
    }

    log({ event: "online.game.create", gameId: created.gameId, status: "accepted" });
    res.status(201).json(created);
  });

  app.get("/api/online/games/:gameId", async (req, res) => {
    const gameId = validateOnlineGameId(req.params.gameId, "join.gameId");
    if (!gameId.ok) {
      log({ event: "online.http.join", role: "player", status: "rejected", reason: gameId.error.code });
      res.status(400).json({ error: gameId.error });
      return;
    }

    await enqueueGameAction(gameId.value, async () => {
      const token = getBearerToken(req.headers.authorization) ?? "";
      const room = service.getRoomForToken(gameId.value, token);
      if (!room) {
        log({
          event: "online.http.join",
          gameId: gameId.value,
          role: "player",
          status: "rejected",
          reason: "not_found",
        });
        res.status(404).json({
          error: {
            code: "not_found",
            message: "No online game was found for that id and token.",
          },
        });
        return;
      }

      const timeout = await adjudicateTimeoutForRoom(gameId.value, room);
      if (!timeout.ok) {
        log({
          event: "online.http.join",
          gameId: gameId.value,
          role: "player",
          status: "rejected",
          reason: timeout.error.code,
        });
        res
          .status(httpStatusForOnlineError(timeout.error))
          .json(responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot));
        return;
      }
      if (timeout.timeout) {
        broadcastSnapshot(gameId.value);
      }
      const currentRoom = service.getRoom(gameId.value) ?? room;

      const color = currentRoom.authenticate(token);
      if (!color) {
        log({
          event: "online.http.join",
          gameId: gameId.value,
          role: "player",
          status: "rejected",
          reason: "not_found",
        });
        res.status(404).json({
          error: {
            code: "not_found",
            message: "No online game was found for that id and token.",
          },
        });
        return;
      }

      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        color,
        snapshot: currentRoom.getSnapshot(),
      });
      log({
        event: "online.http.join",
        gameId: gameId.value,
        role: "player",
        status: "accepted",
      });
    });
  });

  app.patch("/api/online/games/:gameId/visibility", async (req, res) => {
    const gameId = validateOnlineGameId(req.params.gameId, "visibility.gameId");
    if (!gameId.ok) {
      log({ event: "online.game.visibility", role: "player", status: "rejected", reason: gameId.error.code });
      res.status(400).json({ error: gameId.error });
      return;
    }

    const visibility = normalizeGameVisibility(req.body?.visibility);
    if (!visibility) {
      log({
        event: "online.game.visibility",
        gameId: gameId.value,
        role: "player",
        status: "rejected",
        reason: "bad_request",
      });
      res.status(400).json({
        error: {
          code: "bad_request",
          message: "Game visibility must be public or unlisted.",
        },
      });
      return;
    }

    await enqueueGameAction(gameId.value, async () => {
      const token = getBearerToken(req.headers.authorization) ?? "";
      const room = service.getRoomForToken(gameId.value, token);
      if (!room) {
        log({
          event: "online.game.visibility",
          gameId: gameId.value,
          role: "player",
          status: "rejected",
          reason: "not_found",
        });
        res.status(404).json({
          error: {
            code: "not_found",
            message: "No online game was found for that id and token.",
          },
        });
        return;
      }

      if (!options.appendGameVisibilityChanged) {
        log({
          event: "online.game.visibility",
          gameId: gameId.value,
          role: "player",
          status: "failed",
          reason: "persistence_unavailable",
        });
        res.status(503).json({
          error: {
            code: "persistence_failed",
            message: "Game visibility changes require durable persistence.",
          },
        });
        return;
      }

      try {
        const summary = await options.appendGameVisibilityChanged(
          createOnlineGameVisibilityChangedEvent(
            {
              type: "visibility_changed",
              gameId: gameId.value,
              visibility,
            },
            { createdAt: new Date(options.now?.() ?? Date.now()).toISOString() }
          )
        );
        const validation = validateOnlineGameSummary(summary);
        if (!validation.ok) {
          throw new Error(validation.error.message);
        }

        log({
          event: "online.game.visibility",
          gameId: gameId.value,
          role: "player",
          status: "accepted",
          reason: visibility,
        });
        res.json({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          summary: validation.value,
        });
      } catch (error) {
        log({
          event: "online.game.visibility",
          gameId: gameId.value,
          role: "player",
          status: "failed",
          reason: "persistence_failed",
        });
        console.error("Failed to persist online game visibility", error);
        res.status(503).json({
          error: {
            code: "persistence_failed",
            message: "The online game visibility could not be saved.",
          },
        });
      }
    });
  });

  app.get("/api/online/games/:gameId/spectator", async (req, res) => {
    const gameId = validateOnlineGameId(req.params.gameId, "spectator.gameId");
    if (!gameId.ok) {
      log({ event: "online.http.spectate", status: "rejected", reason: gameId.error.code });
      res.status(400).json({ error: gameId.error });
      return;
    }

    if (!spectatorSnapshotLimiter.take(getClientKey(req))) {
      log({
        event: "online.http.spectate",
        gameId: gameId.value,
        role: "spectator",
        status: "rejected",
        reason: "rate_limited",
      });
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many spectator snapshots have been requested from this client. Try again shortly.",
        },
      });
      return;
    }

    await enqueueGameAction(gameId.value, async () => {
      const access = await checkSpectatorAccess(gameId.value);
      if (!access.ok) {
        log({
          event: "online.http.spectate",
          gameId: gameId.value,
          role: "spectator",
          status: "rejected",
          reason: access.reason,
        });
        res.status(404).json({ error: access.error });
        return;
      }

      const room = service.getRoom(gameId.value);
      if (!room) {
        log({
          event: "online.http.spectate",
          gameId: gameId.value,
          role: "spectator",
          status: "rejected",
          reason: "not_found",
        });
        res.status(404).json({
          error: {
            code: "not_found",
            message: "No online game was found for that id.",
          },
        });
        return;
      }

      const timeout = await adjudicateTimeoutForRoom(gameId.value, room);
      if (!timeout.ok) {
        log({
          event: "online.http.spectate",
          gameId: gameId.value,
          role: "spectator",
          status: "rejected",
          reason: timeout.error.code,
        });
        res
          .status(httpStatusForOnlineError(timeout.error))
          .json(responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot));
        return;
      }
      if (timeout.timeout) {
        broadcastSnapshot(gameId.value);
      }
      const currentRoom = service.getRoom(gameId.value) ?? room;

      res.json({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        role: "spectator",
        snapshot: currentRoom.getSnapshot(),
      });
      log({
        event: "online.http.spectate",
        gameId: gameId.value,
        role: "spectator",
        status: "accepted",
      });
    });
  });

  const broadcastSnapshot = (gameId: string) => {
    const room = service.getRoom(gameId);
    if (!room) return;
    disconnectStalePlayerSockets(gameId);
    const snapshot = room.getSnapshot();
    for (const [socket, connection] of connections) {
      if (connection.gameId === gameId) {
        sendJson(socket, { type: "snapshot", snapshot });
      }
    }
  };

  const handleClientMessage = async (
    socket: WebSocket,
    data: RawData,
    clientKey: string
  ): Promise<void> => {
    if (!socketMessageLimiter.take(clientKey)) {
      log({ event: "online.socket.message", status: "rejected", reason: "rate_limited" });
      sendSocketError(socket, {
        code: "rate_limited",
        message: "Too many online messages were sent too quickly.",
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = parseMessage(data);
    } catch {
      log({ event: "online.socket.message", status: "rejected", reason: "bad_json" });
      sendSocketError(socket, {
        code: "bad_json",
        message: "Message was not valid JSON.",
      });
      return;
    }

    const validation = validateClientMessage(parsed);
    if (!validation.ok) {
      log({ event: "online.socket.message", status: "rejected", reason: validation.error.code });
      sendSocketError(socket, validation.error);
      return;
    }

    const message: OnlineClientMessage = validation.value;

    if (message.type === "ping") {
      const connection = connections.get(socket);
      if (!connection) {
        sendJson(socket, {
          type: "pong",
          clientTime: message.clientTime,
          serverTime: Date.now(),
        });
        return;
      }

      await enqueueGameAction(connection.gameId, async () => {
        const room =
          connection.role === "player"
            ? service.getRoomForToken(connection.gameId, connection.token)
            : service.getRoom(connection.gameId);
        if (!room) {
          sendSocketError(socket, {
            code: "not_found",
            message: "Online game no longer exists.",
          });
          return;
        }

        const timeout = await adjudicateTimeoutForRoom(connection.gameId, room);
        if (!timeout.ok) {
          sendJson(socket, {
            type: "error",
            ...responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot),
          });
          return;
        }
        if (timeout.timeout) {
          broadcastSnapshot(connection.gameId);
        }
        sendJson(socket, {
          type: "pong",
          clientTime: message.clientTime,
          serverTime: Date.now(),
        });
      });
      return;
    }

    if (message.type === "join") {
      await enqueueGameAction(message.gameId, async () => {
        const room = service.getRoomForToken(message.gameId, message.token);
        if (!room) {
          log({
            event: "online.socket.join",
            gameId: message.gameId,
            role: "player",
            status: "rejected",
            reason: "unauthorized",
          });
          sendSocketError(socket, {
            code: "unauthorized",
            message: "No online game was found for that id and token.",
          });
          return;
        }

        const timeout = await adjudicateTimeoutForRoom(message.gameId, room);
        if (!timeout.ok) {
          log({
            event: "online.socket.join",
            gameId: message.gameId,
            role: "player",
            status: "rejected",
            reason: timeout.error.code,
          });
          sendJson(socket, {
            type: "error",
            ...responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot),
          });
          return;
        }

        const currentRoom = service.getRoom(message.gameId) ?? room;
        const color = currentRoom.authenticate(message.token);
        if (!color) {
          log({
            event: "online.socket.join",
            gameId: message.gameId,
            role: "player",
            status: "rejected",
            reason: "unauthorized",
          });
          sendSocketError(socket, {
            code: "unauthorized",
            message: "No online game was found for that id and token.",
          });
          return;
        }

        connections.set(socket, { role: "player", gameId: message.gameId, token: message.token });
        log({
          event: "online.socket.join",
          gameId: message.gameId,
          role: "player",
          status: "accepted",
        });
        sendJson(socket, {
          type: "joined",
          color,
          snapshot: currentRoom.getSnapshot(),
        });
        if (timeout.timeout) {
          broadcastSnapshot(message.gameId);
        }
      });
      return;
    }

    if (message.type === "spectate") {
      await enqueueGameAction(message.gameId, async () => {
        const access = await checkSpectatorAccess(message.gameId);
        if (!access.ok) {
          log({
            event: "online.socket.spectate",
            gameId: message.gameId,
            role: "spectator",
            status: "rejected",
            reason: access.reason,
          });
          sendSocketError(socket, access.error);
          return;
        }

        const room = service.getRoom(message.gameId);
        if (!room) {
          log({
            event: "online.socket.spectate",
            gameId: message.gameId,
            role: "spectator",
            status: "rejected",
            reason: "not_found",
          });
          sendSocketError(socket, {
            code: "not_found",
            message: "No online game was found for that id.",
          });
          return;
        }

        const timeout = await adjudicateTimeoutForRoom(message.gameId, room);
        if (!timeout.ok) {
          log({
            event: "online.socket.spectate",
            gameId: message.gameId,
            role: "spectator",
            status: "rejected",
            reason: timeout.error.code,
          });
          sendJson(socket, {
            type: "error",
            ...responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot),
          });
          return;
        }

        connections.set(socket, { role: "spectator", gameId: message.gameId });
        log({
          event: "online.socket.spectate",
          gameId: message.gameId,
          role: "spectator",
          status: "accepted",
        });
        const currentRoom = service.getRoom(message.gameId) ?? room;
        sendJson(socket, {
          type: "spectating",
          snapshot: currentRoom.getSnapshot(),
        });
        if (timeout.timeout) {
          broadcastSnapshot(message.gameId);
        }
      });
      return;
    }

    if (message.type === "action") {
      const connection = connections.get(socket);
      if (!connection || connection.role !== "player") {
        log({
          event: "online.action",
          role: "player",
          action: message.action.type,
          status: "rejected",
          reason: "not_joined",
        });
        sendSocketError(socket, {
          code: "not_joined",
          message: "Join an online game before sending actions.",
        });
        return;
      }

      await enqueueGameAction(connection.gameId, async () => {
        const currentConnection = connections.get(socket);
        if (
          !currentConnection ||
          currentConnection.role !== "player" ||
          currentConnection.gameId !== connection.gameId ||
          currentConnection.token !== connection.token
        ) {
          log({
            event: "online.action",
            gameId: connection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "not_joined",
          });
          sendSocketError(socket, {
            code: "not_joined",
            message: "Join an online game before sending actions.",
          });
          return;
        }

        const room = service.getRoom(currentConnection.gameId);
        if (!room) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "not_found",
          });
          sendSocketError(socket, {
            code: "not_found",
            message: "Online game no longer exists.",
          });
          return;
        }

        const playerColor = room.authenticate(currentConnection.token);
        if (!playerColor) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "unauthorized",
          });
          sendSocketError(socket, {
            code: "unauthorized",
            message: "This player token is not valid.",
          });
          return;
        }

        if (options.applyGameAction) {
          try {
            const transition = await options.applyGameAction({
              gameId: currentConnection.gameId,
              token: currentConnection.token,
              clientActionId: message.clientActionId,
              action: message.action,
              now: options.now,
            });
            if (transition.room) {
              service.replaceRoom(transition.room);
            }
            if (transition.event?.type === "timeout_adjudicated") {
              log({
                event: "online.timeout",
                gameId: currentConnection.gameId,
                role: "player",
                status: "expired",
                reason: transition.event.playerColor,
              });
            }
            if (!transition.ok) {
              log({
                event: "online.action",
                gameId: currentConnection.gameId,
                role: "player",
                action: message.action.type,
                status: "rejected",
                reason: transition.error.code,
              });
              if (
                transition.snapshot &&
                transition.error.code !== "not_found" &&
                transition.error.code !== "unauthorized"
              ) {
                sendJson(socket, {
                  type: "rejected",
                  clientActionId: message.clientActionId,
                  error: transition.error,
                  snapshot: transition.snapshot,
                });
              } else {
                sendSocketError(socket, transition.error);
              }
              if (transition.event?.type === "timeout_adjudicated") {
                broadcastSnapshot(currentConnection.gameId);
              }
              return;
            }

            log({
              event: "online.action",
              gameId: currentConnection.gameId,
              role: "player",
              action: transition.event.action.type,
              status: "accepted",
            });
            broadcastSnapshot(currentConnection.gameId);
          } catch (error) {
            log({
              event: "online.persistence",
              gameId: currentConnection.gameId,
              role: "player",
              action: message.action.type,
              status: "failed",
              reason: "action_accepted",
            });
            log({
              event: "online.action",
              gameId: currentConnection.gameId,
              role: "player",
              action: message.action.type,
              status: "rejected",
              reason: "persistence_failed",
            });
            console.error("Failed to persist online game action", error);
            sendSocketError(socket, {
              code: "persistence_failed",
              message: "The accepted action could not be saved.",
            });
          }
          return;
        }

        const existingAction = room.getAcceptedActionByClientId(
          playerColor,
          message.clientActionId
        );
        let exactExistingAction = false;
        let duplicateConflict = false;
        if (existingAction) {
          if (!sameOnlineAction(existingAction.action, message.action)) {
            duplicateConflict = true;
          } else {
            exactExistingAction = true;
          }
        }

        const timeout = await adjudicateTimeoutForRoom(currentConnection.gameId, room);
        if (!timeout.ok) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: timeout.error.code,
          });
          sendJson(socket, {
            type: "error",
            ...responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot),
          });
          return;
        }
        if (timeout.timeout) {
          if (exactExistingAction) {
            log({
              event: "online.action",
              gameId: currentConnection.gameId,
              role: "player",
              action: existingAction!.action.type,
              status: "accepted",
            });
            broadcastSnapshot(currentConnection.gameId);
            return;
          }
          const snapshot = (service.getRoom(currentConnection.gameId) ?? room).getSnapshot();
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "game_over",
          });
          sendJson(socket, {
            type: "rejected",
            clientActionId: message.clientActionId,
            error: {
              code: "game_over",
              message: "This game is already over on time.",
            },
            snapshot,
          });
          broadcastSnapshot(currentConnection.gameId);
          return;
        }

        const snapshotAfterTimeoutCheck = (service.getRoom(currentConnection.gameId) ?? room).getSnapshot();
        if (duplicateConflict && snapshotAfterTimeoutCheck.result?.reason === "timeout") {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "game_over",
          });
          sendJson(socket, {
            type: "rejected",
            clientActionId: message.clientActionId,
            error: {
              code: "game_over",
              message: "This game is already over on time.",
            },
            snapshot: snapshotAfterTimeoutCheck,
          });
          return;
        }

        if (duplicateConflict) {
          const snapshot = room.getSnapshot();
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "duplicate_action",
          });
          sendJson(socket, {
            type: "rejected",
            clientActionId: message.clientActionId,
            error: {
              code: "duplicate_action",
              message: "This client action id has already been used for a different action.",
            },
            snapshot,
          });
          return;
        }

        if (exactExistingAction) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: existingAction!.action.type,
            status: "accepted",
          });
          broadcastSnapshot(currentConnection.gameId);
          return;
        }

        const beforeAction = room.toRecord();
        const result = room.submitAction(
          currentConnection.token,
          message.action,
          message.clientActionId
        );
        if (!result.ok) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: result.error.code,
          });
          sendJson(socket, {
            type: "rejected",
            clientActionId: message.clientActionId,
            error: result.error,
            snapshot: result.snapshot,
          });
          return;
        }

        const acceptedAction = room.toRecord().acceptedActions.at(-1);
        if (!acceptedAction || acceptedAction.version !== result.snapshot.version) {
          throw new Error(
            `Accepted online action for ${currentConnection.gameId} was not recorded.`
          );
        }
        if (result.snapshot.clock && !acceptedAction.clock) {
          throw new Error(
            `Accepted online action for ${currentConnection.gameId} is missing clock.`
          );
        }
        try {
          await persistActionAccepted(
            currentConnection.gameId,
            playerColor,
            acceptedAction.clientActionId,
            result.snapshot.version,
            acceptedAction.action,
            acceptedAction.playedAt,
            acceptedAction.clock
          );
        } catch (error) {
          service.replaceRoom(beforeAction);
          const restoredSnapshot =
            service.getRoom(currentConnection.gameId)?.getSnapshot() ?? result.snapshot;
          log({
            event: "online.persistence",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "failed",
            reason: "action_accepted",
          });
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "persistence_failed",
          });
          console.error("Failed to persist online game action", error);
          sendJson(socket, {
            type: "error",
            error: {
              code: "persistence_failed",
              message: "The accepted action could not be saved.",
            },
            snapshot: restoredSnapshot,
          });
          return;
        }

        log({
          event: "online.action",
          gameId: currentConnection.gameId,
          role: "player",
          action: acceptedAction.action.type,
          status: "accepted",
        });
        broadcastSnapshot(currentConnection.gameId);
      });
      return;
    }
  };

  wss.on("connection", (socket, req) => {
    const clientKey = getSocketClientKey(req);
    log({ event: "online.socket.connect", status: "connected" });

    socket.on("message", (data) => {
      handleClientMessage(socket, data, clientKey).catch((error) => {
        console.error("Unhandled online socket message error", error);
        sendSocketError(socket, {
          code: "bad_request",
          message: "The online message could not be processed.",
        });
      });
    });

    socket.on("close", () => {
      logSocketDisconnect(socket);
    });

    socket.on("error", () => {
      logSocketDisconnect(socket, "socket_error");
    });
  });

  return {
    app,
    server,
    service,
    wss,
  };
}
