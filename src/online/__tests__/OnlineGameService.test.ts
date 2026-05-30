import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";
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

  it("rebuilds rooms from persisted room records and action history", () => {
    const service = new OnlineGameService({
      idFactory: () => "game_fixed",
      tokenFactory: (seat) => `${seat}-token`,
    });

    const created = service.createGame(createSetup(), {
      publicBaseUrl: "https://castles.example",
    });
    const room = service.getRoomForToken(created.gameId, created.white.token);
    if (!room) throw new Error("room missing");

    const actionResult = room.submitAction(created.white.token, {
      type: "PASS",
      baseVersion: 0,
    });
    expect(actionResult.ok).toBe(true);

    const restored = OnlineGameService.fromRecords(service.toRecords());
    const restoredRoom = restored.getRoomForToken(created.gameId, created.white.token);

    expect(restoredRoom?.getSnapshot().version).toBe(1);
    expect(restoredRoom?.getSnapshot().moveHistory.at(-1)?.notation).toBe("Pass");
  });

  it("preserves which player submitted an out-of-turn resignation when rebuilding", () => {
    const service = new OnlineGameService({
      idFactory: () => "game_resign",
      tokenFactory: (seat) => `${seat}-token`,
    });

    const created = service.createGame(createSetup(), {
      publicBaseUrl: "https://castles.example",
    });
    const room = service.getRoomForToken(created.gameId, created.black.token);
    if (!room) throw new Error("room missing");

    const resign = room.submitAction(created.black.token, {
      type: "RESIGN",
      baseVersion: 0,
    });
    expect(resign.ok).toBe(true);
    expect(resign.snapshot.result?.winner).toBe("w");

    const restored = OnlineGameService.fromRecords(service.toRecords());

    expect(restored.getRoom(created.gameId)?.getSnapshot().result?.winner).toBe("w");
  });

  it("skips corrupt persisted records without losing valid rooms", () => {
    const service = new OnlineGameService({
      idFactory: () => "game_valid",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const created = service.createGame(createSetup(), {
      publicBaseUrl: "https://castles.example",
    });
    const errors: Array<{ gameId?: string; error: unknown }> = [];

    const restored = OnlineGameService.fromRecords(
      [
        {
          gameId: "game_broken",
          whiteToken: "white",
          blackToken: "black",
          setup: { board: null, pieces: [], sanctuaries: [] },
          acceptedActions: [],
        } as any,
        ...service.toRecords(),
      ],
      {
        onRecordError: (gameId, error) => errors.push({ gameId, error }),
      }
    );

    expect(restored.getRoom(created.gameId)?.authenticate(created.white.token)).toBe("w");
    expect(errors).toHaveLength(1);
    expect(errors[0].gameId).toBe("game_broken");
  });
});
