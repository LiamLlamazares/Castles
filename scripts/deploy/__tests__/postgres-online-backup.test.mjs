import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ONLINE_BACKUP_TABLES,
  backupOnlinePostgresTables,
  loadBackupEnvironment,
  parseBackupArgs,
} from "../postgres-online-backup.mjs";

function fakeClient({ existingTables, tableRows }) {
  const queries = [];
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
      if (/from information_schema\.tables/i.test(text)) {
        return {
          rows: [...existingTables].map((table_name) => ({ table_name })),
        };
      }
      const table = String(text.match(/from\s+([a-z_]+)/i)?.[1] ?? "");
      return {
        fields: Object.keys(tableRows[table]?.[0] ?? {}).map((name) => ({ name })),
        rows: tableRows[table] ?? [],
      };
    },
  };
}

describe("PostgreSQL online backup helper", () => {
  it("keeps the current online persistence tables in the backup whitelist", () => {
    expect(ONLINE_BACKUP_TABLES.map((table) => table.name)).toEqual([
      "online_accounts",
      "online_account_display_names",
      "online_account_sessions",
      "online_account_external_logins",
      "online_account_privacy_settings",
      "online_account_follows",
      "online_account_blocks",
      "online_account_ratings",
      "online_account_reports",
      "online_account_report_audit",
      "online_game_events",
      "online_game_credentials",
      "online_game_additional_credentials",
      "online_game_summaries",
      "online_challenge_events",
      "online_challenge_credentials",
      "online_challenge_summaries",
      "online_seek_events",
      "online_seek_credentials",
      "online_seek_summaries",
      "online_rating_results",
      "online_game_locks",
      "online_challenge_locks",
      "online_seek_locks",
    ]);
  });

  it("writes a deterministic JSON snapshot for existing whitelisted tables only", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "castles-postgres-backup-"));
    const outputPath = path.join(repoRoot, "backup", "online.json");
    const client = fakeClient({
      existingTables: new Set(["online_accounts", "online_game_events", "unrelated_table"]),
      tableRows: {
        online_accounts: [
          {
            account_id: "acct_1",
            display_name: "Ada",
            password_hash: "hash",
          },
        ],
        online_game_events: [
          {
            id: "7",
            event_id: "evt_1",
            game_id: "game_1",
            payload: { type: "game_created" },
          },
        ],
      },
    });

    try {
      const result = await backupOnlinePostgresTables({
        createClient: () => client,
        createdAt: "2026-06-05T22:40:00.000Z",
        databaseDescription: "postgresql://<user>@db.example/castles",
        outputPath,
      });
      const backup = JSON.parse(await readFile(outputPath, "utf8"));

      expect(result).toEqual({
        existingTableCount: 2,
        outputPath,
        rowCount: 2,
        tableCount: 2,
      });
      expect(backup).toEqual({
        format: "castles-postgres-online-backup-v1",
        createdAt: "2026-06-05T22:40:00.000Z",
        database: "postgresql://<user>@db.example/castles",
        tableCount: 2,
        rowCount: 2,
        tables: [
          {
            name: "online_accounts",
            columns: ["account_id", "display_name", "password_hash"],
            rowCount: 1,
            rows: [
              {
                account_id: "acct_1",
                display_name: "Ada",
                password_hash: "hash",
              },
            ],
          },
          {
            name: "online_game_events",
            columns: ["id", "event_id", "game_id", "payload"],
            rowCount: 1,
            rows: [
              {
                id: "7",
                event_id: "evt_1",
                game_id: "game_1",
                payload: { type: "game_created" },
              },
            ],
          },
        ],
      });
      expect(client.queries.map((query) => query.text)).toContain("end");
      expect(client.queries.some((query) => /unrelated_table/i.test(query.text))).toBe(false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("loads DATABASE_URL from an env file without replacing explicit process env", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "castles-postgres-backup-env-"));
    const envFile = path.join(repoRoot, "castles.env");
    await writeFile(
      envFile,
      [
        "DATABASE_URL=postgresql://file-user:file-pass@db.example:5432/castles",
        "ONLINE_STORE_BACKEND=postgres",
        "",
      ].join("\n")
    );

    try {
      const env = await loadBackupEnvironment({
        env: {
          DATABASE_URL: "postgresql://process-user:process-pass@db.example:5432/castles",
        },
        envFile,
      });

      expect(env.DATABASE_URL).toBe("postgresql://process-user:process-pass@db.example:5432/castles");
      expect(env.ONLINE_STORE_BACKEND).toBe("postgres");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("requires an output path and a PostgreSQL DATABASE_URL at the CLI boundary", () => {
    expect(() => parseBackupArgs(["--env-file"])).toThrow(/--env-file requires/);
    expect(() => parseBackupArgs(["--out"])).toThrow(/--out requires/);
    expect(() => parseBackupArgs(["--out", "backup.json"])).not.toThrow();
    expect(parseBackupArgs(["backup.json"]).outputPath).toBe("backup.json");
  });

  it("rejects unsafe table specs before interpolating SQL", async () => {
    const client = fakeClient({
      existingTables: new Set(["online_game_events"]),
      tableRows: {},
    });

    await expect(
      backupOnlinePostgresTables({
        createClient: () => client,
        outputPath: path.join(os.tmpdir(), `castles-unsafe-${Date.now()}.json`),
        tables: [{ name: "online_game_events; drop table online_accounts", orderBy: "id ASC" }],
      })
    ).rejects.toThrow(/Unsafe online backup table name/);
    expect(client.queries).toEqual([]);
  });

  it("does not log the connection string when the backup runs", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "castles-postgres-backup-log-"));
    const log = vi.fn();
    const client = fakeClient({
      existingTables: new Set(),
      tableRows: {},
    });

    try {
      await backupOnlinePostgresTables({
        createClient: () => client,
        databaseDescription: "postgresql://<user>@db.example/castles",
        log,
        outputPath: path.join(repoRoot, "empty.json"),
      });

      expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Backed up 0 rows from 0 online PostgreSQL tables to /));
      expect(log.mock.calls.flat().join("\n")).not.toContain("process-pass");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
