import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseRestoreDrillArgs,
  requireRestoreDrillTarget,
  restoreOnlinePostgresBackupTables,
} from "../postgres-online-restore-drill.mjs";

function createRestoreBackup({ outputPath, rowCount = 2 } = {}) {
  return writeFile(
    outputPath,
    JSON.stringify(
      {
        format: "castles-postgres-online-backup-v1",
        createdAt: "2026-06-15T13:00:00.000Z",
        database: "postgresql://<user>@localhost:5432/castles_local",
        tableCount: 2,
        rowCount,
        tables: [
          {
            name: "online_accounts",
            columns: ["account_id", "display_name", "created_at"],
            rowCount: 1,
            rows: [
              {
                account_id: "account_restore_1",
                display_name: "Restore One",
                created_at: "2026-06-15T12:00:00.000Z",
              },
            ],
          },
          {
            name: "online_game_events",
            columns: ["id", "event_id", "game_id", "payload"],
            rowCount: 1,
            rows: [
              {
                id: "42",
                event_id: "event_restore_1",
                game_id: "game_restore_1",
                payload: { type: "game_created" },
              },
            ],
          },
        ],
      },
      null,
      2
    )
  );
}

function fakeRestoreClient({ badCountTable } = {}) {
  const queries = [];
  const restoredCounts = new Map();
  return {
    queries,
    async connect() {
      queries.push({ text: "connect" });
    },
    async end() {
      queries.push({ text: "end" });
    },
    async query(text, values) {
      queries.push({ text, values });
      if (/^INSERT INTO ([a-z_]+)/i.test(text)) {
        const table = text.match(/^INSERT INTO ([a-z_]+)/i)[1];
        restoredCounts.set(table, (restoredCounts.get(table) ?? 0) + 1);
        return { rows: [] };
      }
      if (/SELECT COUNT\(\*\)::int AS count FROM ([a-z_]+)/i.test(text)) {
        const table = text.match(/FROM ([a-z_]+)/i)[1];
        const count = badCountTable === table ? 0 : restoredCounts.get(table) ?? 0;
        return { rows: [{ count }] };
      }
      if (/pg_get_serial_sequence/i.test(text)) {
        const table = values?.[0];
        const column = values?.[1];
        return {
          rows: [
            {
              sequence_name: table === "online_game_events" && column === "id"
                ? "public.online_game_events_id_seq"
                : null,
            },
          ],
        };
      }
      if (/SELECT COALESCE\(MAX\(id\)::bigint, 0\) AS max_id FROM online_game_events/i.test(text)) {
        return { rows: [{ max_id: "42" }] };
      }
      return { rows: [] };
    },
  };
}

describe("PostgreSQL online restore drill", () => {
  it("parses a backup path and explicit restore target without accepting DATABASE_URL by accident", () => {
    expect(
      parseRestoreDrillArgs([
        "--backup",
        "backup.json",
        "--target-database-url",
        "postgresql://restore:restore@localhost:5432/castles_restore",
      ])
    ).toEqual({
      backupPath: "backup.json",
      requireAllTables: true,
      targetDatabaseUrl: "postgresql://restore:restore@localhost:5432/castles_restore",
    });
    expect(() => parseRestoreDrillArgs(["--backup"])).toThrow(/--backup requires/);
    expect(() => parseRestoreDrillArgs(["--target-database-url"])).toThrow(
      /--target-database-url requires/
    );
    expect(() => parseRestoreDrillArgs(["--backup", "backup.json", "--unknown"])).toThrow(
      /Unknown argument/
    );
    expect(parseRestoreDrillArgs(["backup.json"])).toEqual({
      backupPath: "backup.json",
      requireAllTables: true,
    });
  });

  it("requires a local disposable restore target unless the operator explicitly allows one", () => {
    expect(() =>
      requireRestoreDrillTarget(
        "postgresql://castles_local:castles_local_dev@localhost:5432/castles_local",
        { env: {} }
      )
    ).toThrow(/disposable restore target/);
    expect(() =>
      requireRestoreDrillTarget(
        "postgresql://castles_restore:castles_restore_dev@db.example:5432/castles_restore",
        { env: {} }
      )
    ).toThrow(/non-local/);
    expect(() =>
      requireRestoreDrillTarget(
        "postgresql://castles_restore:castles_restore_dev@db.example:5432/castles",
        { env: { CASTLES_ALLOW_DISPOSABLE_RESTORE_DB: "1" } }
      )
    ).toThrow(/not a disposable restore target/);

    expect(
      requireRestoreDrillTarget(
        "postgresql://castles_restore:castles_restore_dev@localhost:5432/castles_restore",
        { env: {} }
      )
    ).toMatchObject({
      databaseName: "castles_restore",
      isLocal: true,
    });
    expect(
      requireRestoreDrillTarget(
        "postgresql://castles_restore:castles_restore_dev@db.example:5432/castles_restore",
        { env: { CASTLES_ALLOW_DISPOSABLE_RESTORE_DB: "1" } }
      )
    ).toMatchObject({
      databaseName: "castles_restore",
      isLocal: false,
    });
  });

  it("restores a validated backup into a clean target and verifies table counts", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "castles-postgres-restore-"));
    const backupPath = path.join(repoRoot, "online-postgres.json");
    await createRestoreBackup({ outputPath: backupPath });
    const client = fakeRestoreClient();
    const initializeSchema = vi.fn(async () => {});
    const log = vi.fn();

    try {
      const result = await restoreOnlinePostgresBackupTables({
        backupPath,
        connectionString: "postgresql://restore:restore@localhost:5432/castles_restore",
        createClient: () => client,
        initializeSchema,
        log,
        tables: [
          { name: "online_accounts", orderBy: "account_id ASC" },
          { name: "online_game_events", orderBy: "id ASC" },
        ],
      });

      expect(initializeSchema).toHaveBeenCalledWith({
        connectionString: "postgresql://restore:restore@localhost:5432/castles_restore",
      });
      expect(result).toEqual({
        backupPath,
        rowCount: 2,
        tableCount: 2,
      });
      expect(client.queries.map((query) => query.text)).toContain("BEGIN");
      expect(client.queries.some((query) => /TRUNCATE TABLE online_accounts, online_game_events RESTART IDENTITY CASCADE/.test(query.text))).toBe(
        true
      );
      expect(client.queries.some((query) => /^INSERT INTO online_accounts/i.test(query.text))).toBe(true);
      expect(client.queries.some((query) => /^INSERT INTO online_game_events/i.test(query.text))).toBe(true);
      expect(client.queries.some((query) => /pg_get_serial_sequence/i.test(query.text))).toBe(true);
      expect(client.queries.map((query) => query.text)).toContain("COMMIT");
      expect(client.queries.map((query) => query.text)).toContain("end");
      expect(log.mock.calls.flat().join("\n")).not.toContain("restore:restore");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("rolls back when restored counts do not match the backup", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "castles-postgres-restore-mismatch-"));
    const backupPath = path.join(repoRoot, "online-postgres.json");
    await createRestoreBackup({ outputPath: backupPath });
    const client = fakeRestoreClient({ badCountTable: "online_game_events" });

    try {
      await expect(
        restoreOnlinePostgresBackupTables({
          backupPath,
          connectionString: "postgresql://restore:restore@localhost:5432/castles_restore",
          createClient: () => client,
          initializeSchema: async () => {},
          tables: [
            { name: "online_accounts", orderBy: "account_id ASC" },
            { name: "online_game_events", orderBy: "id ASC" },
          ],
        })
      ).rejects.toThrow(/Restore count mismatch for online_game_events/);
      expect(client.queries.map((query) => query.text)).toContain("ROLLBACK");
      expect(client.queries.map((query) => query.text)).toContain("end");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
