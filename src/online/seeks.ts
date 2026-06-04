import { validateOnlineIdentity, type OnlineIdentity } from "./identity";
import { containsDurableSecret, stringContainsDurableSecret } from "./secretSafety";
import type { OnlineGameSetupDTO } from "./types";
import { validateOnlineGameSetup, type ValidationResult } from "./validation";

export const ONLINE_SEEK_EVENT_SCHEMA_VERSION = 1;
export const ONLINE_SEEK_SUMMARY_SCHEMA_VERSION = 1;
export const ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION = 1;
export const ONLINE_SEEK_DIRECTORY_DEFAULT_LIMIT = 25;
export const ONLINE_SEEK_DIRECTORY_MAX_LIMIT = 100;

export type OpenSeekSeat = "w" | "b" | "random";
export type OpenSeekStatus = "open" | "accepted" | "cancelled" | "expired";
export type OpenSeekVisibility = "public" | "followed";
export type OpenSeekDirectoryState = "open";
export type OpenSeekDirectoryClockFilter = "timed" | "casual";
export type OpenSeekDirectoryVpFilter = "enabled" | "disabled";

interface OpenSeekEventEnvelope {
  schemaVersion: typeof ONLINE_SEEK_EVENT_SCHEMA_VERSION;
  eventId: string;
  createdAt: string;
}

export type OpenSeekEvent =
  | (OpenSeekEventEnvelope & {
      type: "seek_created";
      seekId: string;
      creatorIdentity: OnlineIdentity;
      creatorSeat: OpenSeekSeat;
      setup: OnlineGameSetupDTO;
      visibility?: OpenSeekVisibility;
      expiresAt: string;
    })
  | (OpenSeekEventEnvelope & {
      type: "seek_accepted";
      seekId: string;
      acceptedBy: OnlineIdentity;
      acceptedAt: string;
      gameId: string;
      whiteIdentity: OnlineIdentity;
      blackIdentity: OnlineIdentity;
    })
  | (OpenSeekEventEnvelope & {
      type: "seek_cancelled";
      seekId: string;
      cancelledBy: OnlineIdentity;
      cancelledAt: string;
    })
  | (OpenSeekEventEnvelope & {
      type: "seek_expired";
      seekId: string;
      expiredBy: "system";
      expiredAt: string;
    });

export interface OpenSeekSummary {
  schemaVersion: typeof ONLINE_SEEK_SUMMARY_SCHEMA_VERSION;
  seekId: string;
  creatorIdentity: OnlineIdentity;
  creatorSeat: OpenSeekSeat;
  setup: OnlineGameSetupDTO;
  visibility?: OpenSeekVisibility;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: OpenSeekStatus;
  lastEventId: string;
  acceptedAt?: string;
  acceptedBy?: OnlineIdentity;
  gameId?: string;
  whiteIdentity?: OnlineIdentity;
  blackIdentity?: OnlineIdentity;
  cancelledAt?: string;
  cancelledBy?: OnlineIdentity;
  expiredAt?: string;
  expiredBy?: "system";
}

export interface OpenSeekDirectoryCursor {
  updatedAt: string;
  seekId: string;
}

export interface OpenSeekDirectoryListOptions {
  state: OpenSeekDirectoryState;
  limit: number;
  cursor?: string;
  creatorSeat?: OpenSeekSeat;
  clock?: OpenSeekDirectoryClockFilter;
  vp?: OpenSeekDirectoryVpFilter;
}

export interface OpenSeekDirectoryResponse {
  schemaVersion: typeof ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION;
  seeks: OpenSeekSummary[];
  nextCursor?: string;
}

const MAX_ID_LENGTH = 128;
const SEEK_SEATS = new Set<OpenSeekSeat>(["w", "b", "random"]);
const SEEK_STATUSES = new Set<OpenSeekStatus>(["open", "accepted", "cancelled", "expired"]);
const SEEK_VISIBILITIES = new Set<OpenSeekVisibility>(["public", "followed"]);
export const OPEN_SEEK_DIRECTORY_STATES = new Set<OpenSeekDirectoryState>(["open"]);
export const OPEN_SEEK_DIRECTORY_CLOCK_FILTERS = new Set<OpenSeekDirectoryClockFilter>([
  "timed",
  "casual",
]);
export const OPEN_SEEK_DIRECTORY_VP_FILTERS = new Set<OpenSeekDirectoryVpFilter>([
  "enabled",
  "disabled",
]);
let nextSeekEventSequence = 0;

function bad(message: string): ValidationResult<never> {
  return {
    ok: false,
    error: { code: "bad_request", message },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}

function timestamp(value: string): number {
  return Date.parse(value);
}

function validateIdentityField(value: unknown, label: string): ValidationResult<OnlineIdentity> {
  return validateOnlineIdentity(value, label);
}

function createEnvelope(metadata: Partial<OpenSeekEventEnvelope> = {}): OpenSeekEventEnvelope {
  nextSeekEventSequence += 1;
  return {
    schemaVersion: ONLINE_SEEK_EVENT_SCHEMA_VERSION,
    eventId:
      metadata.eventId ??
      `seek_evt_${Date.now().toString(36)}_${nextSeekEventSequence.toString(36)}`,
    createdAt: metadata.createdAt ?? new Date().toISOString(),
  };
}

function assertValidSeekEvent<T extends OpenSeekEvent>(event: unknown): T {
  const validation = validateOpenSeekEvent(event);
  if (!validation.ok) throw new Error(validation.error.message);
  return validation.value as T;
}

export function createOpenSeekCreatedEvent(
  event: Omit<Extract<OpenSeekEvent, { type: "seek_created" }>, keyof OpenSeekEventEnvelope>,
  metadata?: Partial<OpenSeekEventEnvelope>
): Extract<OpenSeekEvent, { type: "seek_created" }> {
  return assertValidSeekEvent({ ...event, ...createEnvelope(metadata) });
}

export function createOpenSeekAcceptedEvent(
  event: Omit<Extract<OpenSeekEvent, { type: "seek_accepted" }>, keyof OpenSeekEventEnvelope>,
  metadata?: Partial<OpenSeekEventEnvelope>
): Extract<OpenSeekEvent, { type: "seek_accepted" }> {
  return assertValidSeekEvent({
    ...event,
    ...createEnvelope({ createdAt: event.acceptedAt, ...metadata }),
  });
}

export function createOpenSeekCancelledEvent(
  event: Omit<Extract<OpenSeekEvent, { type: "seek_cancelled" }>, keyof OpenSeekEventEnvelope>,
  metadata?: Partial<OpenSeekEventEnvelope>
): Extract<OpenSeekEvent, { type: "seek_cancelled" }> {
  return assertValidSeekEvent({
    ...event,
    ...createEnvelope({ createdAt: event.cancelledAt, ...metadata }),
  });
}

export function createOpenSeekExpiredEvent(
  event: Omit<Extract<OpenSeekEvent, { type: "seek_expired" }>, keyof OpenSeekEventEnvelope>,
  metadata?: Partial<OpenSeekEventEnvelope>
): Extract<OpenSeekEvent, { type: "seek_expired" }> {
  return assertValidSeekEvent({
    ...event,
    ...createEnvelope({ createdAt: event.expiredAt, ...metadata }),
  });
}

function validateEnvelope(value: Record<string, unknown>): ValidationResult<OpenSeekEventEnvelope> {
  if (value.schemaVersion !== ONLINE_SEEK_EVENT_SCHEMA_VERSION) {
    return bad(`event.schemaVersion must be ${ONLINE_SEEK_EVENT_SCHEMA_VERSION}.`);
  }
  if (!isBoundedString(value.eventId)) return bad("event.eventId is invalid.");
  if (!isIsoDateString(value.createdAt)) return bad("event.createdAt must be a valid timestamp.");
  return {
    ok: true,
    value: {
      schemaVersion: ONLINE_SEEK_EVENT_SCHEMA_VERSION,
      eventId: value.eventId,
      createdAt: value.createdAt,
    },
  };
}

function validateTerminalTimestamp(
  eventCreatedAt: string,
  value: unknown,
  label: string
): ValidationResult<string> {
  if (!isIsoDateString(value)) return bad(`${label} must be a valid timestamp.`);
  if (value !== eventCreatedAt) return bad(`${label} must equal event.createdAt.`);
  return { ok: true, value };
}

export function validateOpenSeekEvent(value: unknown): ValidationResult<OpenSeekEvent> {
  if (!isRecord(value)) return bad("event must be an object.");
  if (containsDurableSecret(value)) {
    return bad("event must not contain token, credential, session, auth, cookie, or invite fields.");
  }
  const envelope = validateEnvelope(value);
  if (!envelope.ok) return envelope;
  if (!isBoundedString(value.seekId)) return bad("event.seekId is invalid.");
  if (typeof value.type !== "string") return bad("event.type must be a string.");

  if (value.type === "seek_created") {
    const creatorIdentity = validateIdentityField(value.creatorIdentity, "event.creatorIdentity");
    if (!creatorIdentity.ok) return creatorIdentity;
    if (!SEEK_SEATS.has(value.creatorSeat as OpenSeekSeat)) {
      return bad("event.creatorSeat must be w, b, or random.");
    }
    const setup = validateOnlineGameSetup(value.setup);
    if (!setup.ok) return setup;
    if (value.visibility !== undefined && !SEEK_VISIBILITIES.has(value.visibility as OpenSeekVisibility)) {
      return bad("event.visibility must be public or followed.");
    }
    if (!isIsoDateString(value.expiresAt)) return bad("event.expiresAt must be a valid timestamp.");
    if (timestamp(value.expiresAt) <= timestamp(envelope.value.createdAt)) {
      return bad("event.expiresAt must be later than event.createdAt.");
    }
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "seek_created",
        seekId: value.seekId,
        creatorIdentity: creatorIdentity.value,
        creatorSeat: value.creatorSeat as OpenSeekSeat,
        setup: setup.value,
        visibility: (value.visibility as OpenSeekVisibility | undefined) ?? "public",
        expiresAt: value.expiresAt,
      },
    };
  }

  if (value.type === "seek_accepted") {
    const acceptedBy = validateIdentityField(value.acceptedBy, "event.acceptedBy");
    if (!acceptedBy.ok) return acceptedBy;
    const acceptedAt = validateTerminalTimestamp(envelope.value.createdAt, value.acceptedAt, "event.acceptedAt");
    if (!acceptedAt.ok) return acceptedAt;
    if (!isBoundedString(value.gameId)) return bad("event.gameId is invalid.");
    const whiteIdentity = validateIdentityField(value.whiteIdentity, "event.whiteIdentity");
    if (!whiteIdentity.ok) return whiteIdentity;
    const blackIdentity = validateIdentityField(value.blackIdentity, "event.blackIdentity");
    if (!blackIdentity.ok) return blackIdentity;
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "seek_accepted",
        seekId: value.seekId,
        acceptedBy: acceptedBy.value,
        acceptedAt: acceptedAt.value,
        gameId: value.gameId,
        whiteIdentity: whiteIdentity.value,
        blackIdentity: blackIdentity.value,
      },
    };
  }

  if (value.type === "seek_cancelled") {
    const cancelledBy = validateIdentityField(value.cancelledBy, "event.cancelledBy");
    if (!cancelledBy.ok) return cancelledBy;
    const cancelledAt = validateTerminalTimestamp(envelope.value.createdAt, value.cancelledAt, "event.cancelledAt");
    if (!cancelledAt.ok) return cancelledAt;
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "seek_cancelled",
        seekId: value.seekId,
        cancelledBy: cancelledBy.value,
        cancelledAt: cancelledAt.value,
      },
    };
  }

  if (value.type === "seek_expired") {
    if (value.expiredBy !== "system") return bad("event.expiredBy must be system.");
    const expiredAt = validateTerminalTimestamp(envelope.value.createdAt, value.expiredAt, "event.expiredAt");
    if (!expiredAt.ok) return expiredAt;
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "seek_expired",
        seekId: value.seekId,
        expiredBy: "system",
        expiredAt: expiredAt.value,
      },
    };
  }

  return bad("event.type is not supported.");
}

export function isSameOnlineIdentity(a: OnlineIdentity, b: OnlineIdentity): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function assertOpen(summary: OpenSeekSummary, event: OpenSeekEvent): void {
  if (summary.status !== "open") {
    throw new Error(`Open seek ${event.seekId} is already terminal.`);
  }
}

function assertBeforeExpiry(summary: OpenSeekSummary, value: string): void {
  if (timestamp(value) < timestamp(summary.createdAt)) {
    throw new Error(`Open seek ${summary.seekId} terminal event is before creation.`);
  }
  if (timestamp(value) >= timestamp(summary.expiresAt)) {
    throw new Error(`Open seek ${summary.seekId} terminal event must be before expiry.`);
  }
}

function assertExpiredAtOrAfterExpiry(summary: OpenSeekSummary, value: string): void {
  if (timestamp(value) < timestamp(summary.expiresAt)) {
    throw new Error(`Open seek ${summary.seekId} expiry event must be at or after expiry.`);
  }
}

function assertAcceptedSeatBinding(
  summary: Pick<OpenSeekSummary, "seekId" | "creatorIdentity" | "creatorSeat">,
  event: Pick<Extract<OpenSeekEvent, { type: "seek_accepted" }>, "acceptedBy" | "whiteIdentity" | "blackIdentity">
): void {
  if (isSameOnlineIdentity(summary.creatorIdentity, event.acceptedBy)) {
    throw new Error(`Creator cannot accept their own open seek ${summary.seekId}.`);
  }
  const creatorWhite = isSameOnlineIdentity(summary.creatorIdentity, event.whiteIdentity);
  const creatorBlack = isSameOnlineIdentity(summary.creatorIdentity, event.blackIdentity);
  const acceptorWhite = isSameOnlineIdentity(event.acceptedBy, event.whiteIdentity);
  const acceptorBlack = isSameOnlineIdentity(event.acceptedBy, event.blackIdentity);
  if (summary.creatorSeat === "w" && !(creatorWhite && acceptorBlack)) {
    throw new Error(`Open seek ${summary.seekId} creator must be white and acceptor must be black.`);
  }
  if (summary.creatorSeat === "b" && !(creatorBlack && acceptorWhite)) {
    throw new Error(`Open seek ${summary.seekId} creator must be black and acceptor must be white.`);
  }
  if (
    summary.creatorSeat === "random" &&
    !((creatorWhite && acceptorBlack) || (creatorBlack && acceptorWhite))
  ) {
    throw new Error(`Open seek ${summary.seekId} must bind creator and acceptor to opposite seats.`);
  }
}

export function projectOpenSeekSummaries(events: OpenSeekEvent[]): OpenSeekSummary[] {
  const summaries = new Map<string, OpenSeekSummary>();
  const seenEventIds = new Set<string>();

  for (const rawEvent of events) {
    const validation = validateOpenSeekEvent(rawEvent);
    if (!validation.ok) throw new Error(validation.error.message);
    const event = validation.value;
    if (seenEventIds.has(event.eventId)) throw new Error(`Duplicate open seek event id ${event.eventId}.`);
    seenEventIds.add(event.eventId);

    if (event.type === "seek_created") {
      if (summaries.has(event.seekId)) {
        throw new Error(`Duplicate open seek creation event for ${event.seekId}.`);
      }
      summaries.set(event.seekId, {
        schemaVersion: ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
        seekId: event.seekId,
        creatorIdentity: event.creatorIdentity,
        creatorSeat: event.creatorSeat,
        setup: event.setup,
        visibility: event.visibility ?? "public",
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        expiresAt: event.expiresAt,
        status: "open",
        lastEventId: event.eventId,
      });
      continue;
    }

    const summary = summaries.get(event.seekId);
    if (!summary) {
      throw new Error(`Open seek lifecycle event references missing seek ${event.seekId}.`);
    }
    assertOpen(summary, event);

    if (event.type === "seek_accepted") {
      assertBeforeExpiry(summary, event.acceptedAt);
      assertAcceptedSeatBinding(summary, event);
      summary.status = "accepted";
      summary.updatedAt = event.createdAt;
      summary.acceptedAt = event.acceptedAt;
      summary.acceptedBy = event.acceptedBy;
      summary.gameId = event.gameId;
      summary.whiteIdentity = event.whiteIdentity;
      summary.blackIdentity = event.blackIdentity;
      summary.lastEventId = event.eventId;
      continue;
    }

    if (event.type === "seek_cancelled") {
      if (!isSameOnlineIdentity(event.cancelledBy, summary.creatorIdentity)) {
        throw new Error(`Open seek ${event.seekId} must be cancelled by its creator.`);
      }
      assertBeforeExpiry(summary, event.cancelledAt);
      summary.status = "cancelled";
      summary.updatedAt = event.createdAt;
      summary.cancelledAt = event.cancelledAt;
      summary.cancelledBy = event.cancelledBy;
      summary.lastEventId = event.eventId;
      continue;
    }

    assertExpiredAtOrAfterExpiry(summary, event.expiredAt);
    summary.status = "expired";
    summary.updatedAt = event.createdAt;
    summary.expiredAt = event.expiredAt;
    summary.expiredBy = "system";
    summary.lastEventId = event.eventId;
  }

  return Array.from(summaries.values());
}

function hasAnyDefined(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => value[key] !== undefined);
}

function validateSummaryTerminalTimestamp(
  value: unknown,
  updatedAt: string,
  label: string
): ValidationResult<string> {
  if (!isIsoDateString(value)) return bad(`${label} must be a valid timestamp.`);
  if (value !== updatedAt) return bad(`${label} must equal summary.updatedAt.`);
  return { ok: true, value };
}

function validateSummaryBeforeExpiry(summary: OpenSeekSummary, value: string): ValidationResult<string> {
  if (timestamp(value) < timestamp(summary.createdAt)) {
    return bad("summary terminal timestamp is before creation.");
  }
  if (timestamp(value) >= timestamp(summary.expiresAt)) {
    return bad("summary terminal timestamp must be before expiry.");
  }
  return { ok: true, value };
}

function validateSummaryExpiredAtOrAfterExpiry(summary: OpenSeekSummary, value: string): ValidationResult<string> {
  if (timestamp(value) < timestamp(summary.expiresAt)) {
    return bad("summary.expiredAt must be at or after expiry.");
  }
  return { ok: true, value };
}

export function validateOpenSeekSummary(value: unknown): ValidationResult<OpenSeekSummary> {
  if (!isRecord(value)) return bad("summary must be an object.");
  if (containsDurableSecret(value)) {
    return bad("summary must not contain token, credential, session, auth, cookie, or invite fields.");
  }
  if (value.schemaVersion !== ONLINE_SEEK_SUMMARY_SCHEMA_VERSION) {
    return bad(`summary.schemaVersion must be ${ONLINE_SEEK_SUMMARY_SCHEMA_VERSION}.`);
  }
  if (!isBoundedString(value.seekId)) return bad("summary.seekId is invalid.");
  const creatorIdentity = validateIdentityField(value.creatorIdentity, "summary.creatorIdentity");
  if (!creatorIdentity.ok) return creatorIdentity;
  if (!SEEK_SEATS.has(value.creatorSeat as OpenSeekSeat)) {
    return bad("summary.creatorSeat must be w, b, or random.");
  }
  const setup = validateOnlineGameSetup(value.setup);
  if (!setup.ok) return setup;
  const visibility =
    value.visibility === undefined ? "public" : value.visibility;
  if (!SEEK_VISIBILITIES.has(visibility as OpenSeekVisibility)) {
    return bad("summary.visibility must be public or followed.");
  }
  if (!isIsoDateString(value.createdAt)) return bad("summary.createdAt must be a valid timestamp.");
  if (!isIsoDateString(value.updatedAt)) return bad("summary.updatedAt must be a valid timestamp.");
  if (!isIsoDateString(value.expiresAt)) return bad("summary.expiresAt must be a valid timestamp.");
  if (timestamp(value.updatedAt) < timestamp(value.createdAt)) {
    return bad("summary.updatedAt must not be before createdAt.");
  }
  if (timestamp(value.expiresAt) <= timestamp(value.createdAt)) {
    return bad("summary.expiresAt must be later than createdAt.");
  }
  if (typeof value.status !== "string" || !SEEK_STATUSES.has(value.status as OpenSeekStatus)) {
    return bad("summary.status is invalid.");
  }
  if (!isBoundedString(value.lastEventId)) return bad("summary.lastEventId is invalid.");

  const acceptedKeys = ["acceptedAt", "acceptedBy", "gameId", "whiteIdentity", "blackIdentity"];
  const cancelledKeys = ["cancelledAt", "cancelledBy"];
  const expiredKeys = ["expiredAt", "expiredBy"];
  const status = value.status as OpenSeekStatus;
  if (status !== "accepted" && hasAnyDefined(value, acceptedKeys)) {
    return bad("summary.accepted fields are only allowed for accepted seeks.");
  }
  if (status !== "cancelled" && hasAnyDefined(value, cancelledKeys)) {
    return bad("summary.cancelled fields are only allowed for cancelled seeks.");
  }
  if (status !== "expired" && hasAnyDefined(value, expiredKeys)) {
    return bad("summary.expired fields are only allowed for expired seeks.");
  }

  const base: Omit<
    OpenSeekSummary,
    | "acceptedAt"
    | "acceptedBy"
    | "gameId"
    | "whiteIdentity"
    | "blackIdentity"
    | "cancelledAt"
    | "cancelledBy"
    | "expiredAt"
    | "expiredBy"
  > = {
    schemaVersion: ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
    seekId: value.seekId,
    creatorIdentity: creatorIdentity.value,
    creatorSeat: value.creatorSeat as OpenSeekSeat,
    setup: setup.value,
    visibility: visibility as OpenSeekVisibility,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
    status,
    lastEventId: value.lastEventId,
  };

  if (status === "open") return { ok: true, value: base };

  if (status === "accepted") {
    if (!isBoundedString(value.gameId)) return bad("summary.gameId is invalid.");
    const acceptedAt = validateSummaryTerminalTimestamp(value.acceptedAt, value.updatedAt, "summary.acceptedAt");
    if (!acceptedAt.ok) return acceptedAt;
    const acceptedTiming = validateSummaryBeforeExpiry(base, acceptedAt.value);
    if (!acceptedTiming.ok) return acceptedTiming;
    const acceptedBy = validateIdentityField(value.acceptedBy, "summary.acceptedBy");
    if (!acceptedBy.ok) return acceptedBy;
    const whiteIdentity = validateIdentityField(value.whiteIdentity, "summary.whiteIdentity");
    if (!whiteIdentity.ok) return whiteIdentity;
    const blackIdentity = validateIdentityField(value.blackIdentity, "summary.blackIdentity");
    if (!blackIdentity.ok) return blackIdentity;
    try {
      assertAcceptedSeatBinding(base, {
        acceptedBy: acceptedBy.value,
        whiteIdentity: whiteIdentity.value,
        blackIdentity: blackIdentity.value,
      });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "summary accepted seats are invalid.");
    }
    return {
      ok: true,
      value: {
        ...base,
        acceptedAt: acceptedAt.value,
        acceptedBy: acceptedBy.value,
        gameId: value.gameId,
        whiteIdentity: whiteIdentity.value,
        blackIdentity: blackIdentity.value,
      },
    };
  }

  if (status === "cancelled") {
    const cancelledAt = validateSummaryTerminalTimestamp(value.cancelledAt, value.updatedAt, "summary.cancelledAt");
    if (!cancelledAt.ok) return cancelledAt;
    const cancelledTiming = validateSummaryBeforeExpiry(base, cancelledAt.value);
    if (!cancelledTiming.ok) return cancelledTiming;
    const cancelledBy = validateIdentityField(value.cancelledBy, "summary.cancelledBy");
    if (!cancelledBy.ok) return cancelledBy;
    if (!isSameOnlineIdentity(cancelledBy.value, creatorIdentity.value)) {
      return bad("summary.cancelledBy must be the creator identity.");
    }
    return {
      ok: true,
      value: { ...base, cancelledAt: cancelledAt.value, cancelledBy: cancelledBy.value },
    };
  }

  const expiredAt = validateSummaryTerminalTimestamp(value.expiredAt, value.updatedAt, "summary.expiredAt");
  if (!expiredAt.ok) return expiredAt;
  const expiredTiming = validateSummaryExpiredAtOrAfterExpiry(base, expiredAt.value);
  if (!expiredTiming.ok) return expiredTiming;
  if (value.expiredBy !== "system") return bad("summary.expiredBy must be system.");
  return {
    ok: true,
    value: { ...base, expiredAt: expiredAt.value, expiredBy: "system" },
  };
}

function parseNow(value: string | number | Date): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : value instanceof Date
        ? value.getTime()
        : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canActBeforeExpiry(summary: OpenSeekSummary, now: string | number | Date): boolean {
  if (summary.status !== "open") return false;
  const nowTimestamp = parseNow(now);
  if (nowTimestamp === null) return false;
  return nowTimestamp >= timestamp(summary.createdAt) && nowTimestamp < timestamp(summary.expiresAt);
}

export function canIdentityAcceptOpenSeek(
  summary: OpenSeekSummary,
  identity: OnlineIdentity,
  now: string | number | Date
): boolean {
  return canActBeforeExpiry(summary, now) && !isSameOnlineIdentity(summary.creatorIdentity, identity);
}

export function canIdentityCancelOpenSeek(
  summary: OpenSeekSummary,
  identity: OnlineIdentity,
  now: string | number | Date
): boolean {
  return canActBeforeExpiry(summary, now) && isSameOnlineIdentity(summary.creatorIdentity, identity);
}

export function canSystemExpireOpenSeek(
  summary: OpenSeekSummary,
  now: string | number | Date
): boolean {
  if (summary.status !== "open") return false;
  const nowTimestamp = parseNow(now);
  if (nowTimestamp === null) return false;
  return nowTimestamp >= timestamp(summary.expiresAt);
}

export function canListOpenSeekSummary(
  summary: OpenSeekSummary,
  now: string | number | Date = Date.now()
): boolean {
  return canActBeforeExpiry(summary, now);
}

export function openSeekMatchesDirectoryFilters(
  summary: OpenSeekSummary,
  options: Pick<OpenSeekDirectoryListOptions, "creatorSeat" | "clock" | "vp">
): boolean {
  if (options.creatorSeat && summary.creatorSeat !== options.creatorSeat) return false;
  if (options.clock === "timed" && !summary.setup.timeControl) return false;
  if (options.clock === "casual" && summary.setup.timeControl) return false;
  const vpEnabled = summary.setup.gameRules?.vpModeEnabled === true;
  if (options.vp === "enabled" && !vpEnabled) return false;
  if (options.vp === "disabled" && vpEnabled) return false;
  return true;
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

export function encodeOpenSeekDirectoryCursor(value: OpenSeekDirectoryCursor): string {
  return encodeBase64Url(JSON.stringify([value.updatedAt, value.seekId]));
}

export function decodeOpenSeekDirectoryCursor(
  value: unknown
): ValidationResult<OpenSeekDirectoryCursor> {
  if (!isBoundedString(value, 512)) return bad("seek directory cursor is invalid.");
  const decoded = decodeBase64Url(value);
  if (!decoded) return bad("seek directory cursor is invalid.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return bad("seek directory cursor is invalid.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    !isIsoDateString(parsed[0]) ||
    !isBoundedString(parsed[1]) ||
    !/^[A-Za-z0-9_-]+$/.test(parsed[1]) ||
    stringContainsDurableSecret(parsed[1])
  ) {
    return bad("seek directory cursor is invalid.");
  }
  return { ok: true, value: { updatedAt: parsed[0], seekId: parsed[1] } };
}

export function validateOpenSeekDirectoryResponse(
  value: unknown
): ValidationResult<OpenSeekDirectoryResponse> {
  if (!isRecord(value)) return bad("seek directory response must be an object.");
  if (value.schemaVersion !== ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION) {
    return bad(`seek directory schemaVersion must be ${ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(value.seeks)) return bad("seek directory seeks must be an array.");
  const seeks: OpenSeekSummary[] = [];
  for (const rawSummary of value.seeks) {
    const validation = validateOpenSeekSummary(rawSummary);
    if (!validation.ok) return validation;
    seeks.push(validation.value);
  }
  if (value.nextCursor !== undefined) {
    const cursor = decodeOpenSeekDirectoryCursor(value.nextCursor);
    if (!cursor.ok) return cursor;
  }
  return {
    ok: true,
    value: {
      schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
      seeks,
      nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : undefined,
    },
  };
}
