import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../../ConstantImports";
import { SanctuaryGenerator } from "../../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../../Constants";
import { serializeOnlineGameSetup } from "../../serialization";
import { OnlineGameService } from "../../OnlineGameService";
import { JsonOnlineGameStore } from "../JsonOnlineGameStore";

const tempDirs: string[] = [];

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

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("JsonOnlineGameStore", () => {
  it("saves and loads online room records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-"));
    tempDirs.push(dir);
    const store = new JsonOnlineGameStore(join(dir, "games.json"));

    const service = new OnlineGameService({
      idFactory: () => "game_persisted",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const created = service.createGame(createSetup(), {
      publicBaseUrl: "https://castles.example",
    });
    const room = service.getRoomForToken(created.gameId, created.white.token);
    if (!room) throw new Error("room missing");
    room.submitAction(created.white.token, { type: "PASS", baseVersion: 0 });

    await store.save(service.toRecords());

    const records = await store.load();
    const restored = OnlineGameService.fromRecords(records);

    expect(restored.getRoom(created.gameId)?.getSnapshot().version).toBe(1);
  });
});
