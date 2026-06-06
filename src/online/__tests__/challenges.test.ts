import { describe, expect, it } from "vitest";
import type { OnlineIdentity } from "../readModel";
import type { OnlineGameSetupDTO } from "../types";
import {
  ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION,
  ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
  type AuthenticatedOnlineIdentity,
  canIdentityAcceptChallenge,
  canIdentityCancelChallenge,
  canIdentityDeclineChallenge,
  canSystemExpireChallenge,
  createChallengeAcceptedEvent,
  createChallengeCancelledEvent,
  createChallengeCreatedEvent,
  createChallengeDeclinedEvent,
  createChallengeExpiredEvent,
  isIdentityBoundToChallenge,
  isSameOnlineIdentity,
  projectOnlineChallengeSummaries,
  validateOnlineChallengeEvent,
  validateOnlineChallengeSummary,
  type OnlineChallengeEvent,
  type OnlineChallengeSummary,
} from "../challenges";

const CREATED_AT = "2026-06-01T12:00:00.000Z";
const ACCEPTED_AT = "2026-06-01T12:05:00.000Z";
const DECLINED_AT = "2026-06-01T12:06:00.000Z";
const CANCELLED_AT = "2026-06-01T12:07:00.000Z";
const EXPIRES_AT = "2026-06-01T12:10:00.000Z";
const EXPIRED_AT = "2026-06-01T12:10:01.000Z";

const challenger: OnlineIdentity = { kind: "session", id: "session_challenger" };
const challenged: OnlineIdentity = {
  kind: "registered",
  id: "user_challenged",
  displayName: "Challenged",
};
const unrelated: OnlineIdentity = { kind: "anonymous", id: "anon_unrelated" };

function setupFixture(overrides: Partial<OnlineGameSetupDTO> = {}): OnlineGameSetupDTO {
  return {
    board: {
      config: { nSquares: 6 },
      castles: [],
    },
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

function authenticated(identity: OnlineIdentity): AuthenticatedOnlineIdentity {
  return identity as AuthenticatedOnlineIdentity;
}

function createdEvent(
  overrides: Partial<Extract<OnlineChallengeEvent, { type: "challenge_created" }>> = {}
): Extract<OnlineChallengeEvent, { type: "challenge_created" }> {
  const event = createChallengeCreatedEvent(
    {
      type: "challenge_created",
      challengeId: "challenge_test",
      challengerIdentity: challenger,
      challengedIdentity: challenged,
      challengerSeat: "random",
      visibility: "unlisted",
      setup: setupFixture(),
      expiresAt: EXPIRES_AT,
    },
    {
      eventId: overrides.eventId ?? "challenge_evt_created",
      createdAt: overrides.createdAt ?? CREATED_AT,
    }
  );
  return { ...event, ...overrides };
}

function acceptedEvent(
  overrides: Partial<Extract<OnlineChallengeEvent, { type: "challenge_accepted" }>> = {}
): Extract<OnlineChallengeEvent, { type: "challenge_accepted" }> {
  const event = createChallengeAcceptedEvent(
    {
      type: "challenge_accepted",
      challengeId: "challenge_test",
      acceptedBy: challenged,
      acceptedAt: ACCEPTED_AT,
      gameId: "game_from_challenge",
      whiteIdentity: challenger,
      blackIdentity: challenged,
    },
    {
      eventId: overrides.eventId ?? "challenge_evt_accepted",
      createdAt: ACCEPTED_AT,
    }
  );
  return { ...event, ...overrides };
}

function declinedEvent(
  overrides: Partial<Extract<OnlineChallengeEvent, { type: "challenge_declined" }>> = {}
): Extract<OnlineChallengeEvent, { type: "challenge_declined" }> {
  const event = createChallengeDeclinedEvent(
    {
      type: "challenge_declined",
      challengeId: "challenge_test",
      declinedBy: challenged,
      declinedAt: DECLINED_AT,
    },
    {
      eventId: overrides.eventId ?? "challenge_evt_declined",
      createdAt: DECLINED_AT,
    }
  );
  return { ...event, ...overrides };
}

function cancelledEvent(
  overrides: Partial<Extract<OnlineChallengeEvent, { type: "challenge_cancelled" }>> = {}
): Extract<OnlineChallengeEvent, { type: "challenge_cancelled" }> {
  const event = createChallengeCancelledEvent(
    {
      type: "challenge_cancelled",
      challengeId: "challenge_test",
      cancelledBy: challenger,
      cancelledAt: CANCELLED_AT,
    },
    {
      eventId: overrides.eventId ?? "challenge_evt_cancelled",
      createdAt: CANCELLED_AT,
    }
  );
  return { ...event, ...overrides };
}

function expiredEvent(
  overrides: Partial<Extract<OnlineChallengeEvent, { type: "challenge_expired" }>> = {}
): Extract<OnlineChallengeEvent, { type: "challenge_expired" }> {
  const event = createChallengeExpiredEvent(
    {
      type: "challenge_expired",
      challengeId: "challenge_test",
      expiredBy: "system",
      expiredAt: EXPIRED_AT,
    },
    {
      eventId: overrides.eventId ?? "challenge_evt_expired",
      createdAt: EXPIRED_AT,
    }
  );
  return { ...event, ...overrides };
}

function expectInvalid(value: unknown): void {
  const result = validateOnlineChallengeEvent(value);
  expect(result.ok).toBe(false);
}

function pendingSummary(
  overrides: Partial<OnlineChallengeSummary> = {}
): OnlineChallengeSummary {
  const [summary] = projectOnlineChallengeSummaries([createdEvent()]);
  return { ...summary, ...overrides };
}

function acceptedSummary(
  overrides: Partial<OnlineChallengeSummary> = {}
): OnlineChallengeSummary {
  const [summary] = projectOnlineChallengeSummaries([createdEvent({ challengerSeat: "w" }), acceptedEvent()]);
  return { ...summary, ...overrides };
}

function declinedSummary(
  overrides: Partial<OnlineChallengeSummary> = {}
): OnlineChallengeSummary {
  const [summary] = projectOnlineChallengeSummaries([createdEvent(), declinedEvent()]);
  return { ...summary, ...overrides };
}

function cancelledSummary(
  overrides: Partial<OnlineChallengeSummary> = {}
): OnlineChallengeSummary {
  const [summary] = projectOnlineChallengeSummaries([createdEvent(), cancelledEvent()]);
  return { ...summary, ...overrides };
}

function expiredSummary(
  overrides: Partial<OnlineChallengeSummary> = {}
): OnlineChallengeSummary {
  const [summary] = projectOnlineChallengeSummaries([createdEvent(), expiredEvent()]);
  return { ...summary, ...overrides };
}

function expectInvalidSummary(value: unknown): void {
  const result = validateOnlineChallengeSummary(value);
  expect(result.ok).toBe(false);
}

describe("online challenge event validation", () => {
  it("creates a schema-versioned direct challenge creation event", () => {
    const event = createdEvent({ challengeId: "challenge_bounded", visibility: "private" });

    expect(event).toMatchObject({
      schemaVersion: ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION,
      eventId: "challenge_evt_created",
      createdAt: CREATED_AT,
      type: "challenge_created",
      challengeId: "challenge_bounded",
      challengerIdentity: challenger,
      challengedIdentity: challenged,
      challengerSeat: "random",
      visibility: "private",
      setup: setupFixture(),
      expiresAt: EXPIRES_AT,
    });
    expect(validateOnlineChallengeEvent(event).ok).toBe(true);
  });

  it("projects rematch intent and source game ids from creation events into challenge summaries", () => {
    const registeredChallenger: OnlineIdentity = {
      kind: "registered",
      id: "user_challenger",
      displayName: "Challenger",
    };
    const event = createdEvent({
      challengerIdentity: registeredChallenger,
      intent: "rematch",
      sourceGameId: "game_source_rematch",
    } as unknown as Partial<Extract<OnlineChallengeEvent, { type: "challenge_created" }>>);

    expect(validateOnlineChallengeEvent(event)).toMatchObject({
      ok: true,
      value: {
        intent: "rematch",
        sourceGameId: "game_source_rematch",
      },
    });
    const [summary] = projectOnlineChallengeSummaries([event]);

    expect(summary).toMatchObject({
      challengeId: "challenge_test",
      intent: "rematch",
      sourceGameId: "game_source_rematch",
      rematch: {
        schemaVersion: 1,
        sourceGameId: "game_source_rematch",
        requesterDisplayName: "Challenger",
        responderDisplayName: "Challenged",
        requestedAt: CREATED_AT,
      },
    });
    expect(validateOnlineChallengeSummary(summary).ok).toBe(true);
  });

  it("rejects rematch records that drift from challenge identities or source games", () => {
    const registeredChallenger: OnlineIdentity = {
      kind: "registered",
      id: "user_challenger",
      displayName: "Challenger",
    };
    const [summary] = projectOnlineChallengeSummaries([
      createdEvent({
        challengerIdentity: registeredChallenger,
        intent: "rematch",
        sourceGameId: "game_source_rematch",
      } as unknown as Partial<Extract<OnlineChallengeEvent, { type: "challenge_created" }>>),
    ]);

    expectInvalidSummary({
      ...summary,
      intent: "challenge",
    });
    expectInvalidSummary({
      ...summary,
      rematch: {
        ...summary.rematch,
        sourceGameId: "game_other_source",
      },
    });
    expectInvalidSummary({
      ...summary,
      rematch: {
        ...summary.rematch,
        requesterDisplayName: "Someone Else",
      },
    });
  });

  it("requires immutable setup terms on challenge creation events", () => {
    const event = createdEvent({ setup: setupFixture({ timeControl: { initial: 12, increment: 3 } }) });
    const { setup: _missingSetup, ...missingSetup } = event;

    expect(validateOnlineChallengeEvent(event)).toEqual({
      ok: true,
      value: event,
    });
    expectInvalid(missingSetup);
    expectInvalid({
      ...event,
      setup: {
        ...event.setup,
        board: { config: { nSquares: 99 }, castles: [] },
      },
    });
  });

  it("accepts all valid challenge lifecycle event variants", () => {
    expect(validateOnlineChallengeEvent(createdEvent()).ok).toBe(true);
    expect(validateOnlineChallengeEvent(acceptedEvent()).ok).toBe(true);
    expect(validateOnlineChallengeEvent(declinedEvent()).ok).toBe(true);
    expect(validateOnlineChallengeEvent(cancelledEvent()).ok).toBe(true);
    expect(validateOnlineChallengeEvent(expiredEvent()).ok).toBe(true);
  });

  it("requires envelope event id and createdAt on every challenge event", () => {
    const { eventId: _eventId, ...missingEventId } = createdEvent();
    const { createdAt: _createdAt, ...missingCreatedAt } = acceptedEvent();

    expectInvalid(missingEventId);
    expectInvalid(missingCreatedAt);
  });

  it("recursively rejects token and credential shaped keys on durable challenge events", () => {
    const secretPayloads: Array<Record<string, unknown>> = [
      { token: "secret" },
      { whiteToken: "secret" },
      { blackToken: "secret" },
      { bearerToken: "secret" },
      { accessToken: "secret" },
      { refreshToken: "secret" },
      { authorization: "Bearer secret" },
      { headers: { authorization: "Bearer secret" } },
      { cookie: "sid=secret" },
      { credential: "secret" },
      { session: "secret" },
      { sessionId: "secret" },
      { session_id: "secret" },
      { authHeader: "Bearer secret" },
      { inviteUrl: "https://castles.example/play?token=secret" },
      { nested: [{ REFRESH_TOKEN: "secret" }] },
    ];

    for (const secretPayload of secretPayloads) {
      expectInvalid({ ...createdEvent(), ...secretPayload });
    }
  });

  it("rejects URL strings containing token-bearing query parameters", () => {
    expectInvalid({
      ...createdEvent(),
      note: "https://castles.example/challenges/challenge_test?whiteToken=secret",
    });
    expectInvalid({
      ...createdEvent(),
      note: "/challenges/challenge_test?token=secret",
    });
    expectInvalid({
      ...createdEvent(),
      metadata: { url: "https://castles.example/challenges/challenge_test?session_id=secret" },
    });
    expectInvalid({
      ...createdEvent(),
      metadata: { url: "https://castles.example/challenges/challenge_test#access_token=secret" },
    });
  });

  it("rejects secret-shaped string values and identity ids", () => {
    expectInvalid({
      ...createdEvent(),
      note: "Authorization: Bearer secret",
    });
    expectInvalid({
      ...createdEvent(),
      note: "access_token=secret",
    });
    expectInvalid({
      ...createdEvent(),
      note: "auth_header=Bearer secret",
    });
    expectInvalid({
      ...createdEvent(),
      note: "Cookie: sid=secret",
    });
    expectInvalid({
      ...createdEvent(),
      challengerIdentity: { kind: "session", id: "Bearer secret" },
    });
    expectInvalid({
      ...createdEvent(),
      challengerIdentity: { kind: "session", id: "access_token=secret" },
    });
    expectInvalid({
      ...createdEvent(),
      challengedIdentity: { kind: "registered", id: "https://castles.example/play?token=secret" },
    });
  });

  it("factory helpers validate and return canonical token-free events", () => {
    expect(() =>
      createChallengeCreatedEvent(
        {
          type: "challenge_created",
          challengeId: "challenge_factory_secret",
          challengerIdentity: challenger,
          challengedIdentity: challenged,
          challengerSeat: "random",
          visibility: "unlisted",
          setup: setupFixture(),
          expiresAt: EXPIRES_AT,
          inviteUrl: "https://castles.example/play?token=secret",
        } as any,
        { eventId: "challenge_evt_factory_secret", createdAt: CREATED_AT }
      )
    ).toThrow(/token|credential|session|auth|cookie|invite/i);

    const event = createChallengeCreatedEvent(
      {
        type: "challenge_created",
        challengeId: "challenge_factory_canonical",
        challengerIdentity: challenger,
        challengedIdentity: challenged,
        challengerSeat: "random",
        visibility: "unlisted",
        setup: setupFixture(),
        expiresAt: EXPIRES_AT,
        note: "drop me",
      } as any,
      { eventId: "challenge_evt_factory_canonical", createdAt: CREATED_AT }
    );

    expect("note" in event).toBe(false);
  });

  it("rejects invalid challenge creation fields", () => {
    expectInvalid({ ...createdEvent(), schemaVersion: 99 });
    expectInvalid({ ...createdEvent(), challengeId: "" });
    expectInvalid({ ...createdEvent(), challengeId: "x".repeat(129) });
    expectInvalid({
      ...createdEvent(),
      challengerIdentity: { kind: "registered", id: "" },
    });
    expectInvalid({ ...createdEvent(), visibility: "invalid" });
    expectInvalid({ ...createdEvent(), visibility: "public" });
    expectInvalid({ ...createdEvent(), challengerSeat: "white" });
    expectInvalid({
      ...createdEvent(),
      challengedIdentity: { kind: challenger.kind, id: challenger.id },
    });
    expectInvalid({ ...createdEvent(), expiresAt: CREATED_AT });
  });

  it("rejects accepted events missing durable game, actor, timestamp, or seat binding fields", () => {
    const event = acceptedEvent();
    const { gameId: _gameId, ...missingGameId } = event;
    const { acceptedBy: _acceptedBy, ...missingAcceptedBy } = event;
    const { acceptedAt: _acceptedAt, ...missingAcceptedAt } = event;
    const { whiteIdentity: _whiteIdentity, ...missingWhiteIdentity } = event;
    const { blackIdentity: _blackIdentity, ...missingBlackIdentity } = event;

    expectInvalid(missingGameId);
    expectInvalid({ ...event, gameId: "x".repeat(129) });
    expectInvalid(missingAcceptedBy);
    expectInvalid(missingAcceptedAt);
    expectInvalid(missingWhiteIdentity);
    expectInvalid(missingBlackIdentity);
  });

  it("rejects declined, cancelled, and expired events missing durable actor or timestamp fields", () => {
    const decline = declinedEvent();
    const { declinedBy: _declinedBy, ...missingDeclinedBy } = decline;
    const { declinedAt: _declinedAt, ...missingDeclinedAt } = decline;
    const cancel = cancelledEvent();
    const { cancelledBy: _cancelledBy, ...missingCancelledBy } = cancel;
    const { cancelledAt: _cancelledAt, ...missingCancelledAt } = cancel;
    const expire = expiredEvent();
    const { expiredBy: _expiredBy, ...missingExpiredBy } = expire;
    const { expiredAt: _expiredAt, ...missingExpiredAt } = expire;

    expectInvalid(missingDeclinedBy);
    expectInvalid(missingDeclinedAt);
    expectInvalid(missingCancelledBy);
    expectInvalid(missingCancelledAt);
    expectInvalid(missingExpiredBy);
    expectInvalid(missingExpiredAt);
    expectInvalid({ ...expire, expiredBy: "player" });
  });
});

describe("online challenge projection", () => {
  it("projects a pending challenge from a creation event", () => {
    const [summary] = projectOnlineChallengeSummaries([createdEvent()]);

    expect(summary).toMatchObject({
      schemaVersion: ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION,
      challengeId: "challenge_test",
      challengerIdentity: challenger,
      challengedIdentity: challenged,
      challengerSeat: "random",
      visibility: "unlisted",
      setup: setupFixture(),
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
      status: "pending",
      lastEventId: "challenge_evt_created",
    });
    expect(summary.setup).toEqual(setupFixture());
  });

  it("projects accepted challenges with game and resolved seat bindings", () => {
    const [summary] = projectOnlineChallengeSummaries([
      createdEvent({ challengerSeat: "w" }),
      acceptedEvent(),
    ]);

    expect(summary).toMatchObject({
      status: "accepted",
      updatedAt: ACCEPTED_AT,
      acceptedAt: ACCEPTED_AT,
      acceptedBy: challenged,
      gameId: "game_from_challenge",
      whiteIdentity: challenger,
      blackIdentity: challenged,
      lastEventId: "challenge_evt_accepted",
    });
  });

  it("projects declined, cancelled, and expired terminal states", () => {
    const setup = setupFixture({ timeControl: { initial: 7, increment: 2 } });
    expect(projectOnlineChallengeSummaries([createdEvent({ setup }), acceptedEvent()])[0].setup).toEqual(setup);
    expect(projectOnlineChallengeSummaries([createdEvent(), declinedEvent()])[0]).toMatchObject({
      status: "declined",
      declinedAt: DECLINED_AT,
      declinedBy: challenged,
    });
    expect(projectOnlineChallengeSummaries([createdEvent(), cancelledEvent()])[0]).toMatchObject({
      status: "cancelled",
      cancelledAt: CANCELLED_AT,
      cancelledBy: challenger,
    });
    expect(projectOnlineChallengeSummaries([createdEvent(), expiredEvent()])[0]).toMatchObject({
      status: "expired",
      expiredAt: EXPIRED_AT,
      expiredBy: "system",
    });
  });

  it("rejects duplicate creation and duplicate event ids", () => {
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent({ eventId: "challenge_evt_a" }),
        createdEvent({ eventId: "challenge_evt_b" }),
      ])
    ).toThrow(/Duplicate challenge creation/);

    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent({ eventId: "challenge_evt_same" }),
        acceptedEvent({ eventId: "challenge_evt_same" }),
      ])
    ).toThrow(/Duplicate challenge event/);
  });

  it("rejects lifecycle events before creation and after terminal states", () => {
    expect(() => projectOnlineChallengeSummaries([acceptedEvent()])).toThrow(/missing challenge/);
    expect(() =>
      projectOnlineChallengeSummaries([createdEvent(), declinedEvent(), cancelledEvent()])
    ).toThrow(/already terminal/);
  });

  it("enforces actor identity authorization for terminal actions", () => {
    expect(() =>
      projectOnlineChallengeSummaries([createdEvent(), acceptedEvent({ acceptedBy: unrelated })])
    ).toThrow(/accepted by the challenged identity/);
    expect(() =>
      projectOnlineChallengeSummaries([createdEvent(), declinedEvent({ declinedBy: unrelated })])
    ).toThrow(/declined by the challenged identity/);
    expect(() =>
      projectOnlineChallengeSummaries([createdEvent(), cancelledEvent({ cancelledBy: unrelated })])
    ).toThrow(/cancelled by the challenger identity/);
    expect(() =>
      projectOnlineChallengeSummaries([createdEvent(), expiredEvent({ expiredBy: "player" as any })])
    ).toThrow(/system/);
  });

  it("enforces terminal timestamp ordering against creation and expiry", () => {
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent(),
        acceptedEvent({ acceptedAt: EXPIRES_AT, createdAt: EXPIRES_AT }),
      ])
    ).toThrow(/before expiry/);
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent(),
        acceptedEvent({ acceptedAt: CREATED_AT, createdAt: ACCEPTED_AT }),
      ])
    ).toThrow(/must equal/);
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent(),
        declinedEvent({ declinedAt: CREATED_AT, createdAt: DECLINED_AT }),
      ])
    ).toThrow(/must equal/);
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent(),
        cancelledEvent({
          cancelledAt: CREATED_AT,
          createdAt: CANCELLED_AT,
        }),
      ])
    ).toThrow(/must equal/);
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent(),
        cancelledEvent({
          cancelledAt: "2026-06-01T11:59:59.000Z",
          createdAt: "2026-06-01T11:59:59.000Z",
        }),
      ])
    ).toThrow(/before creation/);
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent(),
        expiredEvent({ expiredAt: ACCEPTED_AT, createdAt: ACCEPTED_AT }),
      ])
    ).toThrow(/at or after expiry/);
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent(),
        expiredEvent({ expiredAt: EXPIRED_AT, createdAt: "2026-06-01T12:10:02.000Z" }),
      ])
    ).toThrow(/must equal/);
  });

  it("enforces accepted seat binding for fixed challenger seats", () => {
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent({ challengerSeat: "w" }),
        acceptedEvent({ whiteIdentity: challenged, blackIdentity: challenger }),
      ])
    ).toThrow(/challenger must be white/);

    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent({ challengerSeat: "b" }),
        acceptedEvent({ whiteIdentity: challenger, blackIdentity: challenged }),
      ])
    ).toThrow(/challenger must be black/);
  });

  it("resolves random challenger seats only through persisted accepted seat identities", () => {
    expect(
      projectOnlineChallengeSummaries([
        createdEvent({ challengerSeat: "random" }),
        acceptedEvent({ whiteIdentity: challenged, blackIdentity: challenger }),
      ])[0]
    ).toMatchObject({
      status: "accepted",
      whiteIdentity: challenged,
      blackIdentity: challenger,
    });

    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent({ challengerSeat: "random" }),
        acceptedEvent({ whiteIdentity: challenged, blackIdentity: challenged }),
      ])
    ).toThrow(/exactly the challenger and challenged identities/);
    expect(() =>
      projectOnlineChallengeSummaries([
        createdEvent({ challengerSeat: "random" }),
        acceptedEvent({ whiteIdentity: challenged, blackIdentity: unrelated }),
      ])
    ).toThrow(/exactly the challenger and challenged identities/);
  });

  it("compares and authorizes identities for challenge helpers", () => {
    const [summary] = projectOnlineChallengeSummaries([createdEvent()]);

    expect(isSameOnlineIdentity(challenged, { ...challenged, displayName: "New Name" })).toBe(true);
    expect(isSameOnlineIdentity({ kind: "session", id: "same" }, { kind: "anonymous", id: "same" })).toBe(false);
    expect(isIdentityBoundToChallenge(summary, challenger)).toBe(true);
    expect(isIdentityBoundToChallenge(summary, challenged)).toBe(true);
    expect(isIdentityBoundToChallenge(summary, unrelated)).toBe(false);

    expect(canIdentityAcceptChallenge(summary, authenticated(challenged), ACCEPTED_AT)).toBe(true);
    expect(canIdentityAcceptChallenge(summary, authenticated(challenged), Date.parse(ACCEPTED_AT))).toBe(true);
    expect(canIdentityAcceptChallenge(summary, authenticated(challenger), ACCEPTED_AT)).toBe(false);
    expect(canIdentityAcceptChallenge(summary, authenticated(challenged), EXPIRES_AT)).toBe(false);
    expect(canIdentityAcceptChallenge(summary, authenticated(challenged), "2026-06-01T11:59:59.000Z")).toBe(false);
    expect(canIdentityAcceptChallenge(summary, authenticated(challenged), "bad-date")).toBe(false);
    expect(canIdentityDeclineChallenge(summary, authenticated(challenged), DECLINED_AT)).toBe(true);
    expect(canIdentityDeclineChallenge(summary, authenticated(challenged), "2026-06-01T11:59:59.000Z")).toBe(false);
    expect(canIdentityCancelChallenge(summary, authenticated(challenger), CANCELLED_AT)).toBe(true);
    expect(canIdentityCancelChallenge(summary, authenticated(challenger), Date.parse(CANCELLED_AT))).toBe(true);
    expect(canIdentityCancelChallenge(summary, authenticated(challenged), CANCELLED_AT)).toBe(false);
    expect(canSystemExpireChallenge(summary, ACCEPTED_AT)).toBe(false);
    expect(canSystemExpireChallenge(summary, EXPIRES_AT)).toBe(true);
    expect(canSystemExpireChallenge(summary, Date.parse(EXPIRES_AT))).toBe(true);
    expect(canSystemExpireChallenge(summary, Infinity)).toBe(false);

    const terminalSummary = projectOnlineChallengeSummaries([createdEvent(), declinedEvent()])[0];
    expect(canIdentityAcceptChallenge(terminalSummary, authenticated(challenged), ACCEPTED_AT)).toBe(false);
    expect(canIdentityDeclineChallenge(terminalSummary, authenticated(challenged), DECLINED_AT)).toBe(false);
    expect(canIdentityCancelChallenge(terminalSummary, authenticated(challenger), CANCELLED_AT)).toBe(false);
    expect(canSystemExpireChallenge(terminalSummary, EXPIRES_AT)).toBe(false);
  });
});

describe("online challenge summary validation", () => {
  it("uses an explicit challenge summary schema version", () => {
    const summary = pendingSummary();

    expect(ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION).toBe(1);
    expect(summary.schemaVersion).toBe(ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION);
    expect(validateOnlineChallengeSummary(summary)).toEqual({
      ok: true,
      value: summary,
    });
  });

  it("accepts all terminal summary variants with required fields", () => {
    expect(validateOnlineChallengeSummary(acceptedSummary()).ok).toBe(true);
    expect(validateOnlineChallengeSummary(declinedSummary()).ok).toBe(true);
    expect(validateOnlineChallengeSummary(cancelledSummary()).ok).toBe(true);
    expect(validateOnlineChallengeSummary(expiredSummary()).ok).toBe(true);
  });

  it("requires immutable setup terms in challenge summaries", () => {
    const summary = pendingSummary({ setup: setupFixture({ timeControl: { initial: 5, increment: 1 } }) });
    const { setup: _missingSetup, ...missingSetup } = summary;

    expect(validateOnlineChallengeSummary(summary)).toEqual({
      ok: true,
      value: summary,
    });
    expectInvalidSummary(missingSetup);
    expectInvalidSummary({
      ...summary,
      setup: {
        ...summary.setup,
        pieces: "not pieces",
      },
    });
  });

  it("rejects malformed common summary fields", () => {
    const summary = pendingSummary();
    const { schemaVersion: _schemaVersion, ...missingSchemaVersion } = summary;

    expectInvalidSummary(missingSchemaVersion);
    expectInvalidSummary({ ...summary, schemaVersion: 99 });
    expectInvalidSummary({ ...summary, challengeId: "" });
    expectInvalidSummary({ ...summary, challengeId: "x".repeat(129) });
    expectInvalidSummary({ ...summary, createdAt: "bad-date" });
    expectInvalidSummary({ ...summary, updatedAt: "bad-date" });
    expectInvalidSummary({ ...summary, expiresAt: "bad-date" });
    expectInvalidSummary({ ...summary, lastEventId: "" });
    expectInvalidSummary({ ...summary, visibility: "public" });
    expectInvalidSummary({ ...summary, challengerSeat: "white" });
    expectInvalidSummary({ ...summary, challengerIdentity: { kind: "registered", id: "" } });
    expectInvalidSummary({ ...summary, challengedIdentity: { kind: "session", id: "access_token=secret" } });
  });

  it("rejects summary lifecycle field contradictions", () => {
    expectInvalidSummary({ ...pendingSummary(), acceptedAt: ACCEPTED_AT });
    expectInvalidSummary({ ...acceptedSummary(), gameId: undefined });
    expectInvalidSummary({ ...acceptedSummary(), acceptedBy: undefined });
    expectInvalidSummary({ ...acceptedSummary(), whiteIdentity: undefined });
    expectInvalidSummary({ ...acceptedSummary(), blackIdentity: undefined });
    expectInvalidSummary({ ...declinedSummary(), declinedBy: undefined });
    expectInvalidSummary({ ...cancelledSummary(), cancelledBy: undefined });
    expectInvalidSummary({ ...expiredSummary(), expiredBy: undefined });
    expectInvalidSummary({ ...expiredSummary(), expiredBy: "player" });

    expectInvalidSummary({ ...declinedSummary(), acceptedAt: ACCEPTED_AT });
    expectInvalidSummary({ ...acceptedSummary(), declinedAt: DECLINED_AT });
    expectInvalidSummary({ ...cancelledSummary(), expiredAt: EXPIRED_AT });
    expectInvalidSummary({ ...expiredSummary(), cancelledAt: CANCELLED_AT });
  });

  it("rejects impossible summary timestamp ordering", () => {
    expectInvalidSummary({
      ...pendingSummary(),
      updatedAt: "2026-06-01T11:59:59.000Z",
    });
    expectInvalidSummary({
      ...pendingSummary(),
      expiresAt: CREATED_AT,
    });
    expectInvalidSummary({
      ...acceptedSummary(),
      updatedAt: ACCEPTED_AT,
      acceptedAt: EXPIRES_AT,
    });
    expectInvalidSummary({
      ...acceptedSummary(),
      updatedAt: EXPIRES_AT,
      acceptedAt: EXPIRES_AT,
    });
    expectInvalidSummary({
      ...declinedSummary(),
      updatedAt: DECLINED_AT,
      declinedAt: EXPIRES_AT,
    });
    expectInvalidSummary({
      ...declinedSummary(),
      updatedAt: EXPIRES_AT,
      declinedAt: EXPIRES_AT,
    });
    expectInvalidSummary({
      ...cancelledSummary(),
      updatedAt: CANCELLED_AT,
      cancelledAt: "2026-06-01T11:59:59.000Z",
    });
    expectInvalidSummary({
      ...cancelledSummary(),
      updatedAt: "2026-06-01T11:59:59.000Z",
      cancelledAt: "2026-06-01T11:59:59.000Z",
    });
    expectInvalidSummary({
      ...expiredSummary(),
      updatedAt: EXPIRED_AT,
      expiredAt: ACCEPTED_AT,
    });
    expectInvalidSummary({
      ...expiredSummary(),
      updatedAt: ACCEPTED_AT,
      expiredAt: ACCEPTED_AT,
    });
    expectInvalidSummary({
      ...acceptedSummary(),
      updatedAt: "2026-06-01T12:05:01.000Z",
    });
  });

  it("rejects token-like data anywhere in challenge summaries", () => {
    expectInvalidSummary({ ...pendingSummary(), token: "secret" });
    expectInvalidSummary({ ...pendingSummary(), note: "access_token=secret" });
    expectInvalidSummary({
      ...pendingSummary(),
      challengerIdentity: { kind: "session", id: "Bearer secret" },
    });
  });
});
