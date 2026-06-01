import {
  validateOnlineIdentity,
  type OnlineIdentity,
} from "./readModel";
import { containsDurableSecret } from "./secretSafety";
import type { ValidationResult } from "./validation";

export const ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION = 1;

export type OnlineChallengeStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";
export type OnlineChallengeVisibility = "private" | "unlisted";
export type OnlineChallengeSeat = "w" | "b" | "random";

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
  schemaVersion: typeof ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION;
  challengeId: string;
  challengerIdentity: OnlineIdentity;
  challengedIdentity: OnlineIdentity;
  challengerSeat: OnlineChallengeSeat;
  visibility: OnlineChallengeVisibility;
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

const MAX_ID_LENGTH = 128;
const CHALLENGE_VISIBILITIES = new Set<OnlineChallengeVisibility>(["private", "unlisted"]);
const CHALLENGE_SEATS = new Set<OnlineChallengeSeat>(["w", "b", "random"]);
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
        schemaVersion: ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION,
        challengeId: event.challengeId,
        challengerIdentity: event.challengerIdentity,
        challengedIdentity: event.challengedIdentity,
        challengerSeat: event.challengerSeat,
        visibility: event.visibility,
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
