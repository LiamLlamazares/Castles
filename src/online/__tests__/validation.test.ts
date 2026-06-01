import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";
import { ONLINE_EVENT_SCHEMA_VERSION, validateOnlineGameEvent } from "../events";
import { ONLINE_PROTOCOL_VERSION } from "../protocolVersion";
import { validateClientMessage, validateOnlineAction, validateOnlineGameSetup } from "../validation";

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
  });
}

describe("online validation", () => {
  it("accepts a valid generated online setup", () => {
    expect(validateOnlineGameSetup(createSetup()).ok).toBe(true);
  });

  it("preserves bounded time controls in online setup validation", () => {
    const setup = {
      ...createSetup(),
      timeControl: { initial: 5, increment: 3 },
    };

    const result = validateOnlineGameSetup(setup);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timeControl).toEqual({ initial: 5, increment: 3 });
    }
  });

  it("rejects invalid online time controls", () => {
    const setup = {
      ...createSetup(),
      timeControl: { initial: 0, increment: -1 },
    };

    const result = validateOnlineGameSetup(setup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("timeControl");
    }
  });

  it("rejects malformed hex coordinates before hydration can throw", () => {
    const setup = createSetup();
    setup.pieces[0] = {
      ...setup.pieces[0],
      hex: { q: 1, r: 1, s: 1 },
    };

    const result = validateOnlineGameSetup(setup);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad_request");
      expect(result.error.message).toContain("hex");
    }
  });

  it("rejects action payloads with unknown types or invalid versions", () => {
    expect(validateOnlineAction({ type: "NOPE", baseVersion: 0 }).ok).toBe(false);
    expect(validateOnlineAction({ type: "PASS", baseVersion: -1 }).ok).toBe(false);
    expect(validateOnlineAction({ type: "PASS", baseVersion: 1.5 }).ok).toBe(false);
  });

  it("rejects action hex payloads that do not satisfy cube coordinates", () => {
    const result = validateOnlineAction({
      type: "MOVE",
      baseVersion: 0,
      from: { q: 0, r: 0, s: 0 },
      to: { q: 1, r: 1, s: 1 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("hex");
    }
  });

  it("validates spectator websocket messages", () => {
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "spectate",
        gameId: "game_test",
      })
    ).toEqual({
      ok: true,
      value: {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "spectate",
        gameId: "game_test",
        lastSeenVersion: undefined,
      },
    });
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "spectate",
        gameId: "",
      }).ok
    ).toBe(false);
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "spectate",
        gameId: "g",
        lastSeenVersion: -1,
      }).ok
    ).toBe(false);
  });

  it("requires supported protocol versions on websocket client messages", () => {
    expect(validateClientMessage({ type: "ping" }).ok).toBe(false);
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION + 1,
        type: "ping",
      }).ok
    ).toBe(false);
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "ping",
        clientTime: 123,
      })
    ).toEqual({
      ok: true,
      value: {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "ping",
        clientTime: 123,
      },
    });
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "join",
        gameId: "game_test",
        token: "white-token",
      })
    ).toEqual({
      ok: true,
      value: {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "join",
        gameId: "game_test",
        token: "white-token",
        lastSeenVersion: undefined,
      },
    });
  });

  it("requires online action messages to include a bounded client action id", () => {
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "action",
        clientActionId: "action_1",
        action: { type: "PASS", baseVersion: 0 },
      })
    ).toEqual({
      ok: true,
      value: {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "action",
        clientActionId: "action_1",
        action: { type: "PASS", baseVersion: 0 },
      },
    });
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "action",
        action: { type: "PASS", baseVersion: 0 },
      }).ok
    ).toBe(false);
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "action",
        clientActionId: "",
        action: { type: "PASS", baseVersion: 0 },
      }).ok
    ).toBe(false);
    expect(
      validateClientMessage({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "action",
        clientActionId: "x".repeat(129),
        action: { type: "PASS", baseVersion: 0 },
      }).ok
    ).toBe(false);
  });

  it("requires accepted action events to include the submitting player", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-action-1",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "action_accepted",
      gameId: "game_test",
      version: 1,
      action: { type: "RESIGN", baseVersion: 0 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("playerColor");
    }
  });

  it("rejects event log entries without the v1 envelope metadata", () => {
    const result = validateOnlineGameEvent({
      type: "game_created",
      gameId: "game_test",
      setup: createSetup(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("schemaVersion");
    }
  });

  it("accepts token-free game creation events", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-create",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_test",
      setup: createSetup(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.value)).not.toContain("token");
    }
  });

  it("rejects raw player tokens in durable creation events", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-create-with-tokens",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_test",
      whiteToken: "w-token",
      blackToken: "b-token",
      setup: createSetup(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("tokens");
    }
  });

  it("requires event timestamps to use the online v1 ISO format", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-create",
      createdAt: "May 31 2026",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_test",
      setup: createSetup(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("createdAt");
    }
  });

  it("rejects creation event clocks when the game has no time control", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-create-clockless",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_test",
      setup: createSetup(),
      clock: {
        remainingMs: { w: 60_000, b: 60_000 },
        activeColor: "w",
        runningSince: 1_000,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("clock");
    }
  });

  it("requires creation event clocks when the game has a time control", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-create-clocked",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_test",
      setup: {
        ...createSetup(),
        timeControl: { initial: 1, increment: 0 },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("clock");
    }
  });

  it("requires accepted action events to include the server acceptance time", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-action-time",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "action_accepted",
      gameId: "game_test",
      playerColor: "w",
      clientActionId: "client-action-time",
      version: 1,
      action: { type: "PASS", baseVersion: 0 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("playedAt");
    }
  });

  it("requires accepted action events to include the client action id", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-action-client-id",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "action_accepted",
      gameId: "game_test",
      playerColor: "w",
      version: 1,
      playedAt: 1_000,
      action: { type: "PASS", baseVersion: 0 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("clientActionId");
    }
  });

  it("rejects normalized but invalid calendar dates in event timestamps", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-create",
      createdAt: "2026-02-31T00:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_test",
      setup: createSetup(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("createdAt");
    }
  });
});
