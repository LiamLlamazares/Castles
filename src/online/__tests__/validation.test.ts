import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";
import { validateOnlineGameEvent } from "../events";
import { validateOnlineAction, validateOnlineGameSetup } from "../validation";

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

  it("requires accepted action events to include the submitting player", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: 1,
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
      whiteToken: "w-token",
      blackToken: "b-token",
      setup: createSetup(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("schemaVersion");
    }
  });

  it("requires event timestamps to use the JSONL v1 ISO format", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: 1,
      eventId: "evt-create",
      createdAt: "May 31 2026",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_test",
      whiteToken: "w-token",
      blackToken: "b-token",
      setup: createSetup(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("createdAt");
    }
  });

  it("rejects normalized but invalid calendar dates in event timestamps", () => {
    const result = validateOnlineGameEvent({
      schemaVersion: 1,
      eventId: "evt-create",
      createdAt: "2026-02-31T00:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_test",
      whiteToken: "w-token",
      blackToken: "b-token",
      setup: createSetup(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("createdAt");
    }
  });
});
