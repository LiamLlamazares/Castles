import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  it("appends and replays online game events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-"));
    tempDirs.push(dir);
    const filePath = join(dir, "games.jsonl");
    const store = new JsonOnlineGameStore(filePath);
    const setup = createSetup();

    await store.appendEvent({
      type: "game_created",
      gameId: "game_persisted",
      whiteToken: "w-token",
      blackToken: "b-token",
      setup,
    });
    await store.appendEvent({
      type: "action_accepted",
      gameId: "game_persisted",
      playerColor: "w",
      version: 1,
      action: { type: "PASS", baseVersion: 0 },
    });

    const raw = await readFile(filePath, "utf8");
    const lines = raw.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ type: "game_created" });
    expect(JSON.parse(lines[1])).toMatchObject({
      type: "action_accepted",
      gameId: "game_persisted",
      playerColor: "w",
      version: 1,
    });

    const records = await store.load();
    const restored = OnlineGameService.fromRecords(records);

    expect(restored.getRoom("game_persisted")?.getSnapshot().version).toBe(1);
  });

  it("skips corrupt event log lines while loading valid events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-"));
    tempDirs.push(dir);
    const filePath = join(dir, "games.jsonl");
    const store = new JsonOnlineGameStore(filePath);
    const setup = createSetup();
    const errors: Array<{ line: number; error: unknown }> = [];

    await writeFile(
      filePath,
      [
        JSON.stringify({
          type: "game_created",
          gameId: "game_corrupt_recovery",
          whiteToken: "w-token",
          blackToken: "b-token",
          setup,
        }),
        "{not-json",
        JSON.stringify({
          type: "action_accepted",
          gameId: "game_corrupt_recovery",
          playerColor: "w",
          version: 1,
          action: { type: "PASS", baseVersion: 0 },
        }),
        "",
      ].join("\n"),
      "utf8"
    );

    const records = await store.load({
      onEventError: (line, error) => errors.push({ line, error }),
    });
    const restored = OnlineGameService.fromRecords(records);

    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
    expect(restored.getRoom("game_corrupt_recovery")?.getSnapshot().version).toBe(1);
  });

  it("serializes overlapping event appends through one write queue", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-"));
    tempDirs.push(dir);
    const store = new JsonOnlineGameStore(join(dir, "games.jsonl"));
    const setup = createSetup();

    await expect(
      Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          store.appendEvent({
            type: "game_created",
            gameId: `game_${index}`,
            whiteToken: `w-token-${index}`,
            blackToken: `b-token-${index}`,
            setup,
          })
        )
      )
    ).resolves.toBeDefined();

    const loaded = await store.load();
    expect(loaded).toHaveLength(20);
    expect(loaded.map((record) => record.gameId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `game_${index}`)
    );
  });
});
