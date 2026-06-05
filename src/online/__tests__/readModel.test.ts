import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { Board } from "../../Classes/Core/Board";
import { Castle } from "../../Classes/Entities/Castle";
import { Hex } from "../../Classes/Entities/Hex";
import { Piece } from "../../Classes/Entities/Piece";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { PieceType, SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";
import {
  ONLINE_EVENT_SCHEMA_VERSION,
  ONLINE_RULESET_VERSION,
  onlineGameEventsToRecords,
  type OnlineGameEvent,
} from "../events";
import {
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
  canAccessOnlineGameSummary,
  canListOnlineGameSummary,
  decodeOnlineGameDirectoryCursor,
  encodeOnlineGameDirectoryCursor,
  normalizeOnlineGameDirectorySearchQuery,
  onlineGameSummaryDirectorySearchText,
  onlineGameSummaryMatchesDirectoryFilters,
  projectOnlineGameSummaries,
  roleForOnlineSeat,
  stripOnlineGameDirectoryResponseOnlyFields,
  stripOnlineGameSummaryResponseOnlyFields,
  validateOnlineGameDirectoryResponse,
  validateOnlineGameSummary,
  type OnlineGameSummary,
} from "../readModel";

function createSetup() {
  const board = getStartingBoard(6);
  const pieces = getStartingPieces(6);
  const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, [
    SanctuaryType.WolfCovenant,
    SanctuaryType.SacredSpring,
  ]);

  return serializeOnlineGameSetup({
    board,
    pieces,
    sanctuaries,
    sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
    gameRules: { vpModeEnabled: false },
    initialPoolTypes: [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring],
    pieceTheme: "Castles",
    timeControl: { initial: 20, increment: 20 },
  });
}

function envelope(index: number) {
  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: `evt-${index}`,
    createdAt: `2026-05-31T12:00:0${index}.000Z`,
    rulesetVersion: ONLINE_RULESET_VERSION,
  } as const;
}

function createEvent(
  gameId = "game_summary"
): Extract<OnlineGameEvent, { type: "game_created" }> {
  return {
    ...envelope(0),
    type: "game_created",
    gameId,
    setup: createSetup(),
    clock: {
      remainingMs: { w: 1_200_000, b: 1_200_000 },
      activeColor: "w",
      runningSince: 1_000,
    },
  };
}

function createPreviewSetup() {
  const board = new Board(
    { nSquares: 3, riverCrossingLength: 100, hasHighGround: false },
    [
      new Castle(new Hex(0, 3, -3), "w", 0, false, "w"),
      new Castle(new Hex(0, -3, 3), "b", 2, false, "w"),
    ]
  );
  const pieces = [
    new Piece(new Hex(0, 0, 0), "w", PieceType.Swordsman),
    new Piece(new Hex(1, -1, 0), "b", PieceType.Monarch),
  ];

  return serializeOnlineGameSetup({
    board,
    pieces,
    sanctuaries: [],
    gameRules: { vpModeEnabled: false },
    initialPoolTypes: [],
    pieceTheme: "Castles",
  });
}

function createPreviewEvent(
  gameId = "game_preview"
): Extract<OnlineGameEvent, { type: "game_created" }> {
  return {
    ...envelope(0),
    type: "game_created",
    gameId,
    setup: createPreviewSetup(),
  };
}

function createTerminalCaptureEvent(
  gameId = "game_terminal_capture"
): Extract<OnlineGameEvent, { type: "game_created" }> {
  const board = new Board(
    { nSquares: 3, riverCrossingLength: 100, hasHighGround: false },
    []
  );
  const pieces = [
    new Piece(new Hex(0, 0, 0), "w", PieceType.Monarch),
    new Piece(new Hex(1, -1, 0), "b", PieceType.Monarch),
  ];

  return {
    ...envelope(0),
    type: "game_created",
    gameId,
    setup: serializeOnlineGameSetup({
      board,
      pieces,
      sanctuaries: [],
      gameRules: { vpModeEnabled: false },
      initialPoolTypes: [],
      pieceTheme: "Castles",
    }),
  };
}

function validSummary(overrides: Partial<OnlineGameSummary> = {}): OnlineGameSummary {
  const hasTimeControl = overrides.hasTimeControl ?? true;
  return {
    schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
    gameId: "game_valid_summary",
    rulesetVersion: ONLINE_RULESET_VERSION,
    createdAt: "2026-05-31T12:00:00.000Z",
    updatedAt: "2026-05-31T12:00:01.000Z",
    version: 1,
    status: "active",
    visibility: "unlisted",
    archiveState: "active",
    hasTimeControl: true,
    participants: [
      { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_game_valid_summary_w" } },
      { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_game_valid_summary_b" } },
    ],
    livePreview: {
      sideToMove: "b",
      turnPhase: "Attack",
      moveCount: 1,
      lastMove: {
        notation: "G13G12",
        turnNumber: 1,
        color: "w",
        phase: "Movement",
      },
      boardPreview: {
        radius: 6,
        pieces: [
          { q: 0, r: 6, s: -6, color: "w", type: PieceType.Monarch },
          { q: 0, r: -6, s: 6, color: "b", type: PieceType.Monarch },
        ],
        castles: [
          { q: 0, r: 6, s: -6, owner: "w" },
          { q: 0, r: -6, s: 6, owner: "b" },
        ],
      },
      ...(hasTimeControl
        ? {
            clock: {
              timeControl: { initialMs: 1_200_000, incrementMs: 20_000 },
              remainingMs: { w: 1_190_000, b: 1_200_000 },
              activeColor: "b" as const,
              runningSince: 2_000,
            },
          }
        : {}),
    },
    lastEventId: "evt-valid",
    ...overrides,
  };
}

describe("online read model", () => {
  it("rejects secret-looking public directory cursors", () => {
    const secretCursor = btoa(JSON.stringify([
      "2026-05-31T12:00:01.000Z",
      "token=secret",
    ])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

    expect(decodeOnlineGameDirectoryCursor(secretCursor).ok).toBe(false);
    expect(
      validateOnlineGameDirectoryResponse({
        schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
        games: [],
        nextCursor: secretCursor,
      }).ok
    ).toBe(false);
  });

  it("validates public directory response envelopes", () => {
    const active = validSummary({
      gameId: "game_directory_active",
      visibility: "public",
      status: "active",
      archiveState: "active",
    });
    const cursor = encodeOnlineGameDirectoryCursor(active);

    const validation = validateOnlineGameDirectoryResponse({
      schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
      games: [active],
      nextCursor: cursor,
    });

    expect(validation).toEqual({
      ok: true,
      value: {
        schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
        games: [active],
        nextCursor: cursor,
      },
    });
    expect(decodeOnlineGameDirectoryCursor(cursor)).toEqual({
      ok: true,
      value: { updatedAt: active.updatedAt, gameId: active.gameId },
    });
  });

  it("normalizes and bounds public directory search queries", () => {
    expect(normalizeOnlineGameDirectorySearchQuery("  Ada   timeout  ")).toBe("ada timeout");
    expect(normalizeOnlineGameDirectorySearchQuery("")).toBeNull();
    expect(normalizeOnlineGameDirectorySearchQuery("   ")).toBeNull();
    expect(normalizeOnlineGameDirectorySearchQuery("Ada\nBen")).toBeNull();
    expect(normalizeOnlineGameDirectorySearchQuery("a".repeat(81))).toBeNull();
  });

  it("searches public directory summaries by visible text without raw identity ids", () => {
    const visibleSummary = validSummary({
      gameId: "game_visible_search",
      ratingMode: "rated",
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "private_user_w", displayName: "Ada" } },
        { seat: "b", role: "black", identity: { kind: "session", id: "session_secret_b" } },
      ],
      livePreview: {
        ...validSummary().livePreview,
        sideToMove: "b",
        turnPhase: "Attack",
        lastMove: {
          notation: "G13G12",
          turnNumber: 1,
          color: "w",
          phase: "Movement",
        },
        moveCount: 1,
      },
    });
    const searchText = onlineGameSummaryDirectorySearchText(visibleSummary);

    expect(searchText).toContain("ada");
    expect(searchText).toContain("black");
    expect(searchText).toContain("black to move");
    expect(searchText).toContain("rated game");
    expect(searchText).toContain("g13g12");
    expect(searchText).not.toContain("private_user_w");
    expect(searchText).not.toContain("session_secret_b");
  });

  it("projects, validates, and searches public rating mode summary labels", () => {
    const ratedEvent: Extract<OnlineGameEvent, { type: "game_created" }> = {
      ...createEvent("game_rated_summary"),
      setup: { ...createSetup(), ratingMode: "rated" },
    };
    const [ratedSummary] = projectOnlineGameSummaries([ratedEvent]);
    const legacySummary = validSummary({ ratingMode: undefined });

    expect(ratedSummary.ratingMode).toBe("rated");
    expect(validateOnlineGameSummary(ratedSummary)).toMatchObject({
      ok: true,
      value: { ratingMode: "rated" },
    });
    expect(validateOnlineGameSummary(legacySummary)).toMatchObject({
      ok: true,
      value: { ratingMode: undefined },
    });
    expect(validateOnlineGameSummary({ ...legacySummary, ratingMode: "ranked" }).ok).toBe(false);
    expect(onlineGameSummaryDirectorySearchText(ratedSummary)).toContain("rated game");
    expect(onlineGameSummaryDirectorySearchText(legacySummary)).toContain("casual game");
  });

  it("matches public directory summaries by rating mode with legacy casual default", () => {
    const ratedSummary = validSummary({
      gameId: "game_rated_filter",
      visibility: "public",
      ratingMode: "rated",
    });
    const casualSummary = validSummary({
      gameId: "game_casual_filter",
      visibility: "public",
      ratingMode: "casual",
    });
    const legacySummary = validSummary({
      gameId: "game_legacy_filter",
      visibility: "public",
      ratingMode: undefined,
    });

    expect(
      onlineGameSummaryMatchesDirectoryFilters(ratedSummary, {
        visibility: "public",
        state: "active",
        limit: 10,
        rating: "rated",
      })
    ).toBe(true);
    expect(
      onlineGameSummaryMatchesDirectoryFilters(casualSummary, {
        visibility: "public",
        state: "active",
        limit: 10,
        rating: "rated",
      })
    ).toBe(false);
    expect(
      onlineGameSummaryMatchesDirectoryFilters(legacySummary, {
        visibility: "public",
        state: "active",
        limit: 10,
        rating: "casual",
      })
    ).toBe(true);
  });

  it("searches timeout results by displayed on-time label", () => {
    const timeoutSummary = validSummary({
      status: "complete",
      archiveState: "archived",
      endedAt: "2026-05-31T12:00:01.000Z",
      result: { winner: "b", reason: "timeout" },
    });

    expect(onlineGameSummaryDirectorySearchText(timeoutSummary)).toContain("black wins on time");
  });

  it("matches public directory search before pagination can hide older matches", () => {
    const matching = validSummary({
      gameId: "game_older_matching",
      visibility: "public",
      updatedAt: "2026-05-31T12:00:01.000Z",
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "ada_id", displayName: "Ada" } },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_black" } },
      ],
    });
    const newerNonmatch = validSummary({
      gameId: "game_newer_other",
      visibility: "public",
      updatedAt: "2026-05-31T12:00:02.000Z",
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "caro_id", displayName: "Caro" } },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_black" } },
      ],
    });

    expect(
      onlineGameSummaryMatchesDirectoryFilters(newerNonmatch, {
        visibility: "public",
        state: "active",
        limit: 1,
        query: "ada",
      })
    ).toBe(false);
    expect(
      onlineGameSummaryMatchesDirectoryFilters(matching, {
        visibility: "public",
        state: "active",
        limit: 1,
        query: "ada",
      })
    ).toBe(true);
  });

  it("accepts live response-only fields only on active summaries", () => {
    const active = validSummary({
      livePreview: {
        ...validSummary().livePreview,
        clock: {
          ...validSummary().livePreview.clock!,
          serverNow: 4_000,
        },
        spectatorCount: 2,
      },
    });
    const activeValidation = validateOnlineGameSummary(active);

    expect(activeValidation).toEqual({
      ok: true,
      value: active,
    });

    const archived = validSummary({
      endedAt: "2026-05-31T12:00:01.000Z",
      status: "complete",
      archiveState: "archived",
      result: { winner: "w", reason: "resignation" },
      livePreview: {
        ...validSummary().livePreview,
        clock: {
          ...validSummary().livePreview.clock!,
          serverNow: 4_000,
        },
        spectatorCount: 1,
      },
    });

    expect(validateOnlineGameSummary(archived).ok).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...active,
        livePreview: { ...active.livePreview, spectatorCount: -1 },
      }).ok
    ).toBe(false);
  });

  it("strips response-only live fields without mutating summary envelopes", () => {
    const active = validSummary({
      livePreview: {
        ...validSummary().livePreview,
        clock: {
          ...validSummary().livePreview.clock!,
          serverNow: 4_000,
        },
        spectatorCount: 2,
      },
    });
    const strippedSummary = stripOnlineGameSummaryResponseOnlyFields(active);
    const strippedDirectory = stripOnlineGameDirectoryResponseOnlyFields({
      schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
      games: [active],
    });

    expect((strippedSummary as OnlineGameSummary).livePreview.spectatorCount).toBeUndefined();
    expect((strippedSummary as OnlineGameSummary).livePreview.clock?.serverNow).toBeUndefined();
    expect(active.livePreview.spectatorCount).toBe(2);
    expect(active.livePreview.clock?.serverNow).toBe(4_000);
    expect(
      (strippedDirectory as { games: OnlineGameSummary[] }).games[0].livePreview.spectatorCount
    ).toBeUndefined();
    expect(
      (strippedDirectory as { games: OnlineGameSummary[] }).games[0].livePreview.clock?.serverNow
    ).toBeUndefined();
  });

  it("rejects malformed public directory response envelopes", () => {
    expect(validateOnlineGameDirectoryResponse({ games: [] }).ok).toBe(false);
    expect(
      validateOnlineGameDirectoryResponse({
        schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
        games: [{ gameId: "game_bad" }],
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameDirectoryResponse({
        schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
        games: [],
        nextCursor: "not-valid-cursor",
      }).ok
    ).toBe(false);
  });

  it("projects a stable game summary from the append-only event log", () => {
    const events: OnlineGameEvent[] = [
      createEvent(),
      {
        ...envelope(1),
        type: "action_accepted",
        gameId: "game_summary",
        playerColor: "w",
        clientActionId: "client-action-summary",
        version: 1,
        playedAt: 2_000,
        action: { type: "PASS", baseVersion: 0 },
        clock: {
          remainingMs: { w: 1_200_000, b: 1_200_000 },
          activeColor: "b",
          runningSince: 2_000,
        },
      },
    ];

    const [summary] = projectOnlineGameSummaries(events);

    expect(summary).toMatchObject({
      schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
      gameId: "game_summary",
      rulesetVersion: ONLINE_RULESET_VERSION,
      createdAt: "2026-05-31T12:00:00.000Z",
      updatedAt: "2026-05-31T12:00:01.000Z",
      version: 1,
      status: "active",
      visibility: "unlisted",
      archiveState: "active",
      hasTimeControl: true,
      livePreview: {
        sideToMove: expect.stringMatching(/^[wb]$/),
        turnPhase: expect.stringMatching(/^(Movement|Attack|Recruitment)$/),
        moveCount: 1,
        lastMove: expect.objectContaining({
          notation: "Pass",
          turnNumber: 1,
          color: "w",
          phase: "Movement",
        }),
        clock: {
          timeControl: { initialMs: 1_200_000, incrementMs: 20_000 },
          remainingMs: { w: 1_200_000, b: 1_200_000 },
          activeColor: "b",
          runningSince: 2_000,
        },
        boardPreview: {
          radius: expect.any(Number),
          pieces: expect.arrayContaining([
            expect.objectContaining({ color: "w", type: PieceType.Monarch }),
            expect.objectContaining({ color: "b", type: PieceType.Monarch }),
          ]),
          castles: expect.arrayContaining([
            expect.objectContaining({ owner: "w" }),
            expect.objectContaining({ owner: "b" }),
          ]),
        },
      },
      lastEventId: "evt-1",
    });
    expect(summary.participants).toEqual([
      {
        seat: "w",
        role: "white",
        identity: { kind: "anonymous", id: "anon_game_summary_w" },
      },
      {
        seat: "b",
        role: "black",
        identity: { kind: "anonymous", id: "anon_game_summary_b" },
      },
    ]);
    expect(JSON.stringify(summary)).not.toContain("secret-token");
    expect(JSON.stringify(summary)).not.toContain("serverNow");
  });

  it("projects explicit initial visibility while keeping old creation events unlisted", () => {
    const [legacySummary] = projectOnlineGameSummaries([createEvent("game_legacy_visibility")]);
    const explicitSummaries = Object.fromEntries(
      (["private", "unlisted", "public"] as const).map((initialVisibility) => {
        const [summary] = projectOnlineGameSummaries([
          {
            ...createEvent(`game_initial_${initialVisibility}`),
            initialVisibility,
          },
        ]);
        return [initialVisibility, summary.visibility];
      })
    );

    expect(legacySummary.visibility).toBe("unlisted");
    expect(explicitSummaries).toEqual({
      private: "private",
      unlisted: "unlisted",
      public: "public",
    });
  });

  it("projects a token-free board preview from current public game state", () => {
    const [summary] = projectOnlineGameSummaries([createPreviewEvent()]);

    expect(summary.livePreview.boardPreview).toEqual({
      radius: 3,
      pieces: [
        { q: 0, r: 0, s: 0, color: "w", type: PieceType.Swordsman },
        { q: 1, r: -1, s: 0, color: "b", type: PieceType.Monarch },
      ],
      castles: [
        { q: 0, r: -3, s: 3, owner: "w" },
        { q: 0, r: 3, s: -3, owner: "w" },
      ],
    });
    expect(JSON.stringify(summary.livePreview.boardPreview)).not.toContain("token");
  });

  it("projects durable participant identities from game creation events", () => {
    const [summary] = projectOnlineGameSummaries([
      {
        ...createPreviewEvent("game_identity_summary"),
        whiteIdentity: { kind: "session", id: "session_white" },
        blackIdentity: {
          kind: "registered",
          id: "user_black",
          displayName: "Black Player",
        },
      },
    ]);

    expect(summary.participants).toEqual([
      {
        seat: "w",
        role: "white",
        identity: { kind: "session", id: "session_white" },
      },
      {
        seat: "b",
        role: "black",
        identity: {
          kind: "registered",
          id: "user_black",
          displayName: "Black Player",
        },
      },
    ]);
    expect(validateOnlineGameSummary(summary).ok).toBe(true);
  });

  it("projects visibility changes without advancing the gameplay version", () => {
    const events = [
      createEvent("game_visible"),
      {
        ...envelope(1),
        type: "visibility_changed",
        gameId: "game_visible",
        visibility: "public",
      },
    ] as OnlineGameEvent[];

    const [summary] = projectOnlineGameSummaries(events);

    expect(summary).toMatchObject({
      gameId: "game_visible",
      updatedAt: "2026-05-31T12:00:01.000Z",
      version: 0,
      visibility: "public",
      lastEventId: "evt-1",
    });
    expect(
      onlineGameEventsToRecords(events, { allowMissingCredentialsForProjection: true })
    ).toMatchObject([
      {
        gameId: "game_visible",
        acceptedActions: [],
      },
    ]);
  });

  it("marks terminal games as archived summaries", () => {
    const [summary] = projectOnlineGameSummaries([
      createEvent("game_resigned"),
      {
        ...envelope(1),
        type: "action_accepted",
        gameId: "game_resigned",
        playerColor: "b",
        clientActionId: "client-action-resigned",
        version: 1,
        playedAt: 2_000,
        action: { type: "RESIGN", baseVersion: 0 },
        clock: {
          remainingMs: { w: 1_200_000, b: 1_200_000 },
          activeColor: null,
          runningSince: null,
        },
      },
    ]);

    expect(summary).toMatchObject({
      status: "complete",
      archiveState: "archived",
      version: 1,
      result: { winner: "w", reason: "resignation" },
    });
  });

  it("allows archived games to change public visibility after the result timestamp", () => {
    const [summary] = projectOnlineGameSummaries([
      createEvent("game_archived_visibility"),
      {
        ...envelope(1),
        type: "action_accepted",
        gameId: "game_archived_visibility",
        playerColor: "b",
        clientActionId: "client-action-archived-visibility",
        version: 1,
        playedAt: 2_000,
        action: { type: "RESIGN", baseVersion: 0 },
        clock: {
          remainingMs: { w: 1_200_000, b: 1_200_000 },
          activeColor: null,
          runningSince: null,
        },
      },
      {
        ...envelope(2),
        type: "visibility_changed",
        gameId: "game_archived_visibility",
        visibility: "public",
      },
    ] as OnlineGameEvent[]);

    expect(summary).toMatchObject({
      gameId: "game_archived_visibility",
      status: "complete",
      archiveState: "archived",
      endedAt: "2026-05-31T12:00:01.000Z",
      updatedAt: "2026-05-31T12:00:02.000Z",
      version: 1,
      visibility: "public",
      result: { winner: "w", reason: "resignation" },
      lastEventId: "evt-2",
    });
    expect(validateOnlineGameSummary(summary).ok).toBe(true);
  });

  it("keeps non-resignation terminal action end time before later visibility changes", () => {
    const [summary] = projectOnlineGameSummaries([
      createTerminalCaptureEvent("game_capture_then_publish"),
      {
        ...envelope(1),
        type: "action_accepted",
        gameId: "game_capture_then_publish",
        playerColor: "w",
        clientActionId: "client-action-capture-then-publish",
        version: 1,
        playedAt: 2_000,
        action: {
          type: "ATTACK",
          baseVersion: 0,
          from: { q: 0, r: 0, s: 0 },
          target: { q: 1, r: -1, s: 0 },
        },
      },
      {
        ...envelope(2),
        type: "visibility_changed",
        gameId: "game_capture_then_publish",
        visibility: "public",
      },
    ] as OnlineGameEvent[]);

    expect(summary).toMatchObject({
      gameId: "game_capture_then_publish",
      status: "complete",
      archiveState: "archived",
      endedAt: "2026-05-31T12:00:01.000Z",
      updatedAt: "2026-05-31T12:00:02.000Z",
      version: 1,
      visibility: "public",
      result: { winner: "w", reason: "monarch_captured" },
      lastEventId: "evt-2",
    });
    expect(validateOnlineGameSummary(summary).ok).toBe(true);
  });

  it("keeps timeout adjudication end time before later visibility changes", () => {
    const [summary] = projectOnlineGameSummaries([
      createEvent("game_timeout_then_publish"),
      {
        ...envelope(1),
        type: "timeout_adjudicated",
        gameId: "game_timeout_then_publish",
        playerColor: "w",
        version: 1,
        adjudicatedAt: 61_000,
        result: { winner: "b", reason: "timeout" },
        clock: {
          remainingMs: { w: 0, b: 1_200_000 },
          activeColor: null,
          runningSince: null,
          flag: { color: "w", at: 61_000 },
        },
      },
      {
        ...envelope(2),
        type: "visibility_changed",
        gameId: "game_timeout_then_publish",
        visibility: "public",
      },
    ] as OnlineGameEvent[]);

    expect(summary).toMatchObject({
      gameId: "game_timeout_then_publish",
      status: "complete",
      archiveState: "archived",
      endedAt: "2026-05-31T12:00:01.000Z",
      updatedAt: "2026-05-31T12:00:02.000Z",
      version: 1,
      visibility: "public",
      result: { winner: "b", reason: "timeout" },
      lastEventId: "evt-2",
    });
    expect(validateOnlineGameSummary(summary).ok).toBe(true);
  });

  it("projects idempotently from the same events", () => {
    const events = [
      createEvent("game_idempotent"),
      {
        ...envelope(1),
        type: "action_accepted",
        gameId: "game_idempotent",
        playerColor: "w",
        clientActionId: "client-action-idempotent",
        version: 1,
        playedAt: 2_000,
        action: { type: "PASS", baseVersion: 0 },
        clock: {
          remainingMs: { w: 1_200_000, b: 1_200_000 },
          activeColor: "b",
          runningSince: 2_000,
        },
      },
    ] satisfies OnlineGameEvent[];

    expect(projectOnlineGameSummaries(events)).toEqual(projectOnlineGameSummaries(events));
  });

  it("keeps access roles explicit for later lobby and challenge flows", () => {
    const [summary] = projectOnlineGameSummaries([createEvent("game_access")]);

    expect(roleForOnlineSeat("w")).toBe("white");
    expect(roleForOnlineSeat("b")).toBe("black");
    expect(canAccessOnlineGameSummary(summary, "white")).toBe(true);
    expect(canAccessOnlineGameSummary(summary, "black")).toBe(true);
    expect(canAccessOnlineGameSummary(summary, "spectator")).toBe(true);
    expect(canAccessOnlineGameSummary({ ...summary, visibility: "private" }, "spectator")).toBe(false);
    expect(canAccessOnlineGameSummary({ ...summary, visibility: "private" }, "challenged")).toBe(true);
    expect(canAccessOnlineGameSummary({ ...summary, visibility: "private" }, "moderator")).toBe(true);
    expect(canAccessOnlineGameSummary({ ...summary, visibility: "private" }, "admin")).toBe(true);
    expect(canListOnlineGameSummary({ ...summary, visibility: "private" })).toBe(false);
    expect(canListOnlineGameSummary({ ...summary, visibility: "unlisted" })).toBe(false);
    expect(canListOnlineGameSummary({ ...summary, visibility: "public" })).toBe(true);
  });

  it("validates future-ready anonymous, session, and registered identities", () => {
    expect(
      validateOnlineGameSummary(
        validSummary({
          participants: [
            { seat: "w", role: "white", identity: { kind: "session", id: "session_white" } },
            {
              seat: "b",
              role: "black",
              identity: {
                kind: "registered",
                id: "user_black",
                displayName: "Black Player",
              },
            },
          ],
        })
      ).ok
    ).toBe(true);

    expect(
      validateOnlineGameSummary(
        validSummary({
          participants: [
            { seat: "w", role: "white", identity: { kind: "bot", id: "bot_white" } as any },
            { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b" } },
          ],
        })
      ).ok
    ).toBe(false);
  });

  it("rejects summaries without the supported summary schema version", () => {
    const summary = validSummary();
    const { schemaVersion: _schemaVersion, ...missingSchemaVersion } = summary;

    expect(validateOnlineGameSummary(missingSchemaVersion).ok).toBe(false);
    expect(validateOnlineGameSummary({ ...summary, schemaVersion: 99 }).ok).toBe(false);
  });

  it("rejects summaries with mismatched participant seats and roles", () => {
    const result = validateOnlineGameSummary(
      validSummary({
        participants: [
          { seat: "w", role: "black", identity: { kind: "anonymous", id: "anon_bad_w" } },
          { seat: "b", role: "white", identity: { kind: "anonymous", id: "anon_bad_b" } },
        ],
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("role");
    }
  });

  it("validates live preview move and clock invariants", () => {
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          moveCount: 0,
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          moveCount: 1,
          lastMove: undefined,
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          clock: undefined,
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary(
        validSummary({
          hasTimeControl: false,
          livePreview: {
            sideToMove: "w",
            turnPhase: "Movement",
            moveCount: 0,
            boardPreview: validSummary().livePreview.boardPreview,
            clock: {
              timeControl: { initialMs: 60_000, incrementMs: 0 },
              remainingMs: { w: 60_000, b: 60_000 },
              activeColor: "w",
              runningSince: 0,
            },
          },
        })
      ).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          clock: {
            ...validSummary().livePreview.clock!,
            serverNow: "now",
          },
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          boardPreview: undefined,
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          boardPreview: {
            ...validSummary().livePreview.boardPreview,
            radius: 13,
          },
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          boardPreview: {
            ...validSummary().livePreview.boardPreview,
            pieces: [
              {
                q: 7,
                r: 0,
                s: -7,
                color: "w",
                type: PieceType.Monarch,
              },
            ],
          },
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          boardPreview: {
            ...validSummary().livePreview.boardPreview,
            pieces: [
              {
                q: 0,
                r: 6,
                s: -6,
                color: "w",
                type: "token=secret",
              },
            ],
          },
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          boardPreview: {
            ...validSummary().livePreview.boardPreview,
            pieces: [
              { q: 0, r: 6, s: -6, color: "w", type: PieceType.Monarch },
              { q: 0, r: 6, s: -6, color: "b", type: PieceType.Archer },
            ],
          },
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary({
        ...validSummary(),
        livePreview: {
          ...validSummary().livePreview,
          boardPreview: {
            ...validSummary().livePreview.boardPreview,
            castles: [
              { q: 0, r: 6, s: -6, owner: "w" },
              { q: 0, r: 6, s: -6, owner: "b" },
            ],
          },
        },
      }).ok
    ).toBe(false);
  });

  it("rejects contradictory summary lifecycle states", () => {
    expect(
      validateOnlineGameSummary(
        validSummary({
          status: "active",
          result: { winner: "w", reason: "resignation" },
        })
      ).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary(
        validSummary({
          status: "active",
          endedAt: "2026-05-31T12:00:02.000Z",
        })
      ).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary(
        validSummary({
          status: "complete",
          archiveState: "active",
          endedAt: "2026-05-31T12:00:02.000Z",
          result: { winner: "w", reason: "resignation" },
        })
      ).ok
    ).toBe(false);
  });

  it("rejects summaries with impossible timestamp ordering", () => {
    expect(
      validateOnlineGameSummary(
        validSummary({
          createdAt: "2026-05-31T12:00:02.000Z",
          updatedAt: "2026-05-31T12:00:01.000Z",
        })
      ).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary(
        validSummary({
          status: "complete",
          archiveState: "archived",
          createdAt: "2026-05-31T12:00:03.000Z",
          updatedAt: "2026-05-31T12:00:04.000Z",
          endedAt: "2026-05-31T12:00:02.000Z",
          result: { winner: "w", reason: "resignation" },
        })
      ).ok
    ).toBe(false);
    expect(
      validateOnlineGameSummary(
        validSummary({
          status: "complete",
          archiveState: "archived",
          createdAt: "2026-05-31T12:00:00.000Z",
          updatedAt: "2026-05-31T12:00:02.000Z",
          endedAt: "2026-05-31T12:00:03.000Z",
          result: { winner: "w", reason: "resignation" },
        })
      ).ok
    ).toBe(false);
  });
});
