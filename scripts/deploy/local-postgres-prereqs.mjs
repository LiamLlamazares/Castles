import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const LOCAL_DATABASE_EXAMPLE =
  "postgresql://castles_local:castles_local_dev@localhost:5432/castles_local";
export const EXPECTED_LOCAL_SMOKE_DATABASE = "castles_local";
export const EXPECTED_LOCAL_SMOKE_USER = "castles_local";

export const LOCAL_SMOKE_ARTIFACTS = [
  "build/index.html",
  "server-build/server/index.js",
  "server-build/src/online/OnlineGameService.js",
  "server-build/src/online/events.js",
  "server-build/src/online/server/PostgresOnlineGameStore.js",
  "server-build/src/online/server/createOnlineHttpServer.js",
  "server-build/src/online/server/onlineTokenCredentials.js",
];

const DEFAULT_PSQL_CANDIDATES = [
  "psql",
  "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe",
  "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
  "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
];

export function parsePostgresDatabaseUrl(databaseUrlText) {
  let databaseUrl;
  try {
    databaseUrl = new URL(databaseUrlText);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgresql:// or postgres:// protocol.");
  }

  return databaseUrl;
}

export function isLocalDatabaseHost(databaseUrlText) {
  const databaseUrl =
    databaseUrlText instanceof URL ? databaseUrlText : parsePostgresDatabaseUrl(databaseUrlText);
  const hostname = databaseUrl.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function describeDatabaseUrl(databaseUrlText) {
  const databaseUrl =
    databaseUrlText instanceof URL ? databaseUrlText : parsePostgresDatabaseUrl(databaseUrlText);
  const protocol = databaseUrl.protocol === "postgres:" ? "postgres" : "postgresql";
  const user = databaseUrl.username ? "<user>@" : "";
  const port = databaseUrl.port ? `:${databaseUrl.port}` : "";
  const database = databaseUrl.pathname && databaseUrl.pathname !== "/" ? databaseUrl.pathname : "/<database>";
  return `${protocol}://${user}${databaseUrl.hostname}${port}${database}`;
}

export function allowsDisposableSmokeDatabase(env = process.env) {
  return env.CASTLES_ALLOW_DISPOSABLE_SMOKE_DB === "1" || env.CASTLES_ALLOW_NONLOCAL_SMOKE_DB === "1";
}

export function requireLocalDatabaseUrl(
  databaseUrlText,
  {
    allowNonLocal = false,
    context = "local PostgreSQL smoke",
  } = {}
) {
  if (!databaseUrlText) {
    throw new Error(`DATABASE_URL is required. Example: ${LOCAL_DATABASE_EXAMPLE}`);
  }

  const databaseUrl = parsePostgresDatabaseUrl(databaseUrlText);
  const isLocal = isLocalDatabaseHost(databaseUrl);
  if (!allowNonLocal && !isLocal) {
    throw new Error(
      `Refusing to run ${context} against a non-local DATABASE_URL host. Use a localhost database, or set CASTLES_ALLOW_NONLOCAL_SMOKE_DB=1 only for a disposable non-production database.`
    );
  }

  return {
    databaseUrl,
    description: describeDatabaseUrl(databaseUrl),
    isLocal,
  };
}

export function missingArtifacts(artifacts, repoRoot) {
  return artifacts
    .map((artifact) => path.resolve(repoRoot, artifact))
    .filter((artifactPath) => !existsSync(artifactPath));
}

export function requireBuiltArtifacts(artifacts, repoRoot) {
  const missing = missingArtifacts(artifacts, repoRoot);
  if (missing.length > 0) {
    throw new Error(
      `Built artifacts were not found:\n${missing
        .map((artifactPath) => `- ${path.relative(repoRoot, artifactPath)}`)
        .join("\n")}\nRun npm run build and npm run server:build first.`
    );
  }
}

function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function postgresUrlToPsqlEnv(databaseUrlText) {
  const databaseUrl =
    databaseUrlText instanceof URL ? databaseUrlText : parsePostgresDatabaseUrl(databaseUrlText);
  const env = {};
  if (databaseUrl.hostname) {
    env.PGHOST = databaseUrl.hostname.replace(/^\[(.*)\]$/, "$1");
  }
  if (databaseUrl.port) {
    env.PGPORT = databaseUrl.port;
  }
  if (databaseUrl.username) {
    env.PGUSER = decodeUrlPart(databaseUrl.username);
  }
  if (databaseUrl.password) {
    env.PGPASSWORD = decodeUrlPart(databaseUrl.password);
  }
  if (databaseUrl.pathname && databaseUrl.pathname !== "/") {
    env.PGDATABASE = decodeUrlPart(databaseUrl.pathname.slice(1));
  }
  const sslMode = databaseUrl.searchParams.get("sslmode");
  if (sslMode) {
    env.PGSSLMODE = sslMode;
  }
  return env;
}

function runCommand(command, args, { env = process.env, timeoutMs = 5_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString("utf8");
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, code: null, stdout, stderr: error.message });
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, code, signal, stdout, stderr });
    });
  });
}

export function psqlCandidates(env = process.env) {
  const candidates = [
    env.PSQL_PATH,
    env.PGCLIENT_BIN,
    ...DEFAULT_PSQL_CANDIDATES,
  ]
    .filter(Boolean)
    .flatMap((candidate) => {
      const basename = path.basename(candidate).toLowerCase();
      if (basename === "psql" || basename === "psql.exe") {
        return [candidate];
      }
      return [
        candidate,
        path.join(candidate, process.platform === "win32" ? "psql.exe" : "psql"),
        path.join(candidate, "psql.exe"),
        path.join(candidate, "psql"),
      ];
    });
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

export async function resolvePsqlCommand({
  env = process.env,
  candidates = psqlCandidates(env),
  timeoutMs = 3_000,
} = {}) {
  for (const candidate of candidates) {
    const result = await runCommand(candidate, ["--version"], { timeoutMs });
    if (result.ok) {
      return candidate;
    }
  }
  return null;
}

export async function runPsqlReadyCheck(psqlCommand, databaseUrlText, { timeoutMs = 8_000 } = {}) {
  const result = await runCommand(
    psqlCommand,
    [
      "-v",
      "ON_ERROR_STOP=1",
      "-A",
      "-t",
      "-F",
      "\t",
      "-c",
      "select current_database(), current_user, coalesce(inet_server_addr()::text, ''), coalesce(inet_server_port()::text, ''), 1;",
    ],
    { env: { ...process.env, ...postgresUrlToPsqlEnv(databaseUrlText) }, timeoutMs }
  );
  const identity = parsePsqlReadyOutput(result.stdout);
  return {
    ...result,
    identity,
    ready: result.ok && identity?.ready === true,
  };
}

export function parsePsqlReadyOutput(output) {
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) return null;
  const [database, user, serverAddress, serverPort, ready] = line.split("\t");
  return {
    database,
    user,
    serverAddress,
    serverPort,
    ready: ready === "1",
  };
}

export function requireExpectedSmokeDatabaseIdentity(identity, { allowDisposable = false } = {}) {
  if (!identity?.ready) {
    throw new Error("psql connected but did not return the expected readiness row.");
  }
  if (allowDisposable) {
    return;
  }
  if (
    identity.database !== EXPECTED_LOCAL_SMOKE_DATABASE ||
    identity.user !== EXPECTED_LOCAL_SMOKE_USER
  ) {
    throw new Error(
      `DATABASE_URL connected to database ${identity.database || "<unknown>"} as user ${
        identity.user || "<unknown>"
      }. Local smoke checks require ${EXPECTED_LOCAL_SMOKE_DATABASE}/${EXPECTED_LOCAL_SMOKE_USER}; set CASTLES_ALLOW_DISPOSABLE_SMOKE_DB=1 only for a disposable non-production database.`
    );
  }
}

export async function checkLocalPostgresPrereqs({
  env = process.env,
  repoRoot = process.cwd(),
  requiredArtifacts = LOCAL_SMOKE_ARTIFACTS,
  resolvePsql = () => resolvePsqlCommand({ env }),
  runReadinessCheck = runPsqlReadyCheck,
} = {}) {
  const database = requireLocalDatabaseUrl(env.DATABASE_URL, {
    allowNonLocal: allowsDisposableSmokeDatabase(env),
    context: "local PostgreSQL smoke",
  });
  requireBuiltArtifacts(requiredArtifacts, repoRoot);

  const psqlCommand = await resolvePsql();
  if (!psqlCommand) {
    throw new Error(
      "psql was not found. Install the PostgreSQL client, add it to PATH, or set PSQL_PATH to psql.exe before running local smoke checks."
    );
  }

  const readiness = await runReadinessCheck(psqlCommand, env.DATABASE_URL);
  if (!readiness.ready) {
    throw new Error(
      `psql could not connect to ${database.description} with DATABASE_URL. Check the local PostgreSQL service, database/user creation, and password.\n${readiness.stderr || readiness.stdout}`.trim()
    );
  }
  requireExpectedSmokeDatabaseIdentity(readiness.identity, {
    allowDisposable: allowsDisposableSmokeDatabase(env),
  });

  return {
    database,
    identity: readiness.identity,
    psqlCommand,
    artifacts: requiredArtifacts,
  };
}
