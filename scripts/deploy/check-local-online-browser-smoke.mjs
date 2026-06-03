#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { checkLocalPostgresPrereqs } from "./local-postgres-prereqs.mjs";
import { assert, createFetchWithTimeout, readJson } from "./online-smoke-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const serverEntry = path.join(repoRoot, "server-build", "server", "index.js");
const browserSmokeEntry = path.join(scriptDir, "check-online-browser-smoke.mjs");
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15_000);
const startupTimeoutMs = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS ?? 20_000);
const localShutdownToken = `local-browser-smoke-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;
const fetchWithTimeout = createFetchWithTimeout(requestTimeoutMs);
const CHILD_ENV_ALLOWLIST = new Set([
  "APPDATA",
  "CHROME_PATH",
  "CI",
  "COMSPEC",
  "FORCE_COLOR",
  "HOME",
  "LOCALAPPDATA",
  "NO_COLOR",
  "PATH",
  "PATHEXT",
  "Path",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PROGRAMFILES",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "WINDIR",
  "windir",
]);
const CHILD_ENV_ALLOWLIST_PREFIXES = ["SMOKE_"];

async function requireLocalInputs() {
  await checkLocalPostgresPrereqs({
    repoRoot,
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a local port."));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      ONLINE_STORE_BACKEND: "postgres",
      CASTLES_BIND_HOST: "127.0.0.1",
      CASTLES_STATIC_DIR: path.join(repoRoot, "build"),
      CASTLES_ENABLE_LOCAL_SHUTDOWN: "1",
      CASTLES_LOCAL_SHUTDOWN_TOKEN: localShutdownToken,
      BUILD_ID: "local-browser-smoke",
      GIT_COMMIT: "local-browser-smoke",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const appendLog = (data) => {
    logs = (logs + data.toString("utf8")).slice(-12_000);
  };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);
  const exitPromise = new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal }))
  );

  return { baseUrl, child, exitPromise, getLogs: () => logs };
}

async function waitForHealth(serverProcess) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (serverProcess.child.exitCode !== null) {
      throw new Error(
        `Server exited before becoming healthy with code ${serverProcess.child.exitCode}.\n${serverProcess.getLogs()}`
      );
    }

    try {
      const response = await fetchWithTimeout(`${serverProcess.baseUrl}/api/health`);
      const body = await readJson(response);
      if (response.ok && body.ok === true) {
        assert(body.online?.eventSchemaVersion === 2, "Health did not report event schema v2");
        assert(
          body.online?.store?.backend === "postgres",
          `Expected postgres health backend, got ${body.online?.store?.backend}`
        );
        return body;
      }
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Server did not become healthy after ${startupTimeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${serverProcess.getLogs()}`
  );
}

async function stopServer(serverProcess) {
  const { baseUrl, child, exitPromise, getLogs } = serverProcess;
  if (child.exitCode !== null || child.signalCode !== null) {
    const exit = await exitPromise;
    throw new Error(
      `Server exited before the local shutdown request completed (${formatExit(exit)}).\n${getLogs()}`
    );
  }

  try {
    const response = await fetchWithTimeout(`${baseUrl}/__local/shutdown`, {
      method: "POST",
      headers: {
        "x-castles-local-shutdown-token": localShutdownToken,
      },
    });
    assert(
      response.status === 202,
      `Local shutdown endpoint failed with ${response.status}: ${await response.text()}`
    );
  } catch (error) {
    child.kill("SIGKILL");
    const killed = await Promise.race([
      exitPromise,
      sleep(7_000).then(() => false),
    ]);
    if (killed === false) {
      throw new Error(`Server did not exit after failed shutdown request.\n${getLogs()}`);
    }
    throw error;
  }

  const exited = await Promise.race([
    exitPromise,
    sleep(7_000).then(() => false),
  ]);
  if (exited === false && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exitPromise;
    throw new Error(`Server did not exit after local shutdown request.\n${getLogs()}`);
  }

  if (child.exitCode !== 0) {
    throw new Error(
      `Server exited with code ${child.exitCode} during graceful shutdown.\n${getLogs()}`
    );
  }
  if (child.signalCode) {
    throw new Error(
      `Server exited from signal ${child.signalCode} during graceful shutdown.\n${getLogs()}`
    );
  }
}

function formatExit(exit) {
  if (!exit) return "unknown exit status";
  if (exit.signal) return `signal ${exit.signal}`;
  return `code ${exit.code}`;
}

function localBrowserSmokeEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      CHILD_ENV_ALLOWLIST.has(key) ||
      CHILD_ENV_ALLOWLIST_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      env[key] = value;
    }
  }
  env.NODE_ENV = "test";
  return env;
}

function runBrowserSmoke(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [browserSmokeEntry, baseUrl], {
      cwd: repoRoot,
      env: localBrowserSmokeEnv(),
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `Local browser smoke exited from signal ${signal}.`
            : `Local browser smoke exited with code ${code}.`
        )
      );
    });
  });
}

async function main() {
  await requireLocalInputs();
  const port = await findFreePort();
  const serverProcess = startServer(port);
  let operationError;
  let passedBaseUrl;
  try {
    await waitForHealth(serverProcess);
    await runBrowserSmoke(serverProcess.baseUrl);
    passedBaseUrl = serverProcess.baseUrl;
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await stopServer(serverProcess);
    } catch (shutdownError) {
      if (!operationError) {
        throw shutdownError;
      }
      console.error("Server shutdown also failed after browser smoke failure", shutdownError);
    }
  }
  if (passedBaseUrl) {
    console.log(`Local built-server browser smoke passed on ${passedBaseUrl}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
