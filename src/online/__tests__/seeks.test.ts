import { describe, expect, it } from "vitest";
import type { OnlineGameSetupDTO } from "../types";
import type { OnlineIdentity } from "../readModel";
import {
  ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
  ONLINE_SEEK_EVENT_SCHEMA_VERSION,
  ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
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
  openSeekMatchesDirectoryFilters,
  projectOpenSeekSummaries,
  validateOpenSeekDirectoryResponse,
  validateOpenSeekEvent,
  validateOpenSeekSummary,
  type OpenSeekEvent,
  type OpenSeekSummary,
} from "../seeks";

const CREATED_AT = "2026-06-01T12:00:00.000Z";
const ACCEPTED_AT = "2026-06-01T12:05:00.000Z";
const CANCELLED_AT = "2026-06-01T12:06:00.000Z";
const EXPIRES_AT = "2026-06-01T12:10:00.000Z";
const EXPIRED_AT = "2026-06-01T12:10:00.000Z";

const creator: OnlineIdentity = { kind: "session", id: "anon_creator" };
const acceptor: OnlineIdentity = { kind: "session", id: "anon_acceptor" };

function setupFixture(overrides: Partial<OnlineGameSetupDTO> = {}): OnlineGameSetupDTO {
  return {
    board: { config: { nSquares: 6 }, castles: [] },
    pieces: [],
    sanctuaries: [],
    sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
    gameRules: { vpModeEnabled: false },
    initialPoolTypes: [],
    pieceTheme: "Castles",
    timeControl: { initial: 20, increment: 20 },
    ...overrides,
  };
}

function createdEvent(
  overrides: Partial<Extract<OpenSeekEvent, { type: "seek_created" }>> = {}
): Extract<OpenSeekEvent, { type: "seek_created" }> {
  return createOpenSeekCreatedEvent(
    {
      type: "seek_created",
      seekId: "seek_test",
      creatorIdentity: creator,
      creatorSeat: "random",
      setup: setupFixture(),
      expiresAt: EXPIRES_AT,
      ...overrides,
    },
    {
      eventId: overrides.eventId ?? "seek_evt_created",
      createdAt: overrides.createdAt ?? CREATED_AT,
    }
  );
}

function acceptedEvent(
  overrides: Partial<Extract<OpenSeekEvent, { type: "seek_accepted" }>> = {}
): Extract<OpenSeekEvent, { type: "seek_accepted" }> {
  return createOpenSeekAcceptedEvent(
    {
      type: "seek_accepted",
      seekId: "seek_test",
      acceptedBy: acceptor,
      acceptedAt: ACCEPTED_AT,
      gameId: "game_from_seek",
      whiteIdentity: creator,
      blackIdentity: acceptor,
      ...overrides,
    },
    {
      eventId: overrides.eventId ?? "seek_evt_accepted",
      createdAt: overrides.createdAt ?? overrides.acceptedAt ?? ACCEPTED_AT,
    }
  );
}

function cancelledEvent(
  overrides: Partial<Extract<OpenSeekEvent, { type: "seek_cancelled" }>> = {}
): Extract<OpenSeekEvent, { type: "seek_cancelled" }> {
  return createOpenSeekCancelledEvent(
    {
      type: "seek_cancelled",
      seekId: "seek_test",
      cancelledBy: creator,
      cancelledAt: CANCELLED_AT,
      ...overrides,
    },
    {
      eventId: overrides.eventId ?? "seek_evt_cancelled",
      createdAt: overrides.createdAt ?? overrides.cancelledAt ?? CANCELLED_AT,
    }
  );
}

function expiredEvent(
  overrides: Partial<Extract<OpenSeekEvent, { type: "seek_expired" }>> = {}
): Extract<OpenSeekEvent, { type: "seek_expired" }> {
  return createOpenSeekExpiredEvent(
    {
      type: "seek_expired",
      seekId: "seek_test",
      expiredBy: "system",
      expiredAt: EXPIRED_AT,
      ...overrides,
    },
    {
      eventId: overrides.eventId ?? "seek_evt_expired",
      createdAt: overrides.createdAt ?? overrides.expiredAt ?? EXPIRED_AT,
    }
  );
}

function pendingSummary(overrides: Partial<OpenSeekSummary> = {}): OpenSeekSummary {
  const [summary] = projectOpenSeekSummaries([createdEvent()]);
  return { ...summary, ...overrides };
}

describe("open seek contract", () => {
  it("creates schema-versioned token-free seek events", () => {
    const event = createdEvent({ creatorSeat: "w" });

    expect(event).toMatchObject({
      schemaVersion: ONLINE_SEEK_EVENT_SCHEMA_VERSION,
      eventId: "seek_evt_created",
      createdAt: CREATED_AT,
      type: "seek_created",
      seekId: "seek_test",
      creatorIdentity: creator,
      creatorSeat: "w",
      setup: setupFixture(),
      expiresAt: EXPIRES_AT,
    });
    expect(validateOpenSeekEvent(event).ok).toBe(true);
    expect(JSON.stringify(event)).not.toContain("token");
  });

  it("projects followed-only seek visibility while defaulting legacy seeks to public", () => {
    const followed = projectOpenSeekSummaries([createdEvent({ visibility: "followed" })])[0];
    const legacy = projectOpenSeekSummaries([
      { ...createdEvent(), visibility: undefined },
    ])[0];

    expect(followed.visibility).toBe("followed");
    expect(validateOpenSeekSummary(followed)).toMatchObject({
      ok: true,
      value: { visibility: "followed" },
    });
    expect(legacy.visibility).toBe("public");
    expect(validateOpenSeekSummary({ ...legacy, visibility: undefined })).toMatchObject({
      ok: true,
      value: { visibility: "public" },
    });
  });

  it("rejects invalid seek visibility values", () => {
    expect(validateOpenSeekEvent({ ...createdEvent(), visibility: "private" }).ok).toBe(false);
    expect(validateOpenSeekSummary({ ...pendingSummary(), visibility: "private" }).ok).toBe(false);
  });

  it("rejects durable token, credential, session secret, auth, cookie, and invite fields", () => {
    const invalidPayloads = [
      { token: "secret" },
      { credential: "secret" },
      { authorization: "Bearer secret" },
      { cookie: "sid=secret" },
      { inviteUrl: "https://castles.example/?onlineGame=game_1&token=secret" },
      { nested: { access_token: "secret" } },
    ];

    for (const payload of invalidPayloads) {
      expect(validateOpenSeekEvent({ ...createdEvent(), ...payload }).ok).toBe(false);
    }
  });

  it("projects open, accepted, cancelled, and expired summaries", () => {
    expect(projectOpenSeekSummaries([createdEvent()])[0]).toMatchObject({
      schemaVersion: ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
      seekId: "seek_test",
      creatorIdentity: creator,
      creatorSeat: "random",
      status: "open",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });

    expect(projectOpenSeekSummaries([createdEvent({ creatorSeat: "w" }), acceptedEvent()])[0]).toMatchObject({
      status: "accepted",
      acceptedAt: ACCEPTED_AT,
      acceptedBy: acceptor,
      gameId: "game_from_seek",
      whiteIdentity: creator,
      blackIdentity: acceptor,
    });

    expect(projectOpenSeekSummaries([createdEvent(), cancelledEvent()])[0]).toMatchObject({
      status: "cancelled",
      cancelledAt: CANCELLED_AT,
      cancelledBy: creator,
    });

    expect(projectOpenSeekSummaries([createdEvent(), expiredEvent()])[0]).toMatchObject({
      status: "expired",
      expiredAt: EXPIRED_AT,
      expiredBy: "system",
    });
  });

  it("rejects self-accept and invalid accepted seat binding", () => {
    expect(() =>
      projectOpenSeekSummaries([
        createdEvent(),
        acceptedEvent({ acceptedBy: creator, whiteIdentity: creator, blackIdentity: creator }),
      ])
    ).toThrow(/accept their own/i);

    expect(() =>
      projectOpenSeekSummaries([
        createdEvent({ creatorSeat: "b" }),
        acceptedEvent({ whiteIdentity: creator, blackIdentity: acceptor }),
      ])
    ).toThrow(/creator must be black/i);
  });

  it("validates summaries and lifecycle guard helpers", () => {
    const summary = pendingSummary();

    expect(validateOpenSeekSummary(summary).ok).toBe(true);
    expect(canListOpenSeekSummary(summary, "2026-06-01T12:01:00.000Z")).toBe(true);
    expect(canListOpenSeekSummary(summary, EXPIRES_AT)).toBe(false);
    expect(canIdentityAcceptOpenSeek(summary, acceptor, "2026-06-01T12:01:00.000Z")).toBe(true);
    expect(canIdentityAcceptOpenSeek(summary, creator, "2026-06-01T12:01:00.000Z")).toBe(false);
    expect(canIdentityCancelOpenSeek(summary, creator, "2026-06-01T12:01:00.000Z")).toBe(true);
    expect(canSystemExpireOpenSeek(summary, "2026-06-01T12:09:59.000Z")).toBe(false);
    expect(canSystemExpireOpenSeek(summary, EXPIRES_AT)).toBe(true);
  });

  it("matches open seek directory side clock and victory point filters", () => {
    const timedVp = pendingSummary({
      creatorSeat: "w",
      setup: setupFixture({
        timeControl: { initial: 10, increment: 5 },
        gameRules: { vpModeEnabled: true },
      }),
    });
    const casualCastleControl = pendingSummary({
      seekId: "seek_casual",
      creatorSeat: "b",
      setup: setupFixture({
        timeControl: undefined,
        gameRules: { vpModeEnabled: false },
      }),
    });
    const randomSeatMissingRules = pendingSummary({
      seekId: "seek_random",
      creatorSeat: "random",
      setup: setupFixture({
        timeControl: undefined,
        gameRules: undefined,
      }),
    });

    expect(
      openSeekMatchesDirectoryFilters(timedVp, {
        creatorSeat: "w",
        clock: "timed",
        vp: "enabled",
      })
    ).toBe(true);
    expect(
      openSeekMatchesDirectoryFilters(timedVp, {
        creatorSeat: "b",
      })
    ).toBe(false);
    expect(
      openSeekMatchesDirectoryFilters(casualCastleControl, {
        clock: "casual",
        vp: "disabled",
      })
    ).toBe(true);
    expect(
      openSeekMatchesDirectoryFilters(casualCastleControl, {
        clock: "timed",
      })
    ).toBe(false);
    expect(
      openSeekMatchesDirectoryFilters(randomSeatMissingRules, {
        creatorSeat: "random",
        clock: "casual",
        vp: "disabled",
      })
    ).toBe(true);
  });

  it("validates directory responses and opaque cursors", () => {
    const summary = pendingSummary();
    const cursor = encodeOpenSeekDirectoryCursor({
      updatedAt: summary.updatedAt,
      seekId: summary.seekId,
    });

    expect(decodeOpenSeekDirectoryCursor(cursor)).toEqual({
      ok: true,
      value: { updatedAt: summary.updatedAt, seekId: summary.seekId },
    });
    expect(decodeOpenSeekDirectoryCursor("token=secret").ok).toBe(false);
    expect(
      validateOpenSeekDirectoryResponse({
        schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
        seeks: [summary],
        nextCursor: cursor,
      }).ok
    ).toBe(true);
    expect(
      validateOpenSeekDirectoryResponse({
        schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
        seeks: [{ ...summary, creatorToken: "secret" }],
      }).ok
    ).toBe(false);
  });
});
