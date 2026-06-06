#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { checkLocalPostgresPrereqs } from "./local-postgres-prereqs.mjs";
import {
  assert,
  buildWebSocketUrl,
  createFetchWithTimeout,
  createWebSocketWaiters,
  makeSmokeSetup,
  readJson,
  versionedSocketMessage,
} from "./online-smoke-lib.mjs";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const serverEntry = path.join(repoRoot, "server-build", "server", "index.js");
const outputDir = path.join(repoRoot, "artifacts", "ui-audit", "phase6ai-local-layout");
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15_000);
const startupTimeoutMs = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS ?? 20_000);
const browserTimeoutMs = Number(process.env.SMOKE_BROWSER_TIMEOUT_MS ?? 20_000);
const socketTimeoutMs = Number(process.env.SMOKE_SOCKET_TIMEOUT_MS ?? 10_000);
const localShutdownToken = `local-ui-audit-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;
const fetchWithTimeout = createFetchWithTimeout(requestTimeoutMs);
const { waitForSocketOpen, nextSocketMessage } = createWebSocketWaiters(socketTimeoutMs);

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

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "short-mobile", width: 360, height: 640 },
];

const AUDITED_SCROLL_SELECTORS = [
  ".online-browser-page",
  ".game-library-page",
  ".setup-sidebar",
  ".tutorial-sidebar",
  ".tutorial-course-sidebar",
  ".tutorial-course-main",
  ".tutorial-container-course",
  ".tutorial-course-section-map",
  ".tutorial-course-modules",
  ".game-panel",
  ".control-panel",
  ".game-sidebar",
  ".game-side-panel",
  ".hamburger-menu.open",
];

const SCENARIOS = [
  {
    name: "first-run-intro",
    useFirstRunState: true,
    waitText: "Welcome to Castles",
    requiredTexts: () => ["Welcome to Castles", "Start Tutorial", "Set Up Game"],
  },
  {
    name: "play-setup",
    prepare: async (page) => {
      await ensureSetupPage(page);
    },
    requiredTexts: () => ["Play Local", "Invite Friend", "List in Lobby"],
  },
  {
    name: "online-lobby",
    prepare: async (page, fixtures) => {
      await openOnlineFromSetup(page);
      await waitForText(page, "Open listings");
      await waitForText(page, fixtures.openSeekId);
      await waitForText(page, fixtures.liveGameId);
    },
    requiredTexts: (fixtures) => [
      "Quick Match",
      fixtures.openSeekId,
      "Current games",
      fixtures.liveGameId,
    ],
  },
  {
    name: "online-watch",
    prepare: async (page, fixtures) => {
      await openOnlineFromSetup(page);
      await clickButton(page, "Live public games");
      await waitForText(page, "Live public games");
      await waitForText(page, fixtures.liveGameId);
    },
    requiredTexts: (fixtures) => [fixtures.liveGameId, "Spectate"],
  },
  {
    name: "online-archive",
    prepare: async (page, fixtures) => {
      await openOnlineFromSetup(page);
      await clickButton(page, "Online Archive");
      await waitForText(page, "Browse archive");
      await waitForText(page, fixtures.archivedGameId);
    },
    requiredTexts: (fixtures) => [fixtures.archivedGameId, "Analyze Replay", "White wins by resignation"],
  },
  {
    name: "online-account-archive-history",
    accountSession: "liam",
    prepare: async (page, fixtures) => {
      await openOnlineFromSetup(page);
      await clickButton(page, "Online Archive");
      await waitForText(page, "Account archive");
      await waitForText(page, fixtures.accountGameId);
      await waitForText(page, "Followed opponents in your games");
      await clickButton(page, `Show ${fixtures.samirDisplayName} game history from followed account archive`);
      await waitForText(page, `Showing games with ${fixtures.samirDisplayName}`);
      await waitForRegion(page, `Head-to-head with ${fixtures.samirDisplayName}`);
      await waitForRegion(page, `Head-to-head games with ${fixtures.samirDisplayName}`);
      await waitForButton(page, `Show archive details for latest head-to-head game ${fixtures.accountGameId}`);
      await waitForButton(page, `Analyze latest head-to-head replay ${fixtures.accountGameId}`);
      await waitForText(page, "Challenge pending");
      await waitForText(page, fixtures.accountGameId);
    },
    requiredTexts: (fixtures) => [
      "Account archive",
      "Followed opponents in your games",
      "Head-to-head",
      "Head-to-head games",
      fixtures.accountGameId,
      "Details",
      "Analyze",
      "Challenge pending",
      "Clear History Filter",
    ],
  },
  {
    name: "tutorial-overview",
    prepare: async (page) => {
      await ensureSetupPage(page);
      await clickButton(page, "Tutorial");
      await waitForText(page, "Castles tutorial");
    },
    requiredTexts: () => ["Tutorial progress", "Advanced units", "Start Tutorial"],
  },
  {
    name: "tutorial-lesson",
    prepare: async (page) => {
      await ensureSetupPage(page);
      await clickButton(page, "Tutorial");
      await clickButton(page, "Start Tutorial");
      await waitForText(page, "Lesson 1 of");
    },
    requiredTexts: () => ["Lesson 1 of", "Movement", "Tutorial overview", "Next lesson"],
  },
  {
    name: "library-empty",
    prepare: async (page) => {
      await ensureSetupPage(page);
      await clickButton(page, "Library");
      await waitForText(page, "Library");
    },
    requiredTexts: () => ["Import PGN", "No named saves yet"],
  },
  {
    name: "game-board",
    prepare: async (page) => {
      await ensureGameBoard(page);
    },
    requiredTexts: (_fixtures, viewport) =>
      viewport.name === "desktop" ? ["NEW GAME", "PASS", "RESIGN"] : ["PASS", "RESIGN", "SHARE"],
  },
  {
    name: "game-drawer",
    prepare: async (page) => {
      await ensureGameBoard(page);
      await clickButton(page, "Menu");
      await page.getByRole("dialog", { name: "Castles menu" }).waitFor({
        state: "visible",
        timeout: browserTimeoutMs,
      });
    },
    requiredTexts: () => ["Configure New Game", "Online Lobby", "Open Library", "Board Display"],
  },
  {
    name: "save-dialog-overlay",
    prepare: async (page) => {
      await ensureGameBoard(page);
      await clickButton(page, "Save Game");
      await waitForDialog(page, "Save game");
      await waitForText(page, "Name this game so you can find it later in Library.");
      await waitForText(page, "Save name");
      await waitForButton(page, "Cancel");
      await waitForButton(page, "Save to Library");
      await page.getByLabel("Save name", { exact: true }).fill("");
      await clickButton(page, "Save to Library");
      await waitForAlert(page, "Enter a name for this save.");
    },
    requiredTexts: () => [
      "Save game",
      "Name this game so you can find it later in Library.",
      "Save name",
      "Enter a name for this save.",
      "Cancel",
      "Save to Library",
    ],
  },
  {
    name: "online-connection-access-denied",
    prepare: async (page) => {
      const missingInviteUrl = new URL("/", page.url());
      missingInviteUrl.searchParams.set(
        "onlineGame",
        "game_ui_audit_missing_connection_recovery_0123456789abcdefghijklmnopqrstuvwxyz"
      );
      missingInviteUrl.searchParams.set("seat", "w");
      missingInviteUrl.searchParams.set(
        "token",
        "ui_audit_missing_player_token_0123456789abcdefghijklmnopqrstuvwxyz"
      );
      await page.goto(missingInviteUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout: browserTimeoutMs,
      });
      await waitForRegion(page, "Online game connection");
      await waitForText(page, "Access denied: No online game was found for that id and token.");
      await waitForButton(page, "Configure New Game");
    },
    requiredTexts: () => [
      "Online Game",
      "Reconnect, recover, or move to another Castles area.",
      "Access denied: No online game was found for that id and token.",
      "Configure New Game",
    ],
  },
  {
    name: "online-player-board",
    prepare: async (page, fixtures) => {
      await seedOnlineJoinSession(page, fixtures.liveGameId, "w", fixtures.playerToken);
      await page.goto(fixtures.playerUrl, { waitUntil: "domcontentloaded", timeout: browserTimeoutMs });
      await waitForText(page, "Online White");
      await page.locator(".hamburger-button").waitFor({ state: "visible", timeout: browserTimeoutMs });
    },
    requiredTexts: () => ["Online White", "Copy Spectator Link", "PASS", "RESIGN"],
  },
  {
    name: "online-spectator-board",
    prepare: async (page, fixtures) => {
      await page.goto(fixtures.spectatorUrl, { waitUntil: "domcontentloaded", timeout: browserTimeoutMs });
      await waitForText(page, "Spectating");
      await page.locator(".hamburger-button").waitFor({ state: "visible", timeout: browserTimeoutMs });
    },
    requiredTexts: () => ["Spectating", "Copy Spectator Link"],
  },
];

async function seedOnlineJoinSession(page, gameId, seat, token) {
  await page.evaluate(
    ({ gameId, seat, token }) => {
      window.sessionStorage.setItem(`castles_online_join:${gameId}:${seat}`, token);
    },
    { gameId, seat, token }
  );
}

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
      BUILD_ID: "local-ui-layout-audit",
      GIT_COMMIT: "local-ui-layout-audit",
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
    const killed = await Promise.race([exitPromise, sleep(7_000).then(() => false)]);
    if (killed === false) {
      throw new Error(`Server did not exit after failed shutdown request.\n${getLogs()}`);
    }
    throw error;
  }

  const exited = await Promise.race([exitPromise, sleep(7_000).then(() => false)]);
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

function redactSecretText(text) {
  return String(text)
    .replace(/([?&]token=)[^&#\s)]+/gi, "$1<redacted>")
    .replace(/([?&]challengeToken=)[^&#\s)]+/gi, "$1<redacted>")
    .replace(/(#challengeToken=)[^&#\s)]+/gi, "$1<redacted>")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1<redacted>");
}

function formatErrorForLog(error) {
  return redactSecretText(error instanceof Error ? error.stack || error.message : String(error));
}

function browserEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (CHILD_ENV_ALLOWLIST.has(key)) {
      env[key] = value;
    }
  }
  env.NODE_ENV = "test";
  return env;
}

async function createUiAuditFixtures(baseUrl) {
  const setup = makeSmokeSetup();
  const openSeek = await createOpenSeekFixture(baseUrl, setup);
  const liveGame = await createOnlineGameFixture(baseUrl, setup);
  await publishOnlineGame(baseUrl, liveGame.gameId, liveGame.white.token);

  const archivedGame = await createOnlineGameFixture(baseUrl, setup);
  await publishOnlineGame(baseUrl, archivedGame.gameId, archivedGame.white.token);
  await submitOnlineAction(
    baseUrl,
    archivedGame.gameId,
    archivedGame.black.token,
    "ui-audit-black-resign",
    { type: "RESIGN", baseVersion: 0 }
  );

  const accountFixture = await createAccountArchiveFixture(baseUrl, setup);

  return {
    openSeekId: openSeek.seekId,
    openSeekToken: openSeek.creator.token,
    liveGameId: liveGame.gameId,
    liveWhiteToken: liveGame.white.token,
    liveBlackToken: liveGame.black.token,
    archivedGameId: archivedGame.gameId,
    archivedWhiteToken: archivedGame.white.token,
    playerUrl: buildPlayerUrl(baseUrl, liveGame.gameId, "w"),
    playerToken: liveGame.white.token,
    spectatorUrl: buildSpectatorUrl(baseUrl, liveGame.gameId),
    accountGameId: accountFixture.gameId,
    liamDisplayName: accountFixture.liam.account.displayName,
    samirDisplayName: accountFixture.samir.account.displayName,
    liamAccountSession: {
      sessionId: accountFixture.liam.session.sessionId,
      token: accountFixture.liam.session.token,
      account: accountFixture.liam.account,
    },
    samirAccountToken: accountFixture.samir.session.token,
  };
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token) {
  return {
    "content-type": "application/json",
    ...(token ? bearer(token) : {}),
  };
}

function uniqueAuditDisplayName(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function createAccountFixture(baseUrl, displayName) {
  const password = "correct-horse-battery-staple";
  const response = await fetchWithTimeout(`${baseUrl}/api/online/accounts`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ displayName, password }),
  });
  const body = await readJson(response);
  assert(response.status === 201, `UI audit account ${displayName} creation failed with ${response.status}`);
  assert(body.account?.displayName === displayName, `UI audit account ${displayName} returned the wrong display name`);
  assert(typeof body.session?.token === "string", `UI audit account ${displayName} did not return a session token`);
  assert(typeof body.session?.sessionId === "string", `UI audit account ${displayName} did not return a session id`);
  return body;
}

async function followAccountFixture(baseUrl, followerToken, targetDisplayName, label) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/account/follows/${encodeURIComponent(targetDisplayName)}`,
    { method: "PUT", headers: bearer(followerToken) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `${label} follow failed with ${response.status}`);
  assert(body.profile?.displayName === targetDisplayName, `${label} follow returned the wrong profile`);
  return body;
}

async function createAccountChallengeFixture(baseUrl, setup, challenger, challenged) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/challenges`, {
    method: "POST",
    headers: jsonHeaders(challenger.session.token),
    body: JSON.stringify({
      setup,
      challengerSeat: "w",
      visibility: "unlisted",
      challengedDisplayName: challenged.account.displayName,
    }),
  });
  const body = await readJson(response);
  assert(response.status === 201, `UI audit account challenge creation failed with ${response.status}`);
  assert(body.summary?.status === "pending", "UI audit account challenge was not pending");
  assert(
    body.summary?.challengerIdentity?.displayName === challenger.account.displayName,
    "UI audit account challenge returned the wrong challenger"
  );
  assert(
    body.summary?.challengedIdentity?.displayName === challenged.account.displayName,
    "UI audit account challenge returned the wrong challenged account"
  );
  return body;
}

async function acceptAccountChallengeFixture(baseUrl, challengedToken, challengeId) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/account/challenges/${encodeURIComponent(challengeId)}/accept`,
    { method: "POST", headers: bearer(challengedToken) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `UI audit account challenge accept failed with ${response.status}`);
  assert(body.summary?.status === "accepted", "UI audit account challenge accept did not return accepted status");
  assert(typeof body.gameInvite?.gameId === "string", "UI audit account challenge accept did not return a game id");
  assert(typeof body.gameInvite?.token === "string", "UI audit account challenge accept did not return a game token");
  return body;
}

async function createAccountArchiveFixture(baseUrl, setup) {
  let liam;
  let samir;
  try {
    liam = await createAccountFixture(baseUrl, uniqueAuditDisplayName("UiLiam"));
    samir = await createAccountFixture(baseUrl, uniqueAuditDisplayName("UiSamir"));
    await followAccountFixture(baseUrl, liam.session.token, samir.account.displayName, "UI audit Liam");
    await followAccountFixture(baseUrl, samir.session.token, liam.account.displayName, "UI audit Samir");
    const challenge = await createAccountChallengeFixture(baseUrl, setup, liam, samir);
    const accepted = await acceptAccountChallengeFixture(baseUrl, samir.session.token, challenge.challengeId);
    await submitOnlineAction(
      baseUrl,
      accepted.gameInvite.gameId,
      accepted.gameInvite.token,
      `ui-audit-account-black-resign-${Date.now().toString(36)}`,
      { type: "RESIGN", baseVersion: 0 }
    );
    await waitForAccountHeadToHeadFixture(
      baseUrl,
      liam.session.token,
      samir.account.displayName,
      accepted.gameInvite.gameId
    );
    return {
      liam,
      samir,
      gameId: accepted.gameInvite.gameId,
    };
  } catch (error) {
    try {
      await cleanupPartialAccountArchiveFixture(baseUrl, liam, samir);
    } catch (cleanupError) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      throw new Error(`${originalMessage}\nPartial account fixture cleanup failed: ${cleanupMessage}`);
    }
    throw error;
  }
}

async function waitForAccountHeadToHeadFixture(baseUrl, token, opponentDisplayName, gameId) {
  const deadline = Date.now() + browserTimeoutMs;
  let lastStatus = 0;
  let lastBody = null;
  while (Date.now() < deadline) {
    const url = new URL(
      `${baseUrl}/api/online/account/games/head-to-head/${encodeURIComponent(opponentDisplayName)}`
    );
    url.searchParams.set("limit", "5");
    const response = await fetchWithTimeout(url.toString(), { headers: bearer(token) });
    const body = await readJson(response);
    lastStatus = response.status;
    lastBody = body;
    if (
      response.status === 200 &&
      Array.isArray(body.games) &&
      body.games.some((game) => game?.gameId === gameId)
    ) {
      return body;
    }
    await sleep(250);
  }
  throw new Error(
    `UI audit account head-to-head fixture ${gameId} was not listed for ${opponentDisplayName}; last response ${lastStatus}: ${JSON.stringify(lastBody).slice(0, 500)}`
  );
}

async function cleanupPartialAccountArchiveFixture(baseUrl, liam, samir) {
  const cleanupErrors = [];
  const deletePartial = async (label, accountFixture) => {
    if (!accountFixture?.session?.token || !accountFixture?.account?.displayName) return;
    try {
      await deleteAccountFixture(baseUrl, accountFixture.session.token, accountFixture.account.displayName);
    } catch (error) {
      cleanupErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  await deletePartial("delete partial Liam audit account", liam);
  await deletePartial("delete partial Samir audit account", samir);
  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join("\n"));
  }
}

async function createOpenSeekFixture(baseUrl, setup) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/seeks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      setup,
      creatorSeat: "w",
      creatorSessionId: `ui-audit-open-${Date.now().toString(36)}`,
      expiresInMs: 10 * 60 * 1_000,
    }),
  });
  const body = await readJson(response);
  assert(response.status === 201, `UI audit open seek creation failed with ${response.status}`);
  assert(typeof body.seekId === "string", "UI audit open seek creation did not return a seek id");
  return body;
}

async function createOnlineGameFixture(baseUrl, setup) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup }),
  });
  const body = await readJson(response);
  assert(response.status === 201, `UI audit game creation failed with ${response.status}`);
  assert(typeof body.gameId === "string", "UI audit game creation did not return a game id");
  assert(typeof body.white?.token === "string", "UI audit game creation did not return a white token");
  assert(typeof body.white?.url === "string", "UI audit game creation did not return a white URL");
  assert(typeof body.black?.token === "string", "UI audit game creation did not return a black token");
  assert(typeof body.black?.url === "string", "UI audit game creation did not return a black URL");
  return body;
}

async function publishOnlineGame(baseUrl, gameId, token) {
  const summary = await setOnlineGameVisibility(baseUrl, gameId, token, "public");
  assert(summary.visibility === "public", "UI audit game publish did not return public visibility");
}

async function setOnlineGameVisibility(baseUrl, gameId, token, visibility) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/games/${encodeURIComponent(gameId)}/visibility`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ visibility }),
    }
  );
  const body = await readJson(response);
  assert(response.status === 200, `UI audit game visibility update failed with ${response.status}`);
  assert(
    body.summary?.visibility === visibility,
    `UI audit game visibility update did not return ${visibility} visibility`
  );
  return body.summary;
}

async function cancelOpenSeekFixture(baseUrl, seekId, token) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/seeks/${encodeURIComponent(seekId)}/cancel`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }
  );
  assert(response.status === 200, `UI audit open seek cleanup failed with ${response.status}`);
}

async function cleanupUiAuditFixtures(baseUrl, fixtures) {
  const cleanupErrors = [];
  const runCleanup = async (label, operation) => {
    try {
      await operation();
    } catch (error) {
      cleanupErrors.push(
        `${label}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  await runCleanup("cancel open seek", () =>
    cancelOpenSeekFixture(baseUrl, fixtures.openSeekId, fixtures.openSeekToken)
  );
  await runCleanup("unlist live game", () =>
    setOnlineGameVisibility(baseUrl, fixtures.liveGameId, fixtures.liveWhiteToken, "unlisted")
  );
  await runCleanup("finish live game", () =>
    submitOnlineAction(
      baseUrl,
      fixtures.liveGameId,
      fixtures.liveBlackToken,
      `ui-audit-cleanup-black-resign-${Date.now().toString(36)}`,
      { type: "RESIGN", baseVersion: 0 }
    )
  );
  await runCleanup("unlist archived game", () =>
    setOnlineGameVisibility(baseUrl, fixtures.archivedGameId, fixtures.archivedWhiteToken, "unlisted")
  );
  await runCleanup("delete Liam audit account", () =>
    deleteAccountFixture(baseUrl, fixtures.liamAccountSession.token, fixtures.liamDisplayName)
  );
  await runCleanup("delete Samir audit account", () =>
    deleteAccountFixture(baseUrl, fixtures.samirAccountToken, fixtures.samirDisplayName)
  );

  if (cleanupErrors.length > 0) {
    throw new Error(`UI audit fixture cleanup failed:\n${cleanupErrors.join("\n")}`);
  }
}

async function deleteAccountFixture(baseUrl, token, displayName) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/account`, {
    method: "DELETE",
    headers: bearer(token),
  });
  if (response.status === 404 || response.status === 401) return;
  const body = await readJson(response);
  assert(response.status === 200, `UI audit account ${displayName} cleanup failed with ${response.status}`);
  assert(body.deleted === true, `UI audit account ${displayName} cleanup did not report deleted=true`);
}

async function submitOnlineAction(baseUrl, gameId, token, clientActionId, action) {
  const { WebSocket } = require("ws");
  const socket = new WebSocket(buildWebSocketUrl(baseUrl));
  try {
    const joined = nextSocketMessage(socket, `UI audit join ${gameId}`);
    await waitForSocketOpen(socket);
    socket.send(
      JSON.stringify(
        versionedSocketMessage({
          type: "join",
          gameId,
          token,
        })
      )
    );
    const joinedMessage = await joined;
    assert(joinedMessage.type === "joined", `UI audit did not join ${gameId}`);

    const actionResponse = nextSocketMessage(socket, `UI audit action ${clientActionId}`);
    socket.send(
      JSON.stringify(
        versionedSocketMessage({
          type: "action",
          clientActionId,
          action,
        })
      )
    );
    const actionMessage = await actionResponse;
    assert(
      actionMessage.type === "snapshot",
      `UI audit action ${clientActionId} was not accepted: ${JSON.stringify(actionMessage.error ?? actionMessage)}`
    );
    return actionMessage.snapshot;
  } finally {
    socket.close();
  }
}

function buildSpectatorUrl(baseUrl, gameId) {
  const url = new URL(baseUrl);
  url.searchParams.set("onlineGame", gameId);
  url.searchParams.set("view", "spectator");
  return url.toString();
}

function buildPlayerUrl(baseUrl, gameId, seat) {
  const url = new URL(baseUrl);
  url.searchParams.set("onlineGame", gameId);
  url.searchParams.set("seat", seat);
  url.searchParams.delete("token");
  url.hash = "";
  return url.toString();
}

async function waitForPageQuiet(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: browserTimeoutMs });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(250);
}

async function waitForText(page, text) {
  await page.getByText(text).first().waitFor({ state: "visible", timeout: browserTimeoutMs });
  await waitForPageQuiet(page);
}

async function waitForRegion(page, name) {
  await page.getByRole("region", { name, exact: true }).waitFor({
    state: "visible",
    timeout: browserTimeoutMs,
  });
  await waitForPageQuiet(page);
}

async function waitForDialog(page, name) {
  await page.getByRole("dialog", { name, exact: true }).waitFor({
    state: "visible",
    timeout: browserTimeoutMs,
  });
  await waitForPageQuiet(page);
}

async function waitForAlert(page, text) {
  const alert = page.getByRole("alert", { name: text, exact: true });
  if ((await alert.count()) > 0) {
    await alert.first().waitFor({ state: "visible", timeout: browserTimeoutMs });
  } else {
    await waitForText(page, text);
  }
  await waitForPageQuiet(page);
}

async function waitForButton(page, name) {
  await page.getByRole("button", { name, exact: true }).waitFor({
    state: "visible",
    timeout: browserTimeoutMs,
  });
  await waitForPageQuiet(page);
}

async function clickButton(page, name) {
  const button = page.getByRole("button", { name, exact: true });
  const count = await button.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = button.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: browserTimeoutMs });
      await waitForPageQuiet(page);
      return;
    }
  }
  throw new Error(`Visible button "${name}" was not found.`);
}

async function hasVisibleButton(page, name) {
  const button = page.getByRole("button", { name, exact: true });
  const count = await button.count();
  for (let index = 0; index < count; index += 1) {
    if (await button.nth(index).isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function ensureSetupPage(page) {
  if (await waitForSetupButton(page, 500)) {
    return;
  }
  if (await hasVisibleButton(page, "New Game")) {
    await clickButton(page, "New Game");
    await confirmLeaveGameIfNeeded(page);
    if (await waitForSetupButton(page, 3_000)) {
      return;
    }
  }
  if (await hasVisibleButton(page, "Menu")) {
    await clickButton(page, "Menu");
    if (await hasVisibleButton(page, "Configure New Game")) {
      await clickButton(page, "Configure New Game");
      await confirmLeaveGameIfNeeded(page);
      if (await waitForSetupButton(page, 3_000)) {
        return;
      }
    }
  }
  const visibleButtons = await listVisibleButtons(page);
  throw new Error(`Could not reach Play setup. Visible buttons: ${visibleButtons.join(", ")}`);
}

async function openOnlineFromSetup(page) {
  await ensureSetupPage(page);
  await clickButtonMatching(page, /^Online(?:, \d+ challenge activit(?:y|ies))?$/, "Online");
}

async function ensureGameBoard(page) {
  if (await page.locator(".hamburger-button").isVisible().catch(() => false)) {
    return;
  }
  await ensureSetupPage(page);
  await clickButton(page, "Play Local");
  await page.locator(".hamburger-button").waitFor({ state: "visible", timeout: browserTimeoutMs });
}

async function waitForSetupButton(page, timeoutMs) {
  try {
    await page.getByRole("button", { name: "Play Local", exact: true }).waitFor({
      state: "visible",
      timeout: timeoutMs,
    });
    await waitForPageQuiet(page);
    return true;
  } catch {
    return false;
  }
}

async function confirmLeaveGameIfNeeded(page) {
  if (await hasVisibleButton(page, "Leave Game")) {
    await clickButton(page, "Leave Game");
  }
}

async function clickButtonMatching(page, name, description) {
  const button = page.getByRole("button", { name });
  const count = await button.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = button.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: browserTimeoutMs });
      await waitForPageQuiet(page);
      return;
    }
  }
  const visibleButtons = await listVisibleButtons(page);
  throw new Error(`Visible button matching "${description}" was not found. Visible buttons: ${visibleButtons.join(", ")}`);
}

async function listVisibleButtons(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      })
      .map((button) => button.textContent?.replace(/\s+/g, " ").trim() || button.getAttribute("aria-label") || "<unnamed>")
      .slice(0, 40)
  );
}

function screenshotName(viewport, scenario) {
  return `${viewport.name}-${scenario.name}.png`;
}

async function installAuditDefaults(context) {
  await context.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("castles_first_run_intro_seen", "true");
    window.localStorage.setItem("hasSeenQuickStart", "true");
    window.localStorage.setItem("hasSeenTooltipHint", "true");
  });
}

async function installFirstRunAuditDefaults(context) {
  await context.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("hasSeenQuickStart", "true");
    window.localStorage.setItem("hasSeenTooltipHint", "true");
  });
}

async function installAccountSession(context, session) {
  await context.addInitScript((storedSession) => {
    window.localStorage.setItem("castles_online_account_session_v1", JSON.stringify(storedSession));
  }, session);
}

async function runScenario(browser, baseUrl, viewport, scenario, fixtures) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    baseURL: baseUrl,
  });
  if (scenario.useFirstRunState) {
    await installFirstRunAuditDefaults(context);
  } else {
    await installAuditDefaults(context);
  }
  if (scenario.accountSession === "liam") {
    await installAccountSession(context, fixtures.liamAccountSession);
  }
  const page = await context.newPage();
  try {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: browserTimeoutMs });
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          transition-duration: 0s !important;
          animation-duration: 0s !important;
          scroll-behavior: auto !important;
        }
      `,
    });
    await waitForPageQuiet(page);
    if (scenario.waitText) {
      await waitForText(page, scenario.waitText);
    }
    if (scenario.prepare) {
      await scenario.prepare(page, fixtures);
    }
    await waitForPageQuiet(page);

    const requiredTexts = resolveRequiredTexts(scenario, fixtures, viewport);
    const screenshotPath = path.join(outputDir, screenshotName(viewport, scenario));
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const screenshots = [
      path.relative(repoRoot, screenshotPath),
      ...(await captureScrollableScreenshots(page, viewport, scenario)),
    ];
    const metrics = await collectLayoutMetrics(page, viewport, scenario);
    const scrolledLayoutMetrics = await collectScrolledLayoutMetrics(page, viewport, scenario);
    const reachabilityViolations = await collectRequiredTextViolations(page, requiredTexts);
    const layoutViolations = [
      ...metrics.violations,
      ...scrolledLayoutMetrics.flatMap((scrolledMetrics) => scrolledMetrics.violations),
    ];
    return {
      ...metrics,
      scrolledLayoutMetrics,
      violations: [...layoutViolations, ...reachabilityViolations],
      screenshot: screenshots[0],
      screenshots,
    };
  } finally {
    await context.close();
  }
}

function resolveRequiredTexts(scenario, fixtures, viewport) {
  if (!scenario.requiredTexts) return [];
  return typeof scenario.requiredTexts === "function"
    ? scenario.requiredTexts(fixtures, viewport)
    : scenario.requiredTexts;
}

async function captureScrollableScreenshots(page, viewport, scenario) {
  const scrollables = await collectAuditedScrollables(page);

  const screenshots = [];
  for (const [index, entry] of scrollables.entries()) {
    const safeSelector = entry.selector.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const previousScrollTop = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return 0;
      const previous = element.scrollTop;
      return previous;
    }, entry.selector);
    const scrollPositions = screenshotScrollPositions(entry.maxScrollTop);
    for (const scrollPosition of scrollPositions) {
      await page.evaluate(
        ({ selector, position }) => {
          const element = document.querySelector(selector);
          if (element instanceof HTMLElement) {
            element.scrollTop = position;
          }
        },
        { selector: entry.selector, position: scrollPosition.position }
      );
      await page.waitForTimeout(100);
      const screenshotPath = path.join(
        outputDir,
        `${viewport.name}-${scenario.name}-scroll-${index + 1}-${scrollPosition.label}-${safeSelector}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshots.push(path.relative(repoRoot, screenshotPath));
    }
    await page.evaluate(
      ({ selector, previousScrollTop }) => {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement) {
          element.scrollTop = previousScrollTop;
        }
      },
      { selector: entry.selector, previousScrollTop }
    );
  }
  return screenshots;
}

async function collectAuditedScrollables(page) {
  return page.evaluate((selectors) => {
    return selectors
      .map((selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return null;
        const maxScrollTop = element.scrollHeight - element.clientHeight;
        if (maxScrollTop <= 12) return null;
        return { selector, maxScrollTop };
      })
      .filter(Boolean);
  }, AUDITED_SCROLL_SELECTORS);
}

function screenshotScrollPositions(maxScrollTop) {
  return dedupeScrollPositions([
    { label: "mid", position: Math.floor(maxScrollTop / 2) },
    { label: "bottom", position: maxScrollTop },
  ]);
}

function layoutScrollPositions(maxScrollTop) {
  return dedupeScrollPositions(
    [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
      label: fraction === 0 ? "top" : fraction === 1 ? "bottom" : `${Math.round(fraction * 100)}pct`,
      position: Math.floor(maxScrollTop * fraction),
    }))
  );
}

function dedupeScrollPositions(entries) {
  return entries.filter(
    (item, itemIndex, values) => values.findIndex((value) => value.position === item.position) === itemIndex
  );
}

async function collectLayoutMetrics(page, viewport, scenario) {
  return page.evaluate(
    ({ viewportName, viewportWidth, viewportHeight, scenarioName }) => {
      const selector = [
        "button",
        "a[href]",
        "input",
        "select",
        "textarea",
        "[role='button']",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",");
      const violations = [];
      const viewportRect = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };

      const isSuppressedByAncestor = (element) =>
        Boolean(element.closest("[aria-hidden='true'], [inert]"));

      const isElementVisible = (element, rect) => {
        const style = window.getComputedStyle(element);
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          style.visibility === "hidden" ||
          style.display === "none" ||
          Number(style.opacity) === 0 ||
          isSuppressedByAncestor(element)
        ) {
          return false;
        }
        return true;
      };

      const accessibleName = (element) => {
        const text =
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent ||
          element.getAttribute("value") ||
          element.tagName.toLowerCase();
        return String(text).replace(/\s+/g, " ").trim().slice(0, 96) || element.tagName.toLowerCase();
      };

      const intersectsViewport = (rect) =>
        rect.right > viewportRect.left &&
        rect.left < viewportRect.right &&
        rect.bottom > viewportRect.top &&
        rect.top < viewportRect.bottom;

      const rectFromElement = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };

      const documentWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body?.scrollWidth ?? 0
      );
      if (documentWidth > window.innerWidth + 1) {
        violations.push({
          type: "horizontal-document-overflow",
          message: `Document scrollWidth ${documentWidth} exceeds viewport width ${window.innerWidth}.`,
        });
      }

      const elements = Array.from(document.querySelectorAll(selector))
        .filter((element) => element instanceof HTMLElement)
        .map((element) => {
          const rect = rectFromElement(element);
          return {
            element,
            rect,
            name: accessibleName(element),
            tag: element.tagName.toLowerCase(),
            classes: element.className ? String(element.className).replace(/\s+/g, ".") : "",
            disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
          };
        })
        .filter(({ element, rect }) => isElementVisible(element, rect));

      const visibleInViewport = elements.filter(({ rect }) => intersectsViewport(rect));

      for (const item of elements) {
        const { element, rect } = item;
        if (rect.left < -1 || rect.right > window.innerWidth + 1) {
          violations.push({
            type: "interactive-horizontal-clipping",
            target: describeItem(item),
            rect,
          });
        }
        const isTextControl =
          element.tagName === "BUTTON" ||
          element.tagName === "SELECT" ||
          element.tagName === "INPUT" ||
          element.getAttribute("role") === "button";
        if (
          isTextControl &&
          element.clientWidth > 0 &&
          element.scrollWidth > element.clientWidth + 3
        ) {
          violations.push({
            type: "interactive-text-overflow",
            target: describeItem(item),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          });
        }
        if (
          isTextControl &&
          element.clientHeight > 0 &&
          element.scrollHeight > element.clientHeight + 3
        ) {
          violations.push({
            type: "interactive-vertical-text-overflow",
            target: describeItem(item),
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          });
        }
      }

      for (let leftIndex = 0; leftIndex < visibleInViewport.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < visibleInViewport.length; rightIndex += 1) {
          const left = visibleInViewport[leftIndex];
          const right = visibleInViewport[rightIndex];
          if (left.element.contains(right.element) || right.element.contains(left.element)) {
            continue;
          }
          if (left.disabled || right.disabled) {
            continue;
          }
          const overlapWidth =
            Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
          const overlapHeight =
            Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
          if (overlapWidth <= 0 || overlapHeight <= 0) continue;
          const overlapArea = overlapWidth * overlapHeight;
          const minArea = Math.min(left.rect.width * left.rect.height, right.rect.width * right.rect.height);
          if (overlapArea > 96 && overlapArea / Math.max(1, minArea) > 0.08) {
            violations.push({
              type: "interactive-overlap",
              targets: [describeItem(left), describeItem(right)],
              overlap: { width: overlapWidth, height: overlapHeight, area: overlapArea },
            });
          }
        }
      }

      return {
        viewport: {
          name: viewportName,
          width: viewportWidth,
          height: viewportHeight,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        },
        scenario: scenarioName,
        document: {
          scrollWidth: documentWidth,
          scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
        },
        interactiveCount: visibleInViewport.length,
        violations,
      };

      function describeItem(item) {
        return `${item.tag}.${item.classes || "no-class"} "${item.name}"`;
      }
    },
    {
      viewportName: viewport.name,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      scenarioName: scenario.name,
    }
  );
}

async function collectScrolledLayoutMetrics(page, viewport, scenario) {
  const scrollables = await collectAuditedScrollables(page);
  const metrics = [];
  for (const entry of scrollables) {
    const previousScrollTop = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return 0;
      return element.scrollTop;
    }, entry.selector);
    try {
      for (const scrollPosition of layoutScrollPositions(entry.maxScrollTop)) {
        await page.evaluate(
          ({ selector, position }) => {
            const element = document.querySelector(selector);
            if (element instanceof HTMLElement) {
              element.scrollTop = position;
            }
          },
          { selector: entry.selector, position: scrollPosition.position }
        );
        await page.waitForTimeout(50);
        const scrolledMetrics = await collectLayoutMetrics(page, viewport, {
          name: `${scenario.name} ${entry.selector} ${scrollPosition.label}`,
        });
        metrics.push({
          ...scrolledMetrics,
          scrollContext: {
            selector: entry.selector,
            label: scrollPosition.label,
            position: scrollPosition.position,
          },
          violations: scrolledMetrics.violations.map((violation) => ({
            ...violation,
            scrollContext: `${entry.selector}:${scrollPosition.label}`,
          })),
        });
      }
    } finally {
      await page.evaluate(
        ({ selector, previousScrollTop }) => {
          const element = document.querySelector(selector);
          if (element instanceof HTMLElement) {
            element.scrollTop = previousScrollTop;
          }
        },
        { selector: entry.selector, previousScrollTop }
      );
    }
  }
  return metrics;
}

async function collectRequiredTextViolations(page, requiredTexts) {
  if (requiredTexts.length === 0) return [];
  return page.evaluate(async (texts) => {
    const violations = [];
    const scrollables = dedupeElements([
      document.scrollingElement,
      ...Array.from(document.querySelectorAll("*")).filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const canScroll = /(auto|scroll)/.test(style.overflowY);
        return canScroll && element.scrollHeight > element.clientHeight + 8;
      }),
    ].filter(Boolean));
    const originals = scrollables.map((element) => ({
      element,
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
    }));

    try {
      for (const text of texts) {
        restoreOriginalScrolls();
        await nextFrame();
        if (!documentHasRequiredText(text)) {
          violations.push({
            type: "required-text-missing",
            message: `Required text was not found: ${text}`,
          });
          continue;
        }
        if (textIsVisible(text)) continue;

        let reached = false;
        for (const element of scrollables) {
          const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
          const positions = Array.from(
            new Set(Array.from({ length: 11 }, (_, index) => Math.floor(maxScrollTop * (index / 10))))
          );
          for (const position of positions) {
            element.scrollTop = position;
            await nextFrame();
            if (textIsVisible(text)) {
              reached = true;
              break;
            }
          }
          if (reached) break;
        }
        if (!reached) {
          violations.push({
            type: "required-text-not-reachable",
            message: `Required text exists but was not reachable by scrolling audited containers: ${text}`,
          });
        }
      }
    } finally {
      restoreOriginalScrolls();
    }

    return violations;

    function dedupeElements(elements) {
      const seen = new Set();
      const result = [];
      for (const element of elements) {
        if (!element || seen.has(element)) continue;
        seen.add(element);
        result.push(element);
      }
      return result;
    }

    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }

    function normalize(value) {
      return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function documentHasRequiredText(text) {
      const needle = normalize(text);
      if (normalize(document.body.innerText).includes(needle)) return true;
      return matchingAccessibleElements(needle).some(isElementRenderable);
    }

    function restoreOriginalScrolls() {
      for (const original of originals) {
        original.element.scrollTop = original.scrollTop;
        original.element.scrollLeft = original.scrollLeft;
      }
    }

    function textIsVisible(text) {
      for (const { rect, element } of findTextRects(text)) {
        if (
          isElementRenderable(element) &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.left < window.innerWidth &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight
        ) {
          return true;
        }
      }
      return false;
    }

    function findTextRects(text) {
      const needle = normalize(text);
      const lowerNeedle = text.toLowerCase();
      const rects = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = node.textContent ?? "";
        const parentElement = node.parentElement;
        const index = value.toLowerCase().indexOf(lowerNeedle);
        if (parentElement && index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + text.length);
          rects.push(
            ...Array.from(range.getClientRects()).map((rect) => ({
              rect,
              element: parentElement,
            }))
          );
          range.detach();
        }
        node = walker.nextNode();
      }
      if (rects.length > 0) return rects;

      return [
        ...matchingTextElements(needle),
        ...matchingAccessibleElements(needle),
      ].map((element) => ({
        rect: element.getBoundingClientRect(),
        element,
      }));
    }

    function matchingTextElements(needle) {
      return Array.from(document.body.querySelectorAll("*"))
        .filter((element) => element instanceof HTMLElement)
        .filter((element) => normalize(element.innerText).includes(needle))
        .filter((element) =>
          !Array.from(element.children).some(
            (child) => child instanceof HTMLElement && normalize(child.innerText).includes(needle)
          )
        );
    }

    function matchingAccessibleElements(needle) {
      return Array.from(document.body.querySelectorAll("*"))
        .filter((element) => element instanceof HTMLElement)
        .filter((element) =>
          accessibleTextSources(element).some((source) => normalize(source).includes(needle))
        )
        .sort((left, right) => {
          const leftLength = accessibleTextSources(left).join(" ").length;
          const rightLength = accessibleTextSources(right).join(" ").length;
          return leftLength - rightLength;
        });
    }

    function accessibleTextSources(element) {
      return [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("alt"),
        element.getAttribute("placeholder"),
        element.getAttribute("value"),
      ].filter(Boolean);
    }

    function isElementRenderable(element) {
      if (!(element instanceof HTMLElement)) return false;
      if (element.closest("[aria-hidden='true'], [inert]")) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity) !== 0
      );
    }
  }, requiredTexts);
}

async function runBrowserAudit(baseUrl) {
  const { chromium } = await import("playwright");
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  let fixtures;
  let browser;
  let operationError;
  let cleanupError;
  const results = [];
  try {
    fixtures = await createUiAuditFixtures(baseUrl);
    browser = await chromium.launch({
      headless: process.env.CASTLES_UI_AUDIT_HEADLESS !== "0",
      env: browserEnv(),
    });
    for (const viewport of VIEWPORTS) {
      for (const scenario of SCENARIOS) {
        const result = await runScenario(browser, baseUrl, viewport, scenario, fixtures);
        results.push(result);
      }
    }
  } catch (error) {
    operationError = error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        operationError ??= error;
      }
    }
    if (fixtures) {
      try {
        await cleanupUiAuditFixtures(baseUrl, fixtures);
      } catch (error) {
        cleanupError = error;
        if (operationError) {
          console.error("UI audit fixture cleanup also failed", formatErrorForLog(error));
        }
      }
    }
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  assert(fixtures, "UI audit fixtures were not created.");

  const metricsPath = path.join(outputDir, "metrics.json");
  await writeFile(
    metricsPath,
    JSON.stringify(
      {
        baseUrl,
        fixtures: {
          openSeekId: fixtures.openSeekId,
          liveGameId: fixtures.liveGameId,
          archivedGameId: fixtures.archivedGameId,
          accountGameId: fixtures.accountGameId,
          liamDisplayName: fixtures.liamDisplayName,
          samirDisplayName: fixtures.samirDisplayName,
        },
        results,
      },
      null,
      2
    )
  );
  const violations = results.flatMap((result) =>
    result.violations.map((violation) => ({
      viewport: result.viewport.name,
      scenario: result.scenario,
      screenshot: result.screenshot,
      ...violation,
    }))
  );
  if (violations.length > 0) {
    throw new Error(
      `Local UI layout audit found ${violations.length} violation(s):\n${violations
        .slice(0, 30)
        .map((violation) => {
          const context = violation.scrollContext ? ` [${violation.scrollContext}]` : "";
          return `- ${violation.viewport}/${violation.scenario}${context}: ${violation.type} ${violation.target ?? violation.targets?.join(" vs ") ?? violation.message}`;
        })
        .join("\n")}\nMetrics: ${path.relative(repoRoot, metricsPath)}`
    );
  }
  return { results, metricsPath };
}

async function main() {
  await requireLocalInputs();
  const port = await findFreePort();
  const serverProcess = startServer(port);
  let operationError;
  let auditResult;
  try {
    await waitForHealth(serverProcess);
    auditResult = await runBrowserAudit(serverProcess.baseUrl);
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
      console.error("Server shutdown also failed after UI layout audit failure", shutdownError);
    }
  }

  if (auditResult) {
    const screenshotCount = auditResult.results.reduce(
      (count, result) => count + (result.screenshots?.length ?? 1),
      0
    );
    console.log(
      `Local UI layout audit passed: ${screenshotCount} screenshots across ${auditResult.results.length} scenarios, metrics at ${path.relative(
        repoRoot,
        auditResult.metricsPath
      )}`
    );
  }
}

main().catch((error) => {
  console.error(formatErrorForLog(error));
  process.exitCode = 1;
});
