import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ONLINE_EVENT_SCHEMA_VERSION,
  ONLINE_RULESET_VERSION,
  type OnlineGameEvent,
} from "../../events";
import { migrateJsonOnlineEventsToPostgres } from "../migrateJsonOnlineEventsToPostgres";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createGameEvent(index: number): OnlineGameEvent {
  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: `evt-${index}`,
    createdAt: `2026-05-31T12:00:0${index}.000Z`,
    rulesetVersion: ONLINE_RULESET_VERSION,
    type: "game_created",
    gameId: `game_${index}`,
    whiteToken: `w-token-${index}`,
    blackToken: `b-token-${index}`,
    setup: {
      board: { config: { nSquares: 3 }, castles: [] },
      pieces: [],
      sanctuaries: [],
    },
  };
}

function createActionEventBeforeGame(): OnlineGameEvent {
  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: "evt-action-before-create",
    createdAt: "2026-05-31T12:00:01.000Z",
    rulesetVersion: ONLINE_RULESET_VERSION,
    type: "action_accepted",
    gameId: "missing_game",
    playerColor: "w",
    version: 1,
    action: { type: "PASS", baseVersion: 0 },
  };
}

describe("migrateJsonOnlineEventsToPostgres", () => {
  it("validates JSONL events and imports them in file order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-migrate-"));
    tempDirs.push(dir);
    const sourcePath = join(dir, "games.jsonl");
    const events = [createGameEvent(1), createGameEvent(2)];
    await writeFile(sourcePath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
    const imported: OnlineGameEvent[] = [];

    const result = await migrateJsonOnlineEventsToPostgres({
      sourcePath,
      store: {
        importEventIfMissing: async (event) => {
          imported.push(event);
        },
      },
    });

    expect(result).toEqual({ imported: 2 });
    expect(imported.map((event) => event.eventId)).toEqual(["evt-1", "evt-2"]);
  });

  it("fails on corrupt JSONL instead of partially migrating silently", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-migrate-"));
    tempDirs.push(dir);
    const sourcePath = join(dir, "games.jsonl");
    await writeFile(sourcePath, `${JSON.stringify(createGameEvent(1))}\n{not-json\n`, "utf8");
    const imported: OnlineGameEvent[] = [];

    await expect(
      migrateJsonOnlineEventsToPostgres({
        sourcePath,
        store: {
          importEventIfMissing: async (event) => {
            imported.push(event);
          },
        },
      })
    ).rejects.toThrow();

    expect(imported).toEqual([]);
  });

  it("validates replay order before importing any events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-migrate-"));
    tempDirs.push(dir);
    const sourcePath = join(dir, "games.jsonl");
    await writeFile(
      sourcePath,
      `${JSON.stringify(createActionEventBeforeGame())}\n${JSON.stringify(createGameEvent(1))}\n`,
      "utf8"
    );
    const imported: OnlineGameEvent[] = [];

    await expect(
      migrateJsonOnlineEventsToPostgres({
        sourcePath,
        store: {
          importEventIfMissing: async (event) => {
            imported.push(event);
          },
        },
      })
    ).rejects.toThrow(/line 1/);

    expect(imported).toEqual([]);
  });

  it("rejects duplicate event ids before importing any events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "castles-online-migrate-"));
    tempDirs.push(dir);
    const sourcePath = join(dir, "games.jsonl");
    const first = createGameEvent(1);
    const second = { ...createGameEvent(2), eventId: first.eventId };
    await writeFile(sourcePath, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`, "utf8");
    const imported: OnlineGameEvent[] = [];

    await expect(
      migrateJsonOnlineEventsToPostgres({
        sourcePath,
        store: {
          importEventIfMissing: async (event) => {
            imported.push(event);
          },
        },
      })
    ).rejects.toThrow(/Duplicate online event id/);

    expect(imported).toEqual([]);
  });
});
