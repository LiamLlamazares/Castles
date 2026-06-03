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
  projectOnlineChallengeSummaries,
  validateOnlineChallengeSummary,
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
  ONLINE_GAME_DIRECTORY_RESULT_FILTERS,
  ONLINE_GAME_DIRECTORY_SEARCH_MAX_LENGTH,
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  ONLINE_GAME_DIRECTORY_STATES,
  normalizeOnlineGameDirectorySearchQuery,
  onlineGameSummaryMatchesDirectoryFilters,
  type OnlineGameDirectoryClockFilter,
  type OnlineGameDirectoryListOptions,
  type OnlineGameDirectoryResultFilter,
  type OnlineGameDirectoryResponse,
  OnlineGameSummary,
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
  type OpenSeekDirectoryResponse,
  type OpenSeekEvent,
  type OpenSeekSeat,
  type OpenSeekSummary,
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
  isSecretLikeKey,
  stringContainsDurableSecret,
} from "../secretSafety";

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

type PublicSessionIdentity = { kind: "session"; id: string };

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
  loadGameSummary?: (gameId: string) => OnlineGameSummary | null | Promise<OnlineGameSummary | null>;
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

  for (const name of ["state", "limit", "cursor", "clock", "result", "q"]) {
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
      result: result as OnlineGameDirectoryResultFilter | undefined,
      query,
    },
  };
}

function parseOpenSeekDirectoryOptions(
  originalUrl: string
): { ok: true; options: OpenSeekDirectoryListOptions } | { ok: false; message: string } {
  const url = new URL(originalUrl, "http://localhost");
  if (hasSensitivePublicDirectoryQuery(url.searchParams)) {
    return { ok: false, message: "Public seek query is invalid." };
  }

  for (const name of ["state", "limit", "cursor", "creatorSeat", "clock", "vp"]) {
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

  return {
    ok: true,
    options: {
      state: state as OpenSeekDirectoryListOptions["state"],
      limit,
      cursor,
      creatorSeat: creatorSeat as OpenSeekSeat | undefined,
      clock: clock as OpenSeekDirectoryClockFilter | undefined,
      vp: vp as OpenSeekDirectoryVpFilter | undefined,
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

function normalizeOnlineSetupForCreation(setup: OnlineGameSetupDTO): OnlineGameSetupDTO {
  return setup.timeControl
    ? setup
    : { ...setup, timeControl: { ...DEFAULT_ONLINE_TIME_CONTROL } };
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
  return JSON.stringify(sortObjectKeys(setup));
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
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
  const connections = new Map<WebSocket, OnlineConnection>();
  const disconnectedSockets = new WeakSet<WebSocket>();
  const actionQueues = new Map<string, Promise<void>>();
  const createGameLimiter = new FixedWindowRateLimiter(20, 60_000);
  const createChallengeLimiter = new FixedWindowRateLimiter(20, 60_000);
  const createOpenSeekLimiter = new FixedWindowRateLimiter(20, 60_000);
  const quickMatchLimiter = new FixedWindowRateLimiter(20, 60_000);
  const challengeActionLimiter = new FixedWindowRateLimiter(120, 10_000);
  const openSeekActionLimiter = new FixedWindowRateLimiter(120, 10_000);
  const publicDirectoryLimiter = new FixedWindowRateLimiter(240, 10_000);
  const spectatorSnapshotLimiter = new FixedWindowRateLimiter(120, 10_000);
  const socketMessageLimiter = new FixedWindowRateLimiter(120, 10_000);
  const memoryChallengeEvents: OnlineChallengeEvent[] = [];
  const memoryChallengeCredentials = new Map<string, OnlineChallengeCredentials>();
  const memoryOpenSeekEvents: OpenSeekEvent[] = [];
  const memoryOpenSeekCredentials = new Map<string, OpenSeekCredentials>();
  const quickMatchSessionQueues = new Map<string, Promise<void>>();

  const log = (event: OnlineServerLogEvent): void => {
    try {
      options.onLog?.(event);
    } catch (error) {
      console.error("Online server log hook failed", error);
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

  const stripLivePresence = (summary: OnlineGameSummary): OnlineGameSummary => {
    if (summary.livePreview.spectatorCount === undefined) return summary;
    const { spectatorCount: _spectatorCount, ...livePreview } = summary.livePreview;
    return { ...summary, livePreview };
  };

  const withLiveServerPresence = (summary: OnlineGameSummary): OnlineGameSummary => {
    const base = stripLivePresence(summary);
    if (base.status !== "active") return base;

    const spectatorCount = countConnectedSpectators(base.gameId);
    if (spectatorCount <= 0) return base;

    return {
      ...base,
      livePreview: {
        ...base.livePreview,
        spectatorCount,
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

  const loadChallengeSummary = async (challengeId: string): Promise<OnlineChallengeSummary | null> => {
    return (await loadChallengeSummaries()).find((summary) => summary.challengeId === challengeId) ?? null;
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
    directoryOptions: OpenSeekDirectoryListOptions
  ): Promise<OpenSeekDirectoryResponse> => {
    const now = new Date(options.now?.() ?? Date.now()).toISOString();
    if (options.listOpenSeekSummaries) {
      const response = await options.listOpenSeekSummaries(directoryOptions);
      const validation = validateOpenSeekDirectoryResponse(response);
      if (!validation.ok) throw new Error(validation.error.message);
      return {
        ...validation.value,
        seeks: validation.value.seeks.filter((summary) => canListOpenSeekSummary(summary, now)),
      };
    }

    return paginateOpenSeekSummaries(await loadOpenSeekSummaries(), directoryOptions, now);
  };

  const listQuickMatchOpenSeekCandidates = async (): Promise<OpenSeekSummary[]> => {
    const candidates: OpenSeekSummary[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    do {
      const directoryOptions: OpenSeekDirectoryListOptions = {
        state: "open",
        limit: ONLINE_SEEK_DIRECTORY_MAX_LIMIT,
        ...(cursor ? { cursor } : {}),
      };
      const directory = await listPublicOpenSeekDirectory(directoryOptions);
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
    creatorIdentity: PublicSessionIdentity,
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
    identity: PublicSessionIdentity,
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
    identity: PublicSessionIdentity,
    now: string
  ): Promise<OpenSeekSummary | null> => {
    return (await loadOpenSeekSummaries()).find((summary) =>
      isActiveSeekForSession(summary, identity, now)
    ) ?? null;
  };

  const acceptOpenSeekSummary = async (
    summary: OpenSeekSummary,
    acceptorIdentity: PublicSessionIdentity,
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
      const directory = await listPublicOpenSeekDirectory(parsed.options);
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
    const creatorIdentity = normalizePublicSessionIdentity(req.body?.creatorSessionId, "creatorSessionId");
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
    const acceptorIdentity = normalizePublicSessionIdentity(req.body?.acceptorSessionId, "acceptorSessionId");
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
    const sessionIdentity = normalizePublicSessionIdentity(req.body?.sessionId, "sessionId");
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
      const response = await runQuickMatchForSession(sessionIdentity.identity.id, async () => {
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

        const candidates = await listQuickMatchOpenSeekCandidates();
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

    const normalizedSetup = setup.value.timeControl
      ? setup.value
      : {
          ...setup.value,
          timeControl: { ...DEFAULT_ONLINE_TIME_CONTROL },
        };
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
    const challengerIdentity = { kind: "session" as const, id: `${challengeId}_challenger` };
    const challengedIdentity = { kind: "session" as const, id: `${challengeId}_challenged` };

    try {
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
      res.status(201).json({
        challengeId,
        summary,
        challenger: {
          url: buildChallengeUrl(options.publicBaseUrl, challengeId, "challenger", challengerToken),
        },
        challenged: {
          url: buildChallengeUrl(options.publicBaseUrl, challengeId, "challenged", challengedToken),
        },
      });
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
      const result = await acceptChallengeAndCreateGame({
        challengeId: summary.challengeId,
        acceptedBy: auth.credential,
        acceptedAt,
        gameCreatedEvent,
        whiteIdentity,
        blackIdentity,
      });
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

    const normalizedSetup = setup.value.timeControl
      ? setup.value
      : {
          ...setup.value,
          timeControl: { ...DEFAULT_ONLINE_TIME_CONTROL },
        };

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
        whiteIdentity: { kind: "anonymous", id: `anon_${record.gameId}_w` },
        blackIdentity: { kind: "anonymous", id: `anon_${record.gameId}_b` },
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

        const room = service.getRoomForToken(currentConnection.gameId, currentConnection.token);
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
