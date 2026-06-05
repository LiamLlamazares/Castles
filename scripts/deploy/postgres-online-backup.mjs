import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

export const ONLINE_BACKUP_TABLES = [
  { name: "online_accounts", orderBy: "account_id ASC" },
  { name: "online_account_display_names", orderBy: "display_name_normalized ASC" },
  { name: "online_account_sessions", orderBy: "session_id ASC" },
  { name: "online_account_external_logins", orderBy: "provider ASC, provider_subject ASC" },
  { name: "online_account_privacy_settings", orderBy: "account_id ASC" },
  { name: "online_account_follows", orderBy: "follower_account_id ASC, followed_account_id ASC" },
  { name: "online_account_blocks", orderBy: "blocker_account_id ASC, blocked_account_id ASC" },
  { name: "online_account_ratings", orderBy: "account_id ASC" },
  { name: "online_account_reports", orderBy: "created_at ASC, report_id ASC" },
  { name: "online_account_report_audit", orderBy: "created_at ASC, audit_id ASC" },
  { name: "online_game_events", orderBy: "id ASC" },
  { name: "online_game_credentials", orderBy: "game_id ASC, seat ASC" },
  { name: "online_game_additional_credentials", orderBy: "id ASC" },
  { name: "online_game_summaries", orderBy: "updated_at ASC, game_id ASC" },
  { name: "online_challenge_events", orderBy: "id ASC" },
  { name: "online_challenge_credentials", orderBy: "challenge_id ASC, role ASC" },
  { name: "online_challenge_summaries", orderBy: "updated_at ASC, challenge_id ASC" },
  { name: "online_seek_events", orderBy: "id ASC" },
  { name: "online_seek_credentials", orderBy: "seek_id ASC" },
  { name: "online_seek_summaries", orderBy: "updated_at ASC, seek_id ASC" },
  { name: "online_rating_results", orderBy: "applied_at ASC, game_id ASC" },
  { name: "online_game_locks", orderBy: "game_id ASC" },
  { name: "online_challenge_locks", orderBy: "challenge_id ASC" },
  { name: "online_seek_locks", orderBy: "seek_id ASC" },
];

const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const ORDER_BY_COLUMNS = /^[a-z_][a-z0-9_]*\s+(?:ASC|DESC)(?:,\s*[a-z_][a-z0-9_]*\s+(?:ASC|DESC))*$/i;

function unquoteEnvValue(value) {
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(contents) {
  const env = {};
  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(ENV_LINE);
    if (!match) {
      throw new Error(`Invalid environment file line ${index + 1}. Expected KEY=value.`);
    }
    env[match[1]] = unquoteEnvValue(match[2]);
  }
  return env;
}

export async function loadBackupEnvironment({ env = process.env, envFile } = {}) {
  if (!envFile) return { ...env };
  const fileEnv = parseEnvFile(await readFile(envFile, "utf8"));
  return { ...fileEnv, ...env };
}

export function parseBackupArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      const envFile = argv[index + 1];
      if (!envFile) throw new Error("--env-file requires a file path.");
      args.envFile = envFile;
      index += 1;
    } else if (arg === "--out") {
      const outputPath = argv[index + 1];
      if (!outputPath) throw new Error("--out requires a file path.");
      args.outputPath = outputPath;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (!arg.startsWith("-") && !args.outputPath) {
      args.outputPath = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function describeDatabaseUrl(databaseUrlText) {
  const databaseUrl = new URL(databaseUrlText);
  const protocol = databaseUrl.protocol === "postgres:" ? "postgres" : "postgresql";
  const port = databaseUrl.port ? `:${databaseUrl.port}` : "";
  return `${protocol}://<user>@${databaseUrl.hostname}${port}${databaseUrl.pathname}`;
}

function validatePostgresUrl(databaseUrlText) {
  if (!databaseUrlText) {
    throw new Error("DATABASE_URL is required for PostgreSQL online backup.");
  }
  let databaseUrl;
  try {
    databaseUrl = new URL(databaseUrlText);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgresql:// or postgres:// protocol.");
  }
  return databaseUrlText;
}

async function writeJsonAtomic(outputPath, value) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, outputPath);
}

async function loadExistingOnlineTableNames(client, tableNames) {
  const result = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [tableNames]
  );
  return new Set(result.rows.map((row) => String(row.table_name)));
}

function validateTableSpec(table) {
  if (!SQL_IDENTIFIER.test(table.name)) {
    throw new Error(`Unsafe online backup table name: ${table.name}`);
  }
  if (!ORDER_BY_COLUMNS.test(table.orderBy)) {
    throw new Error(`Unsafe online backup order clause for ${table.name}.`);
  }
  return table;
}

export async function backupOnlinePostgresTables({
  connectionString,
  createClient,
  createdAt = new Date().toISOString(),
  databaseDescription,
  log = () => {},
  outputPath,
  tables = ONLINE_BACKUP_TABLES,
}) {
  if (!outputPath) {
    throw new Error("An output path is required for PostgreSQL online backup.");
  }
  const safeTables = tables.map(validateTableSpec);
  const client = createClient ? createClient() : new Client({ connectionString });
  const tableNames = safeTables.map((table) => table.name);
  const backupTables = [];
  let rowCount = 0;

  try {
    await client.connect();
    const existingTables = await loadExistingOnlineTableNames(client, tableNames);
    for (const table of safeTables) {
      if (!existingTables.has(table.name)) continue;
      const result = await client.query(`SELECT * FROM ${table.name} ORDER BY ${table.orderBy}`);
      const rows = result.rows;
      rowCount += rows.length;
      backupTables.push({
        name: table.name,
        columns: result.fields.map((field) => field.name),
        rowCount: rows.length,
        rows,
      });
    }
  } finally {
    await client.end();
  }

  const backup = {
    format: "castles-postgres-online-backup-v1",
    createdAt,
    database: databaseDescription ?? (connectionString ? describeDatabaseUrl(connectionString) : "unknown"),
    tableCount: backupTables.length,
    rowCount,
    tables: backupTables,
  };
  await writeJsonAtomic(outputPath, backup);
  log(`Backed up ${rowCount} rows from ${backupTables.length} online PostgreSQL tables to ${outputPath}`);
  return {
    existingTableCount: backupTables.length,
    outputPath,
    rowCount,
    tableCount: backupTables.length,
  };
}

async function main() {
  const args = parseBackupArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/deploy/postgres-online-backup.mjs --out <backup.json> [--env-file <file>]");
    return;
  }
  const env = await loadBackupEnvironment({ env: process.env, envFile: args.envFile });
  const connectionString = validatePostgresUrl(env.DATABASE_URL);
  const outputPath = args.outputPath ?? env.POSTGRES_ONLINE_BACKUP_PATH;
  if (!outputPath) {
    throw new Error("--out is required unless POSTGRES_ONLINE_BACKUP_PATH is set.");
  }
  await backupOnlinePostgresTables({
    connectionString,
    outputPath,
    log: console.log,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("PostgreSQL online backup failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
