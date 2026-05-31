import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";
import {
  ONLINE_EVENT_SCHEMA_VERSION,
  ONLINE_RULESET_VERSION,
  onlineGameEventsToRecords,
} from "../events";
import { OnlineGameService } from "../OnlineGameService";

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

function eventEnvelope(index: number) {
  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: `evt-${index}`,
    createdAt: `2026-05-31T12:00:0${index}.000Z`,
    rulesetVersion: ONLINE_RULESET_VERSION,
  } as const;
}

describe("OnlineGameService", () => {
  it("creates private invite URLs and stores reconnectable rooms", () => {
    const service = new OnlineGameService();

    const created = service.createGame(createSetup(), {
      publicBaseUrl: "https://castles.example",
    });

    expect(created.gameId).toMatch(/^game_/);
    expect(created.white.url).toContain("onlineGame=");
    expect(created.white.url).toContain("seat=w");
    expect(created.black.url).toContain("seat=b");

    const whiteRoom = service.getRoomForToken(created.gameId, created.white.token);
    const blackRoom = service.getRoomForToken(created.gameId, created.black.token);

    expect(whiteRoom?.authenticate(created.white.token)).toBe("w");
    expect(blackRoom?.authenticate(created.black.token)).toBe("b");
  });

  it("rebuilds rooms from replayed game events", () => {
    const setup = createSetup();
    const restored = OnlineGameService.fromRecords(
      onlineGameEventsToRecords([
        {
          ...eventEnvelope(1),
          type: "game_created",
          gameId: "game_fixed",
          whiteToken: "w-token",
          blackToken: "b-token",
          setup,
        },
        {
          ...eventEnvelope(2),
          type: "action_accepted",
          gameId: "game_fixed",
          playerColor: "w",
          version: 1,
          action: { type: "PASS", baseVersion: 0 },
        },
      ])
    );
    const restoredRoom = restored.getRoomForToken("game_fixed", "w-token");

    expect(restoredRoom?.getSnapshot().version).toBe(1);
    expect(restoredRoom?.getSnapshot().moveHistory.at(-1)?.notation).toBe("Pass");
  });

  it("preserves which player submitted an out-of-turn resignation when rebuilding", () => {
    const restored = OnlineGameService.fromRecords(
      onlineGameEventsToRecords([
        {
          ...eventEnvelope(1),
          type: "game_created",
          gameId: "game_resign",
          whiteToken: "w-token",
          blackToken: "b-token",
          setup: createSetup(),
        },
        {
          ...eventEnvelope(2),
          type: "action_accepted",
          gameId: "game_resign",
          playerColor: "b",
          version: 1,
          action: { type: "RESIGN", baseVersion: 0 },
        },
      ])
    );

    expect(restored.getRoom("game_resign")?.getSnapshot().result?.winner).toBe("w");
  });
});
