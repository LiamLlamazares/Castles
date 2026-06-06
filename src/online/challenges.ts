import {
  validateOnlineIdentity,
  type OnlineIdentity,
} from "./identity";
import { containsDurableSecret } from "./secretSafety";
import {
  validateOnlineGameId,
  validateOnlineGameSetup,
  type ValidationResult,
} from "./validation";
import type { OnlineGameSetupDTO } from "./types";

export const ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION = 1;
export const ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION = 1;
export const ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION = 1;

export type OnlineChallengeStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";
export type OnlineChallengeVisibility = "private" | "unlisted";
export type OnlineChallengeSeat = "w" | "b" | "random";
export type OnlineChallengeIntent = "challenge" | "rematch";
export type OnlineAccountChallengeDirectoryState = "pending" | "all";
export type OnlineAccountChallengeRole = "challenger" | "challenged";

declare const authenticatedOnlineIdentityBrand: unique symbol;
export type AuthenticatedOnlineIdentity = OnlineIdentity & {
  readonly [authenticatedOnlineIdentityBrand]: "server-authenticated";
};

interface OnlineChallengeEventEnvelope {
  schemaVersion: typeof ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION;
  eventId: string;
  createdAt: string;
}

export type OnlineChallengeEvent =
  | (OnlineChallengeEventEnvelope & {
      type: "challenge_created";
      challengeId: string;
      challengerIdentity: OnlineIdentity;
      challengedIdentity: OnlineIdentity;
      challengerSeat: OnlineChallengeSeat;
      visibility: OnlineChallengeVisibility;
      intent?: OnlineChallengeIntent;
      sourceGameId?: string;
      setup: OnlineGameSetupDTO;
      expiresAt: string;
    })
  | (OnlineChallengeEventEnvelope & {
      type: "challenge_accepted";
      challengeId: string;
      acceptedBy: OnlineIdentity;
      acceptedAt: string;
      gameId: string;
      whiteIdentity: OnlineIdentity;
      blackIdentity: OnlineIdentity;
    })
  | (OnlineChallengeEventEnvelope & {
      type: "challenge_declined";
      challengeId: string;
      declinedBy: OnlineIdentity;
      declinedAt: string;
    })
  | (OnlineChallengeEventEnvelope & {
      type: "challenge_cancelled";
      challengeId: string;
      cancelledBy: OnlineIdentity;
      cancelledAt: string;
    })
  | (OnlineChallengeEventEnvelope & {
      type: "challenge_expired";
      challengeId: string;
      expiredBy: "system";
      expiredAt: string;
    });

export interface OnlineChallengeSummary {
  schemaVersion: typeof ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION;
  challengeId: string;
  challengerIdentity: OnlineIdentity;
  challengedIdentity: OnlineIdentity;
  challengerSeat: OnlineChallengeSeat;
  visibility: OnlineChallengeVisibility;
  intent?: OnlineChallengeIntent;
  sourceGameId?: string;
  setup: OnlineGameSetupDTO;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: OnlineChallengeStatus;
  lastEventId: string;
  acceptedAt?: string;
  acceptedBy?: OnlineIdentity;
  gameId?: string;
  whiteIdentity?: OnlineIdentity;
  blackIdentity?: OnlineIdentity;
  declinedAt?: string;
  declinedBy?: OnlineIdentity;
  cancelledAt?: string;
  cancelledBy?: OnlineIdentity;
  expiredAt?: string;
  expiredBy?: "system";
}

export interface OnlineAccountChallengeListItem {
  role: OnlineAccountChallengeRole;
  summary: OnlineChallengeSummary;
}

export interface OnlineAccountChallengeDirectoryResponse {
  schemaVersion: typeof ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION;
  challenges: OnlineAccountChallengeListItem[];
}

const MAX_ID_LENGTH = 128;
const CHALLENGE_VISIBILITIES = new Set<OnlineChallengeVisibility>(["private", "unlisted"]);
const CHALLENGE_SEATS = new Set<OnlineChallengeSeat>(["w", "b", "random"]);
const CHALLENGE_INTENTS = new Set<OnlineChallengeIntent>(["challenge", "rematch"]);
export const ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_STATES = new Set<OnlineAccountChallengeDirectoryState>([
  "pending",
  "all",
]);
const CHALLENGE_STATUSES = new Set<OnlineChallengeStatus>([
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
]);
const CHALLENGE_SUMMARY_KEYS = new Set([
  "schemaVersion",
  "challengeId",
  "challengerIdentity",
  "challengedIdentity",
  "challengerSeat",
  "visibility",
  "intent",
  "sourceGameId",
  "setup",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "status",
  "lastEventId",
  "acceptedAt",
  "acceptedBy",
  "gameId",
  "whiteIdentity",
  "blackIdentity",
  "declinedAt",
  "declinedBy",
  "cancelledAt",
  "cancelledBy",
  "expiredAt",
  "expiredBy",
]);
const ACCOUNT_CHALLENGE_DIRECTORY_KEYS = new Set(["protocolVersion", "schemaVersion", "challenges"]);
const ACCOUNT_CHALLENGE_LIST_ITEM_KEYS = new Set(["role", "summary"]);
let nextChallengeEventSequence = 0;

function bad(message: string): ValidationResult<never> {
  return {
    ok: false,
    error: {
      code: "bad_request",
      message,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  label: string
): ValidationResult<void> {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return bad(`${label} contains unsupported data.`);
    }
  }
  return { ok: true, value: undefined };
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function timestamp(value: string): number {
  return Date.parse(value);
}

function isChallengeSeat(value: unknown): value is OnlineChallengeSeat {
  return typeof value === "string" && CHALLENGE_SEATS.has(value as OnlineChallengeSeat);
}

function isChallengeVisibility(value: unknown): value is OnlineChallengeVisibility {
  return typeof value === "string" && CHALLENGE_VISIBILITIES.has(value as OnlineChallengeVisibility);
}

function validateChallengeIntent(value: unknown, label: string): ValidationResult<OnlineChallengeIntent | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value === "string" && CHALLENGE_INTENTS.has(value as OnlineChallengeIntent)) {
    return { ok: true, value: value as OnlineChallengeIntent };
  }
  return bad(`${label} must be challenge or rematch.`);
}

function validateOptionalSourceGameId(value: unknown, label: string): ValidationResult<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  const gameId = validateOnlineGameId(value, label);
  if (!gameId.ok) return gameId;
  return { ok: true, value: gameId.value };
}

function createEnvelope(
  metadata: Partial<OnlineChallengeEventEnvelope> = {}
): OnlineChallengeEventEnvelope {
  nextChallengeEventSequence += 1;
  return {
    schemaVersion: ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION,
    eventId:
      metadata.eventId ??
      `challenge_evt_${Date.now().toString(36)}_${nextChallengeEventSequence.toString(36)}`,
    createdAt: metadata.createdAt ?? new Date().toISOString(),
  };
}

export function createChallengeCreatedEvent(
  event: Omit<Extract<OnlineChallengeEvent, { type: "challenge_created" }>, keyof OnlineChallengeEventEnvelope>,
  metadata?: Partial<OnlineChallengeEventEnvelope>
): Extract<OnlineChallengeEvent, { type: "challenge_created" }> {
  return assertValidChallengeEvent({
    ...event,
    ...createEnvelope(metadata),
  });
}

export function createChallengeAcceptedEvent(
  event: Omit<Extract<OnlineChallengeEvent, { type: "challenge_accepted" }>, keyof OnlineChallengeEventEnvelope>,
  metadata?: Partial<OnlineChallengeEventEnvelope>
): Extract<OnlineChallengeEvent, { type: "challenge_accepted" }> {
  return assertValidChallengeEvent({
    ...event,
    ...createEnvelope({ createdAt: event.acceptedAt, ...metadata }),
  });
}

export function createChallengeDeclinedEvent(
  event: Omit<Extract<OnlineChallengeEvent, { type: "challenge_declined" }>, keyof OnlineChallengeEventEnvelope>,
  metadata?: Partial<OnlineChallengeEventEnvelope>
): Extract<OnlineChallengeEvent, { type: "challenge_declined" }> {
  return assertValidChallengeEvent({
    ...event,
    ...createEnvelope({ createdAt: event.declinedAt, ...metadata }),
  });
}

export function createChallengeCancelledEvent(
  event: Omit<Extract<OnlineChallengeEvent, { type: "challenge_cancelled" }>, keyof OnlineChallengeEventEnvelope>,
  metadata?: Partial<OnlineChallengeEventEnvelope>
): Extract<OnlineChallengeEvent, { type: "challenge_cancelled" }> {
  return assertValidChallengeEvent({
    ...event,
    ...createEnvelope({ createdAt: event.cancelledAt, ...metadata }),
  });
}

export function createChallengeExpiredEvent(
  event: Omit<Extract<OnlineChallengeEvent, { type: "challenge_expired" }>, keyof OnlineChallengeEventEnvelope>,
  metadata?: Partial<OnlineChallengeEventEnvelope>
): Extract<OnlineChallengeEvent, { type: "challenge_expired" }> {
  return assertValidChallengeEvent({
    ...event,
    ...createEnvelope({ createdAt: event.expiredAt, ...metadata }),
  });
}

function assertValidChallengeEvent<T extends OnlineChallengeEvent>(event: unknown): T {
  const validation = validateOnlineChallengeEvent(event);
  if (!validation.ok) throw new Error(validation.error.message);
  return validation.value as T;
}

function validateEnvelope(value: Record<string, unknown>): ValidationResult<OnlineChallengeEventEnvelope> {
  if (value.schemaVersion !== ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION) {
    return bad(`event.schemaVersion must be ${ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION}.`);
  }
  if (!isBoundedString(value.eventId, MAX_ID_LENGTH)) {
    return bad("event.eventId is invalid.");
  }
  if (!isIsoDateString(value.createdAt)) {
    return bad("event.createdAt must be a valid timestamp.");
  }
  return {
    ok: true,
    value: {
      schemaVersion: ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION,
      eventId: value.eventId,
      createdAt: value.createdAt,
    },
  };
}

function validateChallengeId(value: unknown): ValidationResult<string> {
  if (!isBoundedString(value, MAX_ID_LENGTH)) return bad("event.challengeId is invalid.");
  return { ok: true, value };
}

function validateIdentityField(value: unknown, label: string): ValidationResult<OnlineIdentity> {
  const identity = validateOnlineIdentity(value, label);
  if (!identity.ok) return identity;
  return identity;
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

export function validateOnlineChallengeEvent(value: unknown): ValidationResult<OnlineChallengeEvent> {
  if (!isRecord(value)) return bad("event must be an object.");
  if (containsDurableSecret(value)) {
    return bad("event must not contain token, credential, session, auth, cookie, or invite fields.");
  }
  const envelope = validateEnvelope(value);
  if (!envelope.ok) return envelope;
  if (typeof value.type !== "string") return bad("event.type must be a string.");
  const challengeId = validateChallengeId(value.challengeId);
  if (!challengeId.ok) return challengeId;

  if (value.type === "challenge_created") {
    const challengerIdentity = validateIdentityField(
      value.challengerIdentity,
      "event.challengerIdentity"
    );
    if (!challengerIdentity.ok) return challengerIdentity;
    const challengedIdentity = validateIdentityField(
      value.challengedIdentity,
      "event.challengedIdentity"
    );
    if (!challengedIdentity.ok) return challengedIdentity;
    if (isSameOnlineIdentity(challengerIdentity.value, challengedIdentity.value)) {
      return bad("event.challenge_created must not challenge the same identity.");
    }
    if (!isChallengeSeat(value.challengerSeat)) {
      return bad("event.challengerSeat must be w, b, or random.");
    }
    if (!isChallengeVisibility(value.visibility)) {
      return bad("event.visibility must be private or unlisted.");
    }
    const intent = validateChallengeIntent(value.intent, "event.intent");
    if (!intent.ok) return intent;
    const sourceGameId = validateOptionalSourceGameId(value.sourceGameId, "event.sourceGameId");
    if (!sourceGameId.ok) return sourceGameId;
    if (sourceGameId.value && intent.value !== "rematch") {
      return bad("event.sourceGameId is only allowed for rematch challenges.");
    }
    const setup = validateOnlineGameSetup(value.setup);
    if (!setup.ok) return setup;
    if (!isIsoDateString(value.expiresAt)) {
      return bad("event.expiresAt must be a valid timestamp.");
    }
    if (timestamp(value.expiresAt) <= timestamp(envelope.value.createdAt)) {
      return bad("event.expiresAt must be later than event.createdAt.");
    }
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "challenge_created",
        challengeId: challengeId.value,
        challengerIdentity: challengerIdentity.value,
        challengedIdentity: challengedIdentity.value,
        challengerSeat: value.challengerSeat,
        visibility: value.visibility,
        ...(intent.value ? { intent: intent.value } : {}),
        ...(sourceGameId.value ? { sourceGameId: sourceGameId.value } : {}),
        setup: setup.value,
        expiresAt: value.expiresAt,
      },
    };
  }

  if (value.type === "challenge_accepted") {
    if (!isBoundedString(value.gameId, MAX_ID_LENGTH)) {
      return bad("event.gameId is invalid.");
    }
    const acceptedBy = validateIdentityField(value.acceptedBy, "event.acceptedBy");
    if (!acceptedBy.ok) return acceptedBy;
    const acceptedAt = validateTerminalTimestamp(
      envelope.value.createdAt,
      value.acceptedAt,
      "event.acceptedAt"
    );
    if (!acceptedAt.ok) return acceptedAt;
    const whiteIdentity = validateIdentityField(value.whiteIdentity, "event.whiteIdentity");
    if (!whiteIdentity.ok) return whiteIdentity;
    const blackIdentity = validateIdentityField(value.blackIdentity, "event.blackIdentity");
    if (!blackIdentity.ok) return blackIdentity;
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "challenge_accepted",
        challengeId: challengeId.value,
        acceptedBy: acceptedBy.value,
        acceptedAt: acceptedAt.value,
        gameId: value.gameId,
        whiteIdentity: whiteIdentity.value,
        blackIdentity: blackIdentity.value,
      },
    };
  }

  if (value.type === "challenge_declined") {
    const declinedBy = validateIdentityField(value.declinedBy, "event.declinedBy");
    if (!declinedBy.ok) return declinedBy;
    const declinedAt = validateTerminalTimestamp(
      envelope.value.createdAt,
      value.declinedAt,
      "event.declinedAt"
    );
    if (!declinedAt.ok) return declinedAt;
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "challenge_declined",
        challengeId: challengeId.value,
        declinedBy: declinedBy.value,
        declinedAt: declinedAt.value,
      },
    };
  }

  if (value.type === "challenge_cancelled") {
    const cancelledBy = validateIdentityField(value.cancelledBy, "event.cancelledBy");
    if (!cancelledBy.ok) return cancelledBy;
    const cancelledAt = validateTerminalTimestamp(
      envelope.value.createdAt,
      value.cancelledAt,
      "event.cancelledAt"
    );
    if (!cancelledAt.ok) return cancelledAt;
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "challenge_cancelled",
        challengeId: challengeId.value,
        cancelledBy: cancelledBy.value,
        cancelledAt: cancelledAt.value,
      },
    };
  }

  if (value.type === "challenge_expired") {
    if (value.expiredBy !== "system") return bad("event.expiredBy must be system.");
    const expiredAt = validateTerminalTimestamp(
      envelope.value.createdAt,
      value.expiredAt,
      "event.expiredAt"
    );
    if (!expiredAt.ok) return expiredAt;
    return {
      ok: true,
      value: {
        ...envelope.value,
        type: "challenge_expired",
        challengeId: challengeId.value,
        expiredBy: "system",
        expiredAt: expiredAt.value,
      },
    };
  }

  return bad("event.type is not supported.");
}

function assertPending(summary: OnlineChallengeSummary, event: OnlineChallengeEvent): void {
  if (summary.status !== "pending") {
    throw new Error(`Online challenge ${event.challengeId} is already terminal.`);
  }
}

function assertBeforeExpiry(summary: OnlineChallengeSummary, timestampValue: string): void {
  if (timestamp(timestampValue) < timestamp(summary.createdAt)) {
    throw new Error(`Online challenge ${summary.challengeId} terminal timestamp is before creation.`);
  }
  if (timestamp(timestampValue) >= timestamp(summary.expiresAt)) {
    throw new Error(`Online challenge ${summary.challengeId} terminal timestamp must be before expiry.`);
  }
}

function assertExpiredAtOrAfterExpiry(summary: OnlineChallengeSummary, timestampValue: string): void {
  if (timestamp(timestampValue) < timestamp(summary.expiresAt)) {
    throw new Error(`Online challenge ${summary.challengeId} expiredAt must be at or after expiry.`);
  }
}

function assertAcceptedSeatBinding(
  summary: OnlineChallengeSummary,
  event: Extract<OnlineChallengeEvent, { type: "challenge_accepted" }>
): void {
  const whiteIsChallenger = isSameOnlineIdentity(event.whiteIdentity, summary.challengerIdentity);
  const whiteIsChallenged = isSameOnlineIdentity(event.whiteIdentity, summary.challengedIdentity);
  const blackIsChallenger = isSameOnlineIdentity(event.blackIdentity, summary.challengerIdentity);
  const blackIsChallenged = isSameOnlineIdentity(event.blackIdentity, summary.challengedIdentity);
  const challengerWhite = whiteIsChallenger && blackIsChallenged;
  const challengerBlack = whiteIsChallenged && blackIsChallenger;

  if (summary.challengerSeat === "w" && !challengerWhite) {
    throw new Error(
      `Accepted challenge ${summary.challengeId} challenger must be white and challenged must be black.`
    );
  }
  if (summary.challengerSeat === "b" && !challengerBlack) {
    throw new Error(
      `Accepted challenge ${summary.challengeId} challenger must be black and challenged must be white.`
    );
  }
  if (summary.challengerSeat === "random" && !challengerWhite && !challengerBlack) {
    throw new Error(
      `Accepted challenge ${summary.challengeId} must bind exactly the challenger and challenged identities.`
    );
  }
}

export function projectOnlineChallengeSummaries(
  events: OnlineChallengeEvent[]
): OnlineChallengeSummary[] {
  const summaries = new Map<string, OnlineChallengeSummary>();
  const seenEventIds = new Set<string>();

  for (const rawEvent of events) {
    const validation = validateOnlineChallengeEvent(rawEvent);
    if (!validation.ok) throw new Error(validation.error.message);
    const event = validation.value;
    if (seenEventIds.has(event.eventId)) {
      throw new Error(`Duplicate challenge event id ${event.eventId}.`);
    }
    seenEventIds.add(event.eventId);

    if (event.type === "challenge_created") {
      if (summaries.has(event.challengeId)) {
        throw new Error(`Duplicate challenge creation event for ${event.challengeId}.`);
      }
      summaries.set(event.challengeId, {
        schemaVersion: ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
        challengeId: event.challengeId,
        challengerIdentity: event.challengerIdentity,
        challengedIdentity: event.challengedIdentity,
        challengerSeat: event.challengerSeat,
        visibility: event.visibility,
        ...(event.intent ? { intent: event.intent } : {}),
        ...(event.sourceGameId ? { sourceGameId: event.sourceGameId } : {}),
        setup: event.setup,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        expiresAt: event.expiresAt,
        status: "pending",
        lastEventId: event.eventId,
      });
      continue;
    }

    const summary = summaries.get(event.challengeId);
    if (!summary) {
      throw new Error(`Online challenge lifecycle event references missing challenge ${event.challengeId}.`);
    }
    assertPending(summary, event);

    if (event.type === "challenge_accepted") {
      if (!isSameOnlineIdentity(event.acceptedBy, summary.challengedIdentity)) {
        throw new Error(`Online challenge ${event.challengeId} must be accepted by the challenged identity.`);
      }
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

    if (event.type === "challenge_declined") {
      if (!isSameOnlineIdentity(event.declinedBy, summary.challengedIdentity)) {
        throw new Error(`Online challenge ${event.challengeId} must be declined by the challenged identity.`);
      }
      assertBeforeExpiry(summary, event.declinedAt);
      summary.status = "declined";
      summary.updatedAt = event.createdAt;
      summary.declinedAt = event.declinedAt;
      summary.declinedBy = event.declinedBy;
      summary.lastEventId = event.eventId;
      continue;
    }

    if (event.type === "challenge_cancelled") {
      if (!isSameOnlineIdentity(event.cancelledBy, summary.challengerIdentity)) {
        throw new Error(`Online challenge ${event.challengeId} must be cancelled by the challenger identity.`);
      }
      assertBeforeExpiry(summary, event.cancelledAt);
      summary.status = "cancelled";
      summary.updatedAt = event.createdAt;
      summary.cancelledAt = event.cancelledAt;
      summary.cancelledBy = event.cancelledBy;
      summary.lastEventId = event.eventId;
      continue;
    }

    if (event.type === "challenge_expired") {
      assertExpiredAtOrAfterExpiry(summary, event.expiredAt);
      summary.status = "expired";
      summary.updatedAt = event.createdAt;
      summary.expiredAt = event.expiredAt;
      summary.expiredBy = "system";
      summary.lastEventId = event.eventId;
    }
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

function validateSummaryBeforeExpiry(
  summary: OnlineChallengeSummary,
  timestampValue: string
): ValidationResult<string> {
  if (timestamp(timestampValue) < timestamp(summary.createdAt)) {
    return bad(`summary terminal timestamp is before creation.`);
  }
  if (timestamp(timestampValue) >= timestamp(summary.expiresAt)) {
    return bad(`summary terminal timestamp must be before expiry.`);
  }
  return { ok: true, value: timestampValue };
}

function validateSummaryExpiredAtOrAfterExpiry(
  summary: OnlineChallengeSummary,
  timestampValue: string
): ValidationResult<string> {
  if (timestamp(timestampValue) < timestamp(summary.expiresAt)) {
    return bad(`summary.expiredAt must be at or after expiry.`);
  }
  return { ok: true, value: timestampValue };
}

export function validateOnlineChallengeSummary(value: unknown): ValidationResult<OnlineChallengeSummary> {
  if (!isRecord(value)) return bad("summary must be an object.");
  const allowedKeys = validateAllowedKeys(value, CHALLENGE_SUMMARY_KEYS, "summary");
  if (!allowedKeys.ok) return allowedKeys;
  if (containsDurableSecret(value)) {
    return bad("summary must not contain token, credential, session, auth, cookie, or invite fields.");
  }
  if (value.schemaVersion !== ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION) {
    return bad(`summary.schemaVersion must be ${ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION}.`);
  }
  if (!isBoundedString(value.challengeId, MAX_ID_LENGTH)) {
    return bad("summary.challengeId is invalid.");
  }
  const challengerIdentity = validateIdentityField(
    value.challengerIdentity,
    "summary.challengerIdentity"
  );
  if (!challengerIdentity.ok) return challengerIdentity;
  const challengedIdentity = validateIdentityField(
    value.challengedIdentity,
    "summary.challengedIdentity"
  );
  if (!challengedIdentity.ok) return challengedIdentity;
  if (isSameOnlineIdentity(challengerIdentity.value, challengedIdentity.value)) {
    return bad("summary must not challenge the same identity.");
  }
  if (!isChallengeSeat(value.challengerSeat)) {
    return bad("summary.challengerSeat must be w, b, or random.");
  }
  if (!isChallengeVisibility(value.visibility)) {
    return bad("summary.visibility must be private or unlisted.");
  }
  const intent = validateChallengeIntent(value.intent, "summary.intent");
  if (!intent.ok) return intent;
  const sourceGameId = validateOptionalSourceGameId(value.sourceGameId, "summary.sourceGameId");
  if (!sourceGameId.ok) return sourceGameId;
  if (sourceGameId.value && intent.value !== "rematch") {
    return bad("summary.sourceGameId is only allowed for rematch challenges.");
  }
  const setup = validateOnlineGameSetup(value.setup);
  if (!setup.ok) return setup;
  if (!isIsoDateString(value.createdAt)) {
    return bad("summary.createdAt must be a valid timestamp.");
  }
  if (!isIsoDateString(value.updatedAt)) {
    return bad("summary.updatedAt must be a valid timestamp.");
  }
  if (!isIsoDateString(value.expiresAt)) {
    return bad("summary.expiresAt must be a valid timestamp.");
  }
  if (timestamp(value.updatedAt) < timestamp(value.createdAt)) {
    return bad("summary.updatedAt must not be before createdAt.");
  }
  if (timestamp(value.expiresAt) <= timestamp(value.createdAt)) {
    return bad("summary.expiresAt must be later than createdAt.");
  }
  if (typeof value.status !== "string" || !CHALLENGE_STATUSES.has(value.status as OnlineChallengeStatus)) {
    return bad("summary.status is invalid.");
  }
  if (!isBoundedString(value.lastEventId, MAX_ID_LENGTH)) {
    return bad("summary.lastEventId is invalid.");
  }

  const acceptedKeys = ["acceptedAt", "acceptedBy", "gameId", "whiteIdentity", "blackIdentity"];
  const declinedKeys = ["declinedAt", "declinedBy"];
  const cancelledKeys = ["cancelledAt", "cancelledBy"];
  const expiredKeys = ["expiredAt", "expiredBy"];
  const status = value.status as OnlineChallengeStatus;

  if (status !== "accepted" && hasAnyDefined(value, acceptedKeys)) {
    return bad("summary.accepted fields are only allowed for accepted challenges.");
  }
  if (status !== "declined" && hasAnyDefined(value, declinedKeys)) {
    return bad("summary.declined fields are only allowed for declined challenges.");
  }
  if (status !== "cancelled" && hasAnyDefined(value, cancelledKeys)) {
    return bad("summary.cancelled fields are only allowed for cancelled challenges.");
  }
  if (status !== "expired" && hasAnyDefined(value, expiredKeys)) {
    return bad("summary.expired fields are only allowed for expired challenges.");
  }

  const summaryBase = {
    schemaVersion: ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
    challengeId: value.challengeId,
    challengerIdentity: challengerIdentity.value,
    challengedIdentity: challengedIdentity.value,
    challengerSeat: value.challengerSeat,
    visibility: value.visibility,
    ...(intent.value ? { intent: intent.value } : {}),
    ...(sourceGameId.value ? { sourceGameId: sourceGameId.value } : {}),
    setup: setup.value,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
    status,
    lastEventId: value.lastEventId,
  } satisfies Omit<
    OnlineChallengeSummary,
    | "acceptedAt"
    | "acceptedBy"
    | "gameId"
    | "whiteIdentity"
    | "blackIdentity"
    | "declinedAt"
    | "declinedBy"
    | "cancelledAt"
    | "cancelledBy"
    | "expiredAt"
    | "expiredBy"
  >;

  if (status === "pending") {
    return { ok: true, value: summaryBase };
  }

  if (status === "accepted") {
    if (!isBoundedString(value.gameId, MAX_ID_LENGTH)) return bad("summary.gameId is invalid.");
    const acceptedAt = validateSummaryTerminalTimestamp(
      value.acceptedAt,
      value.updatedAt,
      "summary.acceptedAt"
    );
    if (!acceptedAt.ok) return acceptedAt;
    const acceptedTiming = validateSummaryBeforeExpiry(summaryBase, acceptedAt.value);
    if (!acceptedTiming.ok) return acceptedTiming;
    const acceptedBy = validateIdentityField(value.acceptedBy, "summary.acceptedBy");
    if (!acceptedBy.ok) return acceptedBy;
    const whiteIdentity = validateIdentityField(value.whiteIdentity, "summary.whiteIdentity");
    if (!whiteIdentity.ok) return whiteIdentity;
    const blackIdentity = validateIdentityField(value.blackIdentity, "summary.blackIdentity");
    if (!blackIdentity.ok) return blackIdentity;
    try {
      assertAcceptedSeatBinding(summaryBase, {
        type: "challenge_accepted",
        schemaVersion: ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION,
        eventId: value.lastEventId,
        createdAt: acceptedAt.value,
        challengeId: value.challengeId,
        acceptedBy: acceptedBy.value,
        acceptedAt: acceptedAt.value,
        gameId: value.gameId,
        whiteIdentity: whiteIdentity.value,
        blackIdentity: blackIdentity.value,
      });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "summary accepted seats are invalid.");
    }
    if (!isSameOnlineIdentity(acceptedBy.value, challengedIdentity.value)) {
      return bad("summary.acceptedBy must be the challenged identity.");
    }
    return {
      ok: true,
      value: {
        ...summaryBase,
        acceptedAt: acceptedAt.value,
        acceptedBy: acceptedBy.value,
        gameId: value.gameId,
        whiteIdentity: whiteIdentity.value,
        blackIdentity: blackIdentity.value,
      },
    };
  }

  if (status === "declined") {
    const declinedAt = validateSummaryTerminalTimestamp(
      value.declinedAt,
      value.updatedAt,
      "summary.declinedAt"
    );
    if (!declinedAt.ok) return declinedAt;
    const declinedTiming = validateSummaryBeforeExpiry(summaryBase, declinedAt.value);
    if (!declinedTiming.ok) return declinedTiming;
    const declinedBy = validateIdentityField(value.declinedBy, "summary.declinedBy");
    if (!declinedBy.ok) return declinedBy;
    if (!isSameOnlineIdentity(declinedBy.value, challengedIdentity.value)) {
      return bad("summary.declinedBy must be the challenged identity.");
    }
    return { ok: true, value: { ...summaryBase, declinedAt: declinedAt.value, declinedBy: declinedBy.value } };
  }

  if (status === "cancelled") {
    const cancelledAt = validateSummaryTerminalTimestamp(
      value.cancelledAt,
      value.updatedAt,
      "summary.cancelledAt"
    );
    if (!cancelledAt.ok) return cancelledAt;
    const cancelledTiming = validateSummaryBeforeExpiry(summaryBase, cancelledAt.value);
    if (!cancelledTiming.ok) return cancelledTiming;
    const cancelledBy = validateIdentityField(value.cancelledBy, "summary.cancelledBy");
    if (!cancelledBy.ok) return cancelledBy;
    if (!isSameOnlineIdentity(cancelledBy.value, challengerIdentity.value)) {
      return bad("summary.cancelledBy must be the challenger identity.");
    }
    return { ok: true, value: { ...summaryBase, cancelledAt: cancelledAt.value, cancelledBy: cancelledBy.value } };
  }

  const expiredAt = validateSummaryTerminalTimestamp(
    value.expiredAt,
    value.updatedAt,
    "summary.expiredAt"
  );
  if (!expiredAt.ok) return expiredAt;
  const expiredTiming = validateSummaryExpiredAtOrAfterExpiry(summaryBase, expiredAt.value);
  if (!expiredTiming.ok) return expiredTiming;
  if (value.expiredBy !== "system") return bad("summary.expiredBy must be system.");
  return {
    ok: true,
    value: {
      ...summaryBase,
      expiredAt: expiredAt.value,
      expiredBy: "system",
    },
  };
}

export function onlineAccountChallengeRoleForIdentity(
  summary: OnlineChallengeSummary,
  identity: OnlineIdentity
): OnlineAccountChallengeRole | null {
  if (isSameOnlineIdentity(summary.challengerIdentity, identity)) return "challenger";
  if (isSameOnlineIdentity(summary.challengedIdentity, identity)) return "challenged";
  return null;
}

export function validateOnlineAccountChallengeDirectoryResponse(
  value: unknown
): ValidationResult<OnlineAccountChallengeDirectoryResponse> {
  if (!isRecord(value)) return bad("accountChallengeDirectory must be an object.");
  const directoryKeys = validateAllowedKeys(
    value,
    ACCOUNT_CHALLENGE_DIRECTORY_KEYS,
    "accountChallengeDirectory"
  );
  if (!directoryKeys.ok) return directoryKeys;
  if (containsDurableSecret(value)) {
    return bad("accountChallengeDirectory must not contain token, credential, session, auth, cookie, or invite fields.");
  }
  if (value.schemaVersion !== ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION) {
    return bad(
      `accountChallengeDirectory.schemaVersion must be ${ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION}.`
    );
  }
  if (!Array.isArray(value.challenges)) {
    return bad("accountChallengeDirectory.challenges must be an array.");
  }
  const challenges: OnlineAccountChallengeListItem[] = [];
  for (let index = 0; index < value.challenges.length; index++) {
    const rawItem = value.challenges[index];
    if (!isRecord(rawItem)) {
      return bad(`accountChallengeDirectory.challenges[${index}] must be an object.`);
    }
    const itemKeys = validateAllowedKeys(
      rawItem,
      ACCOUNT_CHALLENGE_LIST_ITEM_KEYS,
      `accountChallengeDirectory.challenges[${index}]`
    );
    if (!itemKeys.ok) return itemKeys;
    if (rawItem.role !== "challenger" && rawItem.role !== "challenged") {
      return bad(`accountChallengeDirectory.challenges[${index}].role is invalid.`);
    }
    const summary = validateOnlineChallengeSummary(rawItem.summary);
    if (!summary.ok) return summary;
    const actualRole = onlineAccountChallengeRoleForIdentity(
      summary.value,
      rawItem.role === "challenger" ? summary.value.challengerIdentity : summary.value.challengedIdentity
    );
    if (actualRole !== rawItem.role) {
      return bad(`accountChallengeDirectory.challenges[${index}].role does not match summary.`);
    }
    challenges.push({
      role: rawItem.role,
      summary: summary.value,
    });
  }
  return {
    ok: true,
    value: {
      schemaVersion: ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION,
      challenges,
    },
  };
}

export function isSameOnlineIdentity(a: OnlineIdentity, b: OnlineIdentity): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function isIdentityBoundToChallenge(
  summary: OnlineChallengeSummary,
  identity: OnlineIdentity
): boolean {
  return (
    isSameOnlineIdentity(summary.challengerIdentity, identity) ||
    isSameOnlineIdentity(summary.challengedIdentity, identity)
  );
}

function parseNow(value: string | number | Date): number | null {
  const timestampValue =
    typeof value === "number"
      ? value
      : value instanceof Date
        ? value.getTime()
        : Date.parse(value);
  return Number.isFinite(timestampValue) ? timestampValue : null;
}

function canActBeforeExpiry(summary: OnlineChallengeSummary, now: string | number | Date): boolean {
  if (summary.status !== "pending") return false;
  const nowTimestamp = parseNow(now);
  if (nowTimestamp === null) return false;
  return nowTimestamp >= timestamp(summary.createdAt) && nowTimestamp < timestamp(summary.expiresAt);
}

export function canIdentityAcceptChallenge(
  summary: OnlineChallengeSummary,
  identity: AuthenticatedOnlineIdentity,
  now: string | number | Date
): boolean {
  return canActBeforeExpiry(summary, now) && isSameOnlineIdentity(identity, summary.challengedIdentity);
}

export function canIdentityDeclineChallenge(
  summary: OnlineChallengeSummary,
  identity: AuthenticatedOnlineIdentity,
  now: string | number | Date
): boolean {
  return canActBeforeExpiry(summary, now) && isSameOnlineIdentity(identity, summary.challengedIdentity);
}

export function canIdentityCancelChallenge(
  summary: OnlineChallengeSummary,
  identity: AuthenticatedOnlineIdentity,
  now: string | number | Date
): boolean {
  return canActBeforeExpiry(summary, now) && isSameOnlineIdentity(identity, summary.challengerIdentity);
}

export function canSystemExpireChallenge(
  summary: OnlineChallengeSummary,
  now: string | number | Date
): boolean {
  if (summary.status !== "pending") return false;
  const nowTimestamp = parseNow(now);
  if (nowTimestamp === null) return false;
  return nowTimestamp >= timestamp(summary.expiresAt);
}
