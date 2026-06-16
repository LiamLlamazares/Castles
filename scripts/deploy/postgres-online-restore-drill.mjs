import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  ONLINE_BACKUP_TABLES,
  loadBackupEnvironment,
  validateOnlinePostgresBackupFile,
} from "./postgres-online-backup.mjs";
import {
  describeDatabaseUrl,
  isLocalDatabaseHost,
  parsePostgresDatabaseUrl,
  requireBuiltArtifacts,
} from "./local-postgres-prereqs.mjs";

const { Client } = pg;

export const RESTORE_DRILL_ARTIFACTS = [
  "server-build/src/online/server/PostgresOnlineGameStore.js",
  "server-build/src/online/server/PostgresOnlineAccountStore.js",
];

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const DISPOSABLE_DATABASE_NAME = /(?:restore|drill|smoke|test|tmp|disposable)/i;

function assertSafeIdentifier(identifier, label) {
  if (!SQL_IDENTIFIER.test(identifier)) {
    throw new Error(`Unsafe ${label}: ${identifier}`);
  }
  return identifier;
}

function tableNamesSql(tables) {
  return tables.map((table) => assertSafeIdentifier(table.name, "restore table name")).join(", ");
}

function insertSql(table) {
  const tableName = assertSafeIdentifier(table.name, "restore table name");
  const columns = table.columns.map((column) => assertSafeIdentifier(column, `restore column for ${tableName}`));
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;
}

function requireRowColumns(table) {
  for (const [index, row] of table.rows.entries()) {
    for (const column of table.columns) {
      if (!Object.prototype.hasOwnProperty.call(row, column)) {
        throw new Error(`Invalid PostgreSQL online backup: row ${index + 1} for ${table.name} is missing ${column}`);
      }
    }
  }
}

function backupTablesByName(backup) {
  return new Map(backup.tables.map((table) => [table.name, table]));
}

async function loadValidatedBackup(backupPath, { requireAllTables = true, tables = ONLINE_BACKUP_TABLES } = {}) {
  await validateOnlinePostgresBackupFile(backupPath, { requireAllTables, tables });
  return JSON.parse(await readFile(backupPath, "utf8"));
}

export function parseRestoreDrillArgs(argv) {
  const args = { requireAllTables: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--backup") {
      const backupPath = argv[index + 1];
      if (!backupPath) throw new Error("--backup requires a backup file path.");
      args.backupPath = backupPath;
      index += 1;
    } else if (arg === "--target-database-url") {
      const targetDatabaseUrl = argv[index + 1];
      if (!targetDatabaseUrl) throw new Error("--target-database-url requires a PostgreSQL URL.");
      args.targetDatabaseUrl = targetDatabaseUrl;
      index += 1;
    } else if (arg === "--castles-env-file" || arg === "--env-file") {
      const envFile = argv[index + 1];
      if (!envFile) throw new Error(`${arg} requires a file path.`);
      args.envFile = envFile;
      index += 1;
    } else if (arg === "--skip-require-all-tables") {
      args.requireAllTables = false;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (!arg.startsWith("-") && !args.backupPath) {
      args.backupPath = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function requireRestoreDrillTarget(databaseUrlText, { env = process.env } = {}) {
  if (!databaseUrlText) {
    throw new Error(
      "RESTORE_DATABASE_URL or --target-database-url is required for the PostgreSQL restore drill."
    );
  }

  const databaseUrl = parsePostgresDatabaseUrl(databaseUrlText);
  const isLocal = isLocalDatabaseHost(databaseUrl);
  const allowDisposable = env.CASTLES_ALLOW_DISPOSABLE_RESTORE_DB === "1";
  if (!isLocal && !allowDisposable) {
    throw new Error(
      "Refusing to run PostgreSQL restore drill against a non-local target. Use a local disposable restore database, or set CASTLES_ALLOW_DISPOSABLE_RESTORE_DB=1 only for a disposable non-production database."
    );
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!databaseName || !DISPOSABLE_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `PostgreSQL restore drill target database ${databaseName || "<unknown>"} is not a disposable restore target. Use a database name containing restore, drill, smoke, test, tmp, or disposable. CASTLES_ALLOW_DISPOSABLE_RESTORE_DB=1 only permits non-local disposable hosts; it does not waive this database-name guard.`
    );
  }

  return {
    databaseName,
    description: describeDatabaseUrl(databaseUrl),
    isLocal,
  };
}

export async function initializeOnlinePostgresRestoreSchema({
  connectionString,
  repoRoot = process.cwd(),
  requireFn,
} = {}) {
  requireBuiltArtifacts(RESTORE_DRILL_ARTIFACTS, repoRoot);
  const requireFromScript = requireFn ?? createRequire(import.meta.url);
  const gameModulePath = path.resolve(repoRoot, "server-build/src/online/server/PostgresOnlineGameStore.js");
  const accountModulePath = path.resolve(repoRoot, "server-build/src/online/server/PostgresOnlineAccountStore.js");
  const { PostgresOnlineGameStore } = requireFromScript(gameModulePath);
  const { PostgresOnlineAccountStore } = requireFromScript(accountModulePath);
  const gameStore = new PostgresOnlineGameStore({ connectionString });
  const accountStore = new PostgresOnlineAccountStore({ connectionString });
  try {
    await accountStore.checkReady();
    await gameStore.checkReady();
  } finally {
    await accountStore.close();
    await gameStore.close();
  }
}

async function resetSerialSequences(client, table) {
  const tableName = assertSafeIdentifier(table.name, "restore table name");
  for (const column of table.columns) {
    const columnName = assertSafeIdentifier(column, `restore column for ${tableName}`);
    const sequenceResult = await client.query(
      "SELECT pg_get_serial_sequence($1, $2) AS sequence_name",
      [tableName, columnName]
    );
    const sequenceName = sequenceResult.rows[0]?.sequence_name;
    if (!sequenceName) continue;

    const maxResult = await client.query(
      `SELECT COALESCE(MAX(${columnName})::bigint, 0) AS max_id FROM ${tableName}`
    );
    const maxId = BigInt(maxResult.rows[0]?.max_id ?? 0);
    if (maxId > 0n) {
      await client.query("SELECT setval($1::regclass, $2::bigint, true)", [
        sequenceName,
        maxId.toString(),
      ]);
    } else {
      await client.query("SELECT setval($1::regclass, 1, false)", [sequenceName]);
    }
  }
}

async function verifyTableCounts(client, backupTables) {
  for (const table of backupTables) {
    const tableName = assertSafeIdentifier(table.name, "restore table name");
    const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
    const count = Number(countResult.rows[0]?.count);
    if (count !== table.rowCount) {
      throw new Error(
        `Restore count mismatch for ${tableName}: expected ${table.rowCount}, restored ${count}`
      );
    }
  }
}

export async function restoreOnlinePostgresBackupTables({
  backupPath,
  connectionString,
  createClient,
  initializeSchema = initializeOnlinePostgresRestoreSchema,
  log = () => {},
  requireAllTables = true,
  tables = ONLINE_BACKUP_TABLES,
}) {
  if (!backupPath) {
    throw new Error("A PostgreSQL online backup path is required for the restore drill.");
  }
  if (!connectionString) {
    throw new Error("A target PostgreSQL connection string is required for the restore drill.");
  }

  const backup = await loadValidatedBackup(backupPath, { requireAllTables, tables });
  const allowedTableNames = new Set(tables.map((table) => table.name));
  const backedUpTables = backup.tables.filter((table) => allowedTableNames.has(table.name));
  for (const table of backedUpTables) {
    requireRowColumns(table);
  }

  await initializeSchema({ connectionString });

  const client = createClient ? createClient() : new Client({ connectionString });
  const backupByName = backupTablesByName(backup);
  const restoreTables = tables
    .filter((table) => backupByName.has(table.name))
    .map((table) => backupByName.get(table.name));

  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(`TRUNCATE TABLE ${tableNamesSql(tables)} RESTART IDENTITY CASCADE`);

    for (const table of restoreTables) {
      if (table.rows.length === 0) continue;
      const sql = insertSql(table);
      for (const row of table.rows) {
        await client.query(
          sql,
          table.columns.map((column) => row[column])
        );
      }
    }

    for (const table of restoreTables) {
      await resetSerialSequences(client, table);
    }
    await verifyTableCounts(client, restoreTables);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original restore failure.
    }
    throw error;
  } finally {
    await client.end();
  }

  log(`PostgreSQL restore drill restored ${backup.rowCount} rows from ${backup.tableCount} tables.`);
  return {
    backupPath,
    rowCount: backup.rowCount,
    tableCount: backup.tableCount,
  };
}

async function main() {
  const args = parseRestoreDrillArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node scripts/deploy/postgres-online-restore-drill.mjs --backup <backup.json> --target-database-url <postgresql://...>\n" +
        "       RESTORE_DATABASE_URL=<postgresql://...> POSTGRES_ONLINE_BACKUP_PATH=<backup.json> node scripts/deploy/postgres-online-restore-drill.mjs"
    );
    return;
  }

  const env = await loadBackupEnvironment({ env: process.env, envFile: args.envFile });
  const backupPath = args.backupPath ?? env.POSTGRES_ONLINE_BACKUP_PATH;
  const connectionString = args.targetDatabaseUrl ?? env.RESTORE_DATABASE_URL;
  const target = requireRestoreDrillTarget(connectionString, { env });
  await restoreOnlinePostgresBackupTables({
    backupPath,
    connectionString,
    requireAllTables: args.requireAllTables,
    log: console.log,
  });
  console.log(`Restore drill target: ${target.description}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("PostgreSQL restore drill failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
