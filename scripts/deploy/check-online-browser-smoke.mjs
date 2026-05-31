#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import {
  assert,
  createFetchWithTimeout,
  readJson,
} from "./online-smoke-lib.mjs";

const require = createRequire(import.meta.url);
const baseUrl = (process.argv[2] ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const expectedCommit = process.argv[3] ?? process.env.EXPECTED_COMMIT;
const allowAnyCommit = process.env.CASTLES_ALLOW_ANY_COMMIT === "1";
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15_000);
const browserTimeoutMs = Number(process.env.SMOKE_BROWSER_TIMEOUT_MS ?? 20_000);
const fetchWithTimeout = createFetchWithTimeout(requestTimeoutMs);

function normalizeUrl(urlText) {
  const url = new URL(urlText);
  url.hash = "";
  if (url.pathname === "/") {
    return `${url.origin}${url.search}`;
  }
  return url.toString().replace(/\/$/, "");
}

function urlHasOnlineParams(urlText) {
  const params = new URL(urlText).searchParams;
  return ["onlineGame", "seat", "token", "view", "pgn", "game"].some((key) =>
    params.has(key)
  );
}

function isLocalBaseUrl() {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function browserButtonHelpers() {
  return `
      window.__castlesSmokeNormalizeButtonText = (value) =>
        String(value ?? "").replace(/\\s+/g, " ").trim().toLowerCase();
      window.__castlesSmokeFindButton = (text, mustBeEnabled = false) => {
        const target = window.__castlesSmokeNormalizeButtonText(text);
        return Array.from(document.querySelectorAll("button")).find((button) => {
          const rendered = window.__castlesSmokeNormalizeButtonText(button.innerText);
          const source = window.__castlesSmokeNormalizeButtonText(button.textContent);
          return (rendered === target || source === target) && (!mustBeEnabled || !button.disabled);
        }) ?? null;
      };
  `;
}

async function waitUntil(description, predicate, timeoutMs = browserTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }

  throw new Error(
    `Timed out waiting for ${description} after ${timeoutMs}ms${
      lastError ? `: ${lastError.message}` : ""
    }`
  );
}

async function verifyHealth() {
  if (!expectedCommit && !allowAnyCommit && !isLocalBaseUrl()) {
    throw new Error(
      "EXPECTED_COMMIT is required for non-local browser smoke targets. Set CASTLES_ALLOW_ANY_COMMIT=1 only for an intentional unpinned smoke run."
    );
  }
  const health = await fetchWithTimeout(`${baseUrl}/api/health`);
  const body = await readJson(health);
  assert(health.ok, `Health check failed with ${health.status}`);
  assert(body.ok === true, "Health body did not report ok=true");
  assert(body.online?.eventSchemaVersion === 1, "Health did not report event schema v1");
  if (expectedCommit) {
    assert(
      body.build?.commit === expectedCommit,
      `Expected commit ${expectedCommit}, health reported ${body.build?.commit}`
    );
  }
}

async function fetchSpectatorSnapshot(gameId, expectedVersion) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/games/${encodeURIComponent(gameId)}/spectator`
  );
  const body = await readJson(response);
  assert(response.status === 200, `Spectator snapshot failed with ${response.status}`);
  assert(body.role === "spectator", "Spectator snapshot did not report spectator role");
  if (expectedVersion !== undefined) {
    assert(
      body.snapshot?.version === expectedVersion,
      `Spectator snapshot returned version ${body.snapshot?.version}, expected ${expectedVersion}`
    );
  }
  return body.snapshot;
}

function clipboardInitScript() {
  return `
    (() => {
      ${browserButtonHelpers()}
      let clipboardText = "";
      Object.defineProperty(window, "__castlesClipboard", {
        get: () => clipboardText,
        configurable: true
      });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text) => {
            clipboardText = String(text);
          }
        },
        configurable: true
      });
      window.alert = (message) => {
        window.__castlesLastAlert = String(message);
      };
      window.confirm = () => true;
    })();
  `;
}

class PlaywrightPageDriver {
  constructor(page) {
    this.page = page;
  }

  async goto(url) {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: browserTimeoutMs });
  }

  async clickButton(text) {
    await waitUntil(`enabled button ${text}`, () => this.hasEnabledButton(text));
    await this.page.evaluate((target) => {
      const button = window.__castlesSmokeFindButton(target, true);
      if (!button) throw new Error(`Button not found: ${target}`);
      button.click();
    }, text);
  }

  async waitForText(text) {
    await this.page
      .locator("body")
      .filter({ hasText: text })
      .waitFor({ timeout: browserTimeoutMs });
  }

  async hasButton(text) {
    return this.page.evaluate((target) => !!window.__castlesSmokeFindButton(target), text);
  }

  async hasEnabledButton(text) {
    return this.page.evaluate((target) => !!window.__castlesSmokeFindButton(target, true), text);
  }

  async waitForButton(text) {
    await waitUntil(`button ${text}`, () => this.hasButton(text));
  }

  async waitForNoButton(text) {
    await waitUntil(`button ${text} to be absent`, async () => !(await this.hasButton(text)));
  }

  async getClipboard() {
    return this.page.evaluate(() => window.__castlesClipboard ?? "");
  }

  async bodyText() {
    return this.page.locator("body").innerText({ timeout: browserTimeoutMs });
  }

  async url() {
    return this.page.url();
  }
}

class CdpPageDriver {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    const rejectPending = (error) => {
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    };
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString("utf8"));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
    socket.on("error", (error) => rejectPending(error));
    socket.on("close", () => rejectPending(new Error("Chrome DevTools socket closed")));
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome DevTools command timed out: ${method}`));
      }, browserTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  async init() {
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    await this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: clipboardInitScript(),
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "Runtime evaluation failed"
      );
    }
    return result.result?.value;
  }

  async goto(url) {
    const expectedOrigin = new URL(url).origin;
    await this.send("Page.navigate", { url });
    await waitUntil(`page load for ${url}`, async () => {
      const href = await this.evaluate("window.location.href");
      const state = await this.evaluate("document.readyState");
      return href.startsWith(expectedOrigin) && (state === "interactive" || state === "complete");
    });
  }

  async clickButton(text) {
    const literal = JSON.stringify(text);
    await waitUntil(`button ${text}`, () => this.hasEnabledButton(text));
    await this.evaluate(`
      (() => {
        const target = window.__castlesSmokeFindButton(${literal}, true);
        if (!target) throw new Error("Button not found: " + ${literal});
        target.click();
        return true;
      })()
    `);
  }

  async waitForText(text) {
    const literal = JSON.stringify(text);
    await waitUntil(`text ${text}`, () =>
      this.evaluate(`document.body?.innerText.includes(${literal})`)
    );
  }

  async hasButton(text) {
    const literal = JSON.stringify(text);
    return this.evaluate(`!!window.__castlesSmokeFindButton(${literal})`);
  }

  async hasEnabledButton(text) {
    const literal = JSON.stringify(text);
    return this.evaluate(`!!window.__castlesSmokeFindButton(${literal}, true)`);
  }

  async waitForButton(text) {
    await waitUntil(`button ${text}`, () => this.hasButton(text));
  }

  async waitForNoButton(text) {
    await waitUntil(`button ${text} to be absent`, async () => !(await this.hasButton(text)));
  }

  async getClipboard() {
    return this.evaluate("window.__castlesClipboard ?? ''");
  }

  async bodyText() {
    return this.evaluate("document.body?.innerText ?? ''");
  }

  async url() {
    return this.evaluate("window.location.href");
  }
}

async function createPlaywrightDriver() {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    return null;
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    });
  } catch {
    return null;
  }
  const contexts = [];

  return {
    name: "playwright",
    async newPage() {
      const context = await browser.newContext();
      await context.addInitScript(clipboardInitScript());
      contexts.push(context);
      return new PlaywrightPageDriver(await context.newPage());
    },
    async close() {
      for (const context of contexts.splice(0)) {
        await context.close().catch(() => {});
      }
      await browser.close().catch(() => {});
    },
  };
}

function findChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function robustRm(dir) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(250 * (attempt + 1));
    }
  }
}

async function waitForDevToolsPort(profileDir) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + browserTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const [port] = (await readFile(activePortPath, "utf8")).trim().split(/\r?\n/);
      if (port) return port;
    } catch {
      // Chrome has not written the file yet.
    }
    await sleep(100);
  }
  throw new Error("Chrome did not expose a DevTools port.");
}

async function openChromePage(chromePath) {
  const profileDir = await mkdtemp(path.join(tmpdir(), "castles-online-smoke-"));
  const child = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] }
  );

  let socket;
  const closeChrome = async () => {
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(2_000),
    ]);
    await robustRm(profileDir);
  };

  try {
    const port = await waitForDevToolsPort(profileDir);
    const listResponse = await fetchWithTimeout(`http://127.0.0.1:${port}/json/list`);
    const targets = await readJson(listResponse);
    const pageTarget = targets.find((target) => target.type === "page");
    assert(pageTarget?.webSocketDebuggerUrl, "Chrome did not create a debuggable page target");

    const { WebSocket } = require("ws");
    socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    const page = new CdpPageDriver(socket);
    await page.init();

    return {
      page,
      close: closeChrome,
    };
  } catch (error) {
    await closeChrome();
    throw error;
  }
}

async function createChromeDriver() {
  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error(
      "Playwright is not installed and Chrome/Edge was not found. Install Playwright or set CHROME_PATH to a Chromium-compatible browser."
    );
  }
  const pages = [];
  return {
    name: `chrome-cdp (${chromePath})`,
    async newPage() {
      const entry = await openChromePage(chromePath);
      pages.push(entry);
      return entry.page;
    },
    async close() {
      for (const entry of pages.splice(0).reverse()) {
        await entry.close().catch((error) => {
          console.error("Browser cleanup failed", error);
        });
      }
    },
  };
}

async function createDriver() {
  return (await createPlaywrightDriver()) ?? (await createChromeDriver());
}

async function createOnlineGameFromUi(white) {
  await white.goto(baseUrl);
  let startScreen;
  try {
    startScreen = await waitUntil("setup screen or game controls", async () => {
      if (await white.hasButton("CREATE ONLINE GAME")) return "setup";
      if (await white.hasButton("New Game")) return "game";
      return null;
    });
  } catch (error) {
    const currentUrl = await white.url().catch(() => "<unknown>");
    const bodyText = await white.bodyText().catch(() => "");
    throw new Error(
      `${error.message}; current URL ${currentUrl}; body text: ${bodyText.slice(0, 500)}`
    );
  }
  if (startScreen === "game") {
    await white.waitForButton("New Game");
    await white.clickButton("New Game");
  }
  await white.waitForButton("CREATE ONLINE GAME");
  if (await white.hasButton("quick")) {
    await white.clickButton("quick");
  }
  await white.clickButton("CREATE ONLINE GAME");
  await white.waitForButton("Copy Opponent Invite");
  await white.waitForButton("Copy Spectator Link");
  await white.clickButton("Copy Opponent Invite");

  const opponentInvite = await waitUntil("opponent invite clipboard", async () => {
    const text = await white.getClipboard();
    return text.includes("onlineGame=") && text.includes("seat=b") && text.includes("token=")
      ? text
      : null;
  });
  await white.clickButton("Copy Spectator Link");
  const spectatorUrl = await waitUntil("spectator URL clipboard", async () => {
    const text = await white.getClipboard();
    return text.includes("onlineGame=") && text.includes("view=spectator")
      ? text
      : null;
  });
  const gameId = new URL(await white.url()).searchParams.get("onlineGame");
  assert(gameId, "White URL did not include onlineGame after create");
  return { gameId, opponentInvite, spectatorUrl };
}

async function runFlow(driver) {
  await verifyHealth();
  const white = await driver.newPage();
  const black = await driver.newPage();
  const spectator = await driver.newPage();

  const { gameId, opponentInvite, spectatorUrl } = await createOnlineGameFromUi(white);
  await fetchSpectatorSnapshot(gameId, 0);

  await black.goto(opponentInvite);
  await black.waitForText("Online Black");
  await black.waitForButton("Copy Spectator Link");
  assert(
    !(await black.hasButton("Copy Opponent Invite")),
    "Black player should not see the move-enabled opponent invite"
  );
  await black.waitForButton("Resign");

  await spectator.goto(spectatorUrl);
  await spectator.waitForText("Spectating");
  await spectator.waitForButton("Copy Spectator Link");
  assert(
    !(await spectator.hasEnabledButton("Pass")),
    "Spectator should not have an enabled Pass control"
  );
  assert(
    !(await spectator.hasEnabledButton("Resign")),
    "Spectator should not have an enabled Resign control"
  );

  await white.clickButton("Pass");
  await waitUntil("white pass to persist", async () => {
    const snapshot = await fetchSpectatorSnapshot(gameId);
    return snapshot.version >= 1 ? snapshot : null;
  });

  await white.goto(await white.url());
  await white.waitForText("Online White");
  await white.waitForButton("Copy Opponent Invite");
  await white.waitForButton("Copy Spectator Link");

  await black.clickButton("Resign");
  await waitUntil("black resignation result", async () => {
    const snapshot = await fetchSpectatorSnapshot(gameId);
    return snapshot.result?.winner === "w" && snapshot.result?.reason === "resignation"
      ? snapshot
      : null;
  });

  await white.waitForText("White wins by resignation");
  await black.waitForText("White wins by resignation");
  await spectator.waitForText("White wins by resignation");
  await white.waitForNoButton("Reset Board");
  await black.waitForNoButton("Reset Board");
  await spectator.waitForNoButton("Reset Board");

  await white.waitForButton("Configure New Game");
  await white.clickButton("Configure New Game");
  await waitUntil("white URL to clear online params", async () => !urlHasOnlineParams(await white.url()));
  assert(
    normalizeUrl(await white.url()) === normalizeUrl(baseUrl),
    `White Configure New Game did not return to base URL: ${await white.url()}`
  );

  await black.waitForButton("Configure New Game");
  await black.clickButton("Configure New Game");
  await waitUntil("black URL to clear online params", async () => !urlHasOnlineParams(await black.url()));
  assert(
    normalizeUrl(await black.url()) === normalizeUrl(baseUrl),
    `Black Configure New Game did not return to base URL: ${await black.url()}`
  );

  await spectator.waitForButton("Configure New Game");
  await spectator.clickButton("Configure New Game");
  await waitUntil("spectator URL to clear online params", async () => !urlHasOnlineParams(await spectator.url()));
  assert(
    normalizeUrl(await spectator.url()) === normalizeUrl(baseUrl),
    `Spectator Configure New Game did not return to base URL: ${await spectator.url()}`
  );

  return gameId;
}

async function main() {
  const driver = await createDriver();
  try {
    const gameId = await runFlow(driver);
    console.log(`Browser online smoke passed for ${baseUrl} using ${driver.name} and game ${gameId}`);
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
