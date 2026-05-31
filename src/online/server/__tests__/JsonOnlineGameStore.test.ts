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
      schemaVersion: 1,
      eventId: "evt-create",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
      gameId: "game_persisted",
      whiteToken: "w-token",
      blackToken: "b-token",
      setup,
    });
    await store.appendEvent({
      schemaVersion: 1,
      eventId: "evt-action-1",
      createdAt: "2026-05-31T12:00:01.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "action_accepted",
      gameId: "game_persisted",
      playerColor: "w",
      version: 1,
      action: { type: "PASS", baseVersion: 0 },
    });

    const raw = await readFile(filePath, "utf8");
    const lines = raw.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({
      schemaVersion: 1,
      eventId: "evt-create",
      createdAt: "2026-05-31T12:00:00.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "game_created",
    });
    expect(JSON.parse(lines[1])).toMatchObject({
      schemaVersion: 1,
      eventId: "evt-action-1",
      createdAt: "2026-05-31T12:00:01.000Z",
      rulesetVersion: "castles-beta-v1",
      type: "action_accepted",
      gameId: "game_persisted",
      playerColor: "w",
      version: 1,
    });

    const records = await store.load();
    const restored = OnlineGameService.fromRecords(records);

    expect(restored.getRoom("game_persisted")?.getSnapshot().version).toBe(1);
  });

  it("rejects corrupt event log lines instead of replaying partial history", async () => {
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
          schemaVersion: 1,
          eventId: "evt-create",
          createdAt: "2026-05-31T12:00:00.000Z",
          rulesetVersion: "castles-beta-v1",
          type: "game_created",
          gameId: "game_corrupt_recovery",
          whiteToken: "w-token",
          blackToken: "b-token",
          setup,
        }),
        "{not-json",
        JSON.stringify({
          schemaVersion: 1,
          eventId: "evt-action-1",
          createdAt: "2026-05-31T12:00:01.000Z",
          rulesetVersion: "castles-beta-v1",
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

    await expect(
      store.load({
      onEventError: (line, error) => errors.push({ line, error }),
      })
    ).rejects.toThrow();

    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
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
            schemaVersion: 1,
            eventId: `evt-create-${index}`,
            createdAt: `2026-05-31T12:00:${String(index).padStart(2, "0")}.000Z`,
            rulesetVersion: "castles-beta-v1",
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

  it("rejects legacy event log entries without a v1 envelope", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-"));
    tempDirs.push(dir);
    const store = new JsonOnlineGameStore(join(dir, "games.jsonl"));
    const setup = createSetup();

    await expect(
      store.appendEvent({
        type: "game_created",
        gameId: "game_legacy",
        whiteToken: "w-token",
        blackToken: "b-token",
        setup,
      } as any)
    ).rejects.toThrow(/schemaVersion/);
  });

  it("checks readiness by opening the target event log file for append", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-"));
    tempDirs.push(dir);
    const filePath = join(dir, "games.jsonl");
    const store = new JsonOnlineGameStore(filePath);

    await expect(store.checkReady()).resolves.toBe(true);

    const raw = await readFile(filePath, "utf8");
    expect(raw).toBe("");
  });
});
