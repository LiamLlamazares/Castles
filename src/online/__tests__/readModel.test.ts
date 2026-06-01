import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";
import {
  ONLINE_EVENT_SCHEMA_VERSION,
  ONLINE_RULESET_VERSION,
  onlineGameEventsToRecords,
  type OnlineGameEvent,
} from "../events";
import {
  ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
  canAccessOnlineGameSummary,
  canListOnlineGameSummary,
  projectOnlineGameSummaries,
  roleForOnlineSeat,
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

function validSummary(overrides: Partial<OnlineGameSummary> = {}): OnlineGameSummary {
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
    lastEventId: "evt-valid",
    ...overrides,
  };
}

describe("online read model", () => {
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
