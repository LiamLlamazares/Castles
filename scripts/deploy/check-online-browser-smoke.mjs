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
  assertProtocolVersionedBody,
  buildWebSocketUrl,
  createFetchWithTimeout,
  createWebSocketWaiters,
  makeSmokeSetup,
  readJson,
  versionedSocketMessage,
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
const socketTimeoutMs = Number(process.env.SMOKE_SOCKET_TIMEOUT_MS ?? 10_000);
const fetchWithTimeout = createFetchWithTimeout(requestTimeoutMs);
const { waitForSocketOpen, nextSocketMessage } = createWebSocketWaiters(socketTimeoutMs);
const setupLabels = {
  configure: "Configure New Game",
  inviteFriend: "Invite Friend",
};

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

async function assertNoQueryToken(page, context) {
  const urlText = await page.url();
  assert(
    !new URL(urlText).searchParams.has("token"),
    `${context} URL still contained a token: ${urlText}`
  );
}

async function rememberDirectCreateJoinToken(page, gameId, seat, token) {
  assert(token, `Browser smoke direct-create ${seat} response did not include a token`);
  await page.goto(baseUrl);
  const storageKey = JSON.stringify(`castles_online_join:${gameId}:${seat}`);
  const storageValue = JSON.stringify(token);
  await page.evaluate(`sessionStorage.setItem(${storageKey}, ${storageValue})`);
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
          const rect = button.getBoundingClientRect();
          const style = window.getComputedStyle(button);
          if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            style.visibility === "hidden" ||
            style.display === "none"
          ) {
            return false;
          }
          const rendered = window.__castlesSmokeNormalizeButtonText(button.innerText);
          const source = window.__castlesSmokeNormalizeButtonText(button.textContent);
          const ariaLabel = window.__castlesSmokeNormalizeButtonText(button.getAttribute("aria-label"));
          const title = window.__castlesSmokeNormalizeButtonText(button.getAttribute("title"));
          return (
            rendered === target ||
            source === target ||
            ariaLabel === target ||
            title === target
          ) && (!mustBeEnabled || !button.disabled);
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
  assert(body.online?.eventSchemaVersion === 2, "Health did not report event schema v2");
  if (expectedCommit) {
    assert(
      body.build?.commit === expectedCommit,
      `Expected commit ${expectedCommit}, health reported ${body.build?.commit}`
    );
  }
}

async function googleOAuthProviderEnabled() {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/online/account/oauth/providers`);
    const body = await readJson(response);
    assert(response.status === 200, `OAuth providers fetch failed with ${response.status}`);
    assertProtocolVersionedBody(body, "Browser smoke OAuth providers response");
    const googleProvider = Array.isArray(body.providers)
      ? body.providers.find((provider) => provider?.provider === "google")
      : null;
    return googleProvider?.enabled === true && googleProvider.startUrl === "/api/online/account/oauth/google/start";
  } catch (error) {
    if (!isLocalBaseUrl()) {
      throw error;
    }
    return false;
  }
}

async function fetchSpectatorSnapshot(gameId, expectedVersion) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/games/${encodeURIComponent(gameId)}/spectator`
  );
  const body = await readJson(response);
  assert(response.status === 200, `Spectator snapshot failed with ${response.status}`);
  assertProtocolVersionedBody(body, "Browser smoke spectator snapshot response");
  assert(body.role === "spectator", "Spectator snapshot did not report spectator role");
  if (expectedVersion !== undefined) {
    assert(
      body.snapshot?.version === expectedVersion,
      `Spectator snapshot returned version ${body.snapshot?.version}, expected ${expectedVersion}`
    );
  }
  return body.snapshot;
}

async function verifyBoardAccountGoogleOAuthUi(page) {
  if (!(await googleOAuthProviderEnabled())) return;

  const currentUrl = await page.url();
  const expectedReturnToUrl = new URL(currentUrl);
  const expectedReturnTo = `${expectedReturnToUrl.pathname}${expectedReturnToUrl.search}`;
  assert(
    !expectedReturnTo.includes("token") && !expectedReturnToUrl.hash,
    `Browser smoke OAuth return path was not token-free: ${currentUrl}`
  );

  await page.clickButton("Guest human player. Open account sign in");
  await page.waitForText("Online account");
  const href = await waitUntil("board account Google OAuth link", () =>
    page.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        const link = dialog?.querySelector('a[aria-label="Continue with Google"]');
        return link?.getAttribute("href") ?? null;
      })()
    `)
  );
  const linkUrl = new URL(href, baseUrl);
  assert(
    linkUrl.pathname === "/api/online/account/oauth/google/start",
    `Board account Google link used unexpected path ${linkUrl.pathname}`
  );
  assert(
    linkUrl.searchParams.get("returnTo") === expectedReturnTo,
    `Board account Google link returnTo was ${linkUrl.searchParams.get("returnTo")}, expected ${expectedReturnTo}`
  );
  await page.clickButton("Close account dialog");
  await waitUntil("board account dialog to close", async () =>
    page.evaluate(`!document.querySelector('[role="dialog"][aria-modal="true"]')`)
  );
}

async function verifyStaleActionContract(setup) {
  const { WebSocket } = require("ws");
  const createResponse = await fetchWithTimeout(`${baseUrl}/api/online/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup }),
  });
  const created = await readJson(createResponse);
  assert(createResponse.status === 201, `Stale-action smoke create failed with ${createResponse.status}`);

  const socket = new WebSocket(buildWebSocketUrl(baseUrl));
  try {
    const joined = nextSocketMessage(socket, "stale-action join response");
    await waitForSocketOpen(socket);
    socket.send(
      JSON.stringify(
        versionedSocketMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        })
      )
    );

    const joinedMessage = await joined;
    assertProtocolVersionedBody(joinedMessage, "Stale-action join response");
    assert(joinedMessage.type === "joined", "Stale-action smoke did not join the created game");
    assert(joinedMessage.snapshot?.version === 0, "Stale-action game did not start at version 0");

    socket.send(
      JSON.stringify(
        versionedSocketMessage({
          type: "action",
          clientActionId: "browser-smoke-stale-first",
          action: { type: "PASS", baseVersion: 0 },
        })
      )
    );
    socket.send(
      JSON.stringify(
        versionedSocketMessage({
          type: "action",
          clientActionId: "browser-smoke-stale-second",
          action: { type: "PASS", baseVersion: 0 },
        })
      )
    );

    let rejected;
    for (let index = 0; index < 4; index += 1) {
      const message = await nextSocketMessage(socket, `stale-action response ${index + 1}`);
      assertProtocolVersionedBody(message, `Stale-action response ${index + 1}`);
      if (message.type === "rejected") {
        rejected = message;
        break;
      }
    }

    assert(rejected, "Stale-action smoke did not receive a rejected frame");
    assert(
      rejected.clientActionId === "browser-smoke-stale-second",
      `Stale-action rejection reported clientActionId ${rejected.clientActionId}`
    );
    assert(
      rejected.error?.code === "stale_action",
      `Stale-action rejection code was ${rejected.error?.code}`
    );
    assert(
      rejected.snapshot?.version === 1,
      `Stale-action rejection snapshot version was ${rejected.snapshot?.version}`
    );

    const cleanup = await submitRawPlayerAction(
      created.gameId,
      created.black.token,
      `browser-smoke-stale-cleanup-resign-${Date.now().toString(36)}`,
      { type: "RESIGN", baseVersion: 1 }
    );
    assert(
      cleanup.result?.winner === "w" && cleanup.result?.reason === "resignation",
      "Stale-action cleanup resignation did not end the helper game"
    );
  } finally {
    socket.close();
  }
}

async function submitRawPlayerAction(gameId, token, clientActionId, action) {
  const { WebSocket } = require("ws");
  const socket = new WebSocket(buildWebSocketUrl(baseUrl));
  try {
    const joined = nextSocketMessage(socket, `raw action ${clientActionId} join response`);
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
    assertProtocolVersionedBody(joinedMessage, `Raw action ${clientActionId} join response`);
    assert(joinedMessage.type === "joined", `Raw action ${clientActionId} did not join`);

    const actionResponse = nextSocketMessage(socket, `raw action ${clientActionId} response`);
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
    assertProtocolVersionedBody(actionMessage, `Raw action ${clientActionId} response`);
    assert(actionMessage.type === "snapshot", `Raw action ${clientActionId} was not accepted`);
    return actionMessage.snapshot;
  } finally {
    socket.close();
  }
}

function clipboardInitScript() {
  return `
    (() => {
      ${browserButtonHelpers()}
      const NativeWebSocket = window.WebSocket;
      const nativeFetch = window.fetch.bind(window);
      const sockets = [];
      const originalSend = NativeWebSocket.prototype.send;
      window.__castlesHoldActionSends = false;
      window.__castlesHeldActionSends = [];
      window.__castlesHoldOnlineSnapshotFetches = false;
      window.__castlesHeldOnlineSnapshotFetches = [];
      window.__castlesSmokeSocketCount = () => sockets.length;
      window.__castlesSmokeOpenSocketCount = () =>
        sockets.filter((socket) => socket.readyState === NativeWebSocket.OPEN).length;
      window.__castlesSmokeHoldActionSends = () => {
        window.__castlesHoldActionSends = true;
        window.__castlesHeldActionSends = [];
      };
      window.__castlesSmokeDiscardHeldActionSends = () => {
        const count = window.__castlesHeldActionSends.length;
        window.__castlesHeldActionSends = [];
        window.__castlesHoldActionSends = false;
        return count;
      };
      window.__castlesSmokeReleaseHeldActionSends = () => {
        const held = window.__castlesHeldActionSends.splice(0);
        window.__castlesHoldActionSends = false;
        for (const entry of held) {
          originalSend.call(entry.socket, entry.data);
        }
        return held.length;
      };
      window.__castlesSmokeHeldActionCount = () => window.__castlesHeldActionSends.length;
      window.__castlesSmokeHoldOnlineSnapshotFetches = () => {
        window.__castlesHoldOnlineSnapshotFetches = true;
        window.__castlesHeldOnlineSnapshotFetches = [];
      };
      window.__castlesSmokeHeldOnlineSnapshotFetchCount = () =>
        window.__castlesHeldOnlineSnapshotFetches.length;
      window.__castlesSmokeReleaseHeldOnlineSnapshotFetches = () => {
        const held = window.__castlesHeldOnlineSnapshotFetches.splice(0);
        window.__castlesHoldOnlineSnapshotFetches = false;
        for (const entry of held) {
          nativeFetch(entry.input, entry.init).then(entry.resolve, entry.reject);
        }
        return held.length;
      };
      window.__castlesSmokeDiscardHeldOnlineSnapshotFetches = () => {
        const held = window.__castlesHeldOnlineSnapshotFetches.splice(0);
        window.__castlesHoldOnlineSnapshotFetches = false;
        for (const entry of held) {
          entry.reject(new Error("Smoke discarded held online snapshot fetch."));
        }
        return held.length;
      };
      window.__castlesSmokeCloseOpenSockets = () => {
        let closed = 0;
        for (const socket of sockets) {
          if (socket.readyState === NativeWebSocket.OPEN) {
            socket.close(4000, "smoke reconnect");
            closed += 1;
          }
        }
        return closed;
      };
      NativeWebSocket.prototype.send = function(data) {
        if (window.__castlesHoldActionSends) {
          try {
            const message = JSON.parse(String(data));
            if (message?.type === "action") {
              window.__castlesHeldActionSends.push({ socket: this, data });
              return;
            }
          } catch {
            // Non-JSON frames should pass through unchanged.
          }
        }
        return originalSend.call(this, data);
      };
      window.fetch = function(input, init) {
        if (window.__castlesHoldOnlineSnapshotFetches) {
          const method = String(
            init?.method ?? (input instanceof Request ? input.method : "GET")
          ).toUpperCase();
          const rawUrl =
            typeof input === "string" || input instanceof URL
              ? String(input)
              : input?.url;
          const url = new URL(rawUrl, window.location.href);
          if (method === "GET" && /^\\/api\\/online\\/games\\/[^/]+$/.test(url.pathname)) {
            return new Promise((resolve, reject) => {
              window.__castlesHeldOnlineSnapshotFetches.push({ input, init, resolve, reject });
            });
          }
        }
        return nativeFetch(input, init);
      };
      function SmokeWebSocket(...args) {
        const socket = new NativeWebSocket(...args);
        sockets.push(socket);
        return socket;
      }
      SmokeWebSocket.prototype = NativeWebSocket.prototype;
      Object.setPrototypeOf(SmokeWebSocket, NativeWebSocket);
      for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
        Object.defineProperty(SmokeWebSocket, key, {
          value: NativeWebSocket[key],
          configurable: true
        });
      }
      window.WebSocket = SmokeWebSocket;
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

  async evaluate(expression) {
    return this.page.evaluate(expression);
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

async function createOnlineGameFromApi(white) {
  const createResponse = await fetchWithTimeout(`${baseUrl}/api/online/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup: makeSmokeSetup() }),
  });
  const created = await readJson(createResponse);
  assert(createResponse.status === 201, `Browser smoke create failed with ${createResponse.status}`);
  assert(created.gameId, "Browser smoke create did not return a game id");
  assert(created.white?.url, "Browser smoke create did not return a white URL");
  assert(created.black?.url, "Browser smoke create did not return a black URL");
  assert(created.white?.token, "Browser smoke create did not return a white token");
  assert(created.black?.token, "Browser smoke create did not return a black token");
  assert(
    !created.white.url.includes("token="),
    `White direct-create URL leaked a query token: ${created.white.url}`
  );
  assert(
    !created.black.url.includes("token="),
    `Black direct-create URL leaked a query token: ${created.black.url}`
  );
  assert(
    !created.white.url.includes(created.white.token),
    "White direct-create URL contained its response-body token"
  );
  assert(
    !created.black.url.includes(created.black.token),
    "Black direct-create URL contained its response-body token"
  );

  await rememberDirectCreateJoinToken(white, created.gameId, "w", created.white.token);
  await white.goto(created.white.url);
  await white.waitForText("Online White");
  await assertNoQueryToken(white, "White player");
  await white.waitForButton("Copy Spectator Link");
  const blackToken = created.black.token;
  const opponentInvite = created.black.url;
  await white.clickButton("Copy Spectator Link");
  const spectatorUrl = await waitUntil("spectator URL clipboard", async () => {
    const text = await white.getClipboard();
    return text.includes("onlineGame=") && text.includes("view=spectator")
      ? text
      : null;
  });
  assert(
    !new URL(spectatorUrl).searchParams.has("token"),
    `Spectator URL leaked a player token: ${spectatorUrl}`
  );
  const gameId = new URL(await white.url()).searchParams.get("onlineGame");
  assert(gameId, "White URL did not include onlineGame after create");
  return { gameId, opponentInvite, blackToken, spectatorUrl };
}

async function openSetupFromBase(page) {
  await page.goto(baseUrl);
  let startScreen;
  try {
    startScreen = await waitUntil("setup screen or game controls", async () => {
      if (await page.hasButton(setupLabels.inviteFriend)) return "setup";
      if (await page.hasButton("New Game")) return "game";
      return null;
    });
  } catch (error) {
    const currentUrl = await page.url().catch(() => "<unknown>");
    const bodyText = await page.bodyText().catch(() => "");
    throw new Error(
      `${error.message}; current URL ${currentUrl}; body text: ${bodyText.slice(0, 500)}`
    );
  }
  if (startScreen === "game") {
    await page.clickButton("New Game");
  }
  await page.waitForButton(setupLabels.inviteFriend);
}

async function createChallengeFromUi(challenger) {
  await openSetupFromBase(challenger);
  await challenger.waitForButton(setupLabels.inviteFriend);
  if (await challenger.hasButton("quick")) {
    await challenger.clickButton("quick");
  }
  await challenger.clickButton(setupLabels.inviteFriend);
  await challenger.waitForText("Online Challenge");
  await challenger.waitForButton("Refresh Challenge");
  await challenger.waitForButton("Copy Challenge Link");
  const challengedUrl = await waitUntil("challenge share URL", () =>
    challenger.evaluate(`
      document.querySelector(".online-state-link-preview")?.textContent?.trim()
        || Array.from(document.querySelectorAll("input"))
        .map((input) => input.value || "")
        .find((value) => value.includes("onlineChallenge=") && value.includes("challengeRole=challenged") && value.includes("challengeToken="))
        || null
    `)
  );
  assert(
    !new URL(challengedUrl).searchParams.has("token"),
    `Challenge share URL leaked a query token: ${challengedUrl}`
  );
  assert(
    new URLSearchParams(new URL(challengedUrl).hash.slice(1)).has("challengeToken"),
    `Challenge share URL did not include a fragment token: ${challengedUrl}`
  );
  await challenger.clickButton("Copy Challenge Link");
  const copiedChallengeUrl = await waitUntil("challenge URL clipboard", async () => {
    const text = await challenger.getClipboard();
    return text === challengedUrl ? text : null;
  });
  assert(copiedChallengeUrl === challengedUrl, "Copy Challenge Link did not copy the challenged URL");
  return { challengedUrl };
}

async function verifyOnlineBrowserSurface(driver) {
  const online = await driver.newPage();
  await openSetupFromBase(online);
  await online.clickButton("Online");
  await online.waitForText("Lobby, Watch, Archive");
  await waitUntil("Online browser to default to Lobby", () =>
    online.evaluate(
      `window.__castlesSmokeFindButton("Lobby games")?.getAttribute("aria-pressed") === "true"`
    )
  );

  await online.clickButton("Live public games");
  await waitUntil("Online browser Watch tab to become active", () =>
    online.evaluate(
      `window.__castlesSmokeFindButton("Live public games")?.getAttribute("aria-pressed") === "true"`
    )
  );

  await online.clickButton("Online Archive");
  await waitUntil("Online browser Archive tab to become active", () =>
    online.evaluate(
      `window.__castlesSmokeFindButton("Online Archive")?.getAttribute("aria-pressed") === "true"`
    )
  );

  await online.clickButton("Tutorial");
  await online.clickButton("Online");
  await waitUntil("Online browser to preserve Archive after Tutorial", () =>
    online.evaluate(
      `window.__castlesSmokeFindButton("Online Archive")?.getAttribute("aria-pressed") === "true"`
    )
  );
}

async function verifyBrowserChallengeFlow(driver) {
  const challenger = await driver.newPage();
  const challenged = await driver.newPage();
  const { challengedUrl } = await createChallengeFromUi(challenger);

  await challenged.goto(challengedUrl);
  await challenged.waitForText("Online Challenge");
  await challenged.waitForButton("Accept Challenge");
  await challenged.waitForButton("Decline Challenge");
  assert(
    !new URL(await challenged.url()).hash.includes("challengeToken="),
    `Challenged browser URL still contained the fragment token: ${await challenged.url()}`
  );
  await challenged.clickButton("Accept Challenge");
  await challenged.waitForText("Online Black");
  await challenged.waitForButton("Copy Spectator Link");

  const challengerChallengeState = await waitUntil("challenger challenge accept state", async () => {
    if (await challenger.hasButton("Join Game")) return "join";
    if (await challenger.hasEnabledButton("Refresh Challenge")) return "refresh";
    return null;
  });
  if (challengerChallengeState === "refresh") {
    await challenger.clickButton("Refresh Challenge");
  }
  await challenger.waitForButton("Join Game");
  await challenger.clickButton("Join Game");
  await challenger.waitForText("Online White");
  await challenger.waitForButton("Copy Spectator Link");

  const gameId = new URL(await challenger.url()).searchParams.get("onlineGame");
  assert(gameId, "Challenger URL did not include an online game after challenge accept");
  await fetchSpectatorSnapshot(gameId, 0);
  await challenged.clickButton("Resign");
  await waitUntil("browser challenge flow cleanup resignation result", async () => {
    const snapshot = await fetchSpectatorSnapshot(gameId);
    return snapshot.result?.winner === "w" && snapshot.result?.reason === "resignation"
      ? snapshot
      : null;
  });
  await challenger.waitForText("White wins by resignation");
  await challenged.waitForText("White wins by resignation");
  return gameId;
}

async function verifyBrowserStaleActionUi(page, gameId) {
  const whiteTokenStorageKey = JSON.stringify(`castles_online_join:${gameId}:w`);
  const whiteToken = await page.evaluate(`sessionStorage.getItem(${whiteTokenStorageKey})`);
  assert(whiteToken, "Browser stale-action smoke could not read the stored white token");

  let released = false;
  try {
    await page.evaluate("window.__castlesSmokeHoldActionSends()");
    await page.clickButton("Pass");
    await waitUntil("held browser action send", () =>
      page.evaluate("window.__castlesSmokeHeldActionCount() > 0")
    );
    await page.waitForText("Waiting for server");
    assert(
      !(await page.hasEnabledButton("Pass")),
      "Pass should be disabled while a browser action is waiting for the server"
    );
    assert(
      !(await page.hasEnabledButton("Resign")),
      "Resign should be disabled while a browser action is waiting for the server"
    );

    const rawSnapshot = await submitRawPlayerAction(
      gameId,
      whiteToken,
      "browser-smoke-raw-advance",
      { type: "PASS", baseVersion: 0 }
    );
    assert(
      rawSnapshot?.version === 1,
      `Raw browser stale-action setup returned version ${rawSnapshot?.version}`
    );

    const releaseCount = await page.evaluate("window.__castlesSmokeReleaseHeldActionSends()");
    released = true;
    assert(releaseCount === 1, `Expected to release one held action, released ${releaseCount}`);
    await waitUntil("browser stale-action rejection UI", async () => {
      const text = await page.bodyText();
      return (
        text.includes("Online White") &&
        (text.includes("Your turn") || text.includes("Waiting for")) &&
        text.includes("Position updated from server. Try again.") &&
        !text.includes("Waiting for server")
      );
    });
    await fetchSpectatorSnapshot(gameId, 1);
  } finally {
    if (!released) {
      await page.evaluate("window.__castlesSmokeDiscardHeldActionSends()").catch(() => {});
    }
  }
}

async function verifyBrowserReconnect(page) {
  await waitUntil("browser websocket to be open before reconnect smoke", () =>
    page.evaluate("window.__castlesSmokeOpenSocketCount() > 0")
  );
  await page.evaluate("window.__castlesSmokeHoldOnlineSnapshotFetches()");
  const beforeCount = await page.evaluate("window.__castlesSmokeSocketCount()");
  const closed = await page.evaluate("window.__castlesSmokeCloseOpenSockets()");
  assert(closed > 0, "Reconnect smoke did not find an open browser WebSocket to close");
  let released = false;
  try {
    await page.waitForText("Disconnected");
    assert(
      !(await page.hasEnabledButton("Pass")),
      "Pass should be disabled while the browser is disconnected"
    );
    assert(
      !(await page.hasEnabledButton("Resign")),
      "Resign should be disabled while the browser is disconnected"
    );
    await page.waitForText("Resyncing");
    await waitUntil("held reconnect REST snapshot fetch", () =>
      page.evaluate("window.__castlesSmokeHeldOnlineSnapshotFetchCount() > 0")
    );
    assert(
      !(await page.hasEnabledButton("Pass")),
      "Pass should be disabled while the browser is resyncing"
    );
    assert(
      !(await page.hasEnabledButton("Resign")),
      "Resign should be disabled while the browser is resyncing"
    );
    const releasedFetches = await page.evaluate(
      "window.__castlesSmokeReleaseHeldOnlineSnapshotFetches()"
    );
    released = true;
    assert(releasedFetches > 0, "Reconnect smoke did not release a held snapshot fetch");
    await waitUntil("browser websocket reconnect", async () => {
      const afterCount = await page.evaluate("window.__castlesSmokeSocketCount()");
      const text = await page.bodyText();
      return (
        afterCount > beforeCount &&
        text.includes("Online White") &&
        (text.includes("Your turn") || text.includes("Waiting for"))
      );
    });
  } finally {
    if (!released) {
      await page.evaluate("window.__castlesSmokeDiscardHeldOnlineSnapshotFetches()").catch(() => {});
    }
  }
}

async function verifyAccessDeniedRecovery(driver, gameId) {
  const denied = await driver.newPage();
  await denied.goto(`${baseUrl}/?onlineGame=${encodeURIComponent(gameId)}&seat=w&token=bad-token`);
  await denied.waitForText("Access denied");
  assert(
    !new URL(await denied.url()).searchParams.has("token"),
    `Access-denied URL still contained a token: ${await denied.url()}`
  );
  await denied.waitForButton(setupLabels.configure);
  await denied.clickButton(setupLabels.configure);
  await waitUntil("access-denied recovery URL to clear online params", async () =>
    !urlHasOnlineParams(await denied.url())
  );
  await denied.waitForButton(setupLabels.inviteFriend);
}

async function runFlow(driver) {
  await verifyHealth();
  await verifyOnlineBrowserSurface(driver);
  const white = await driver.newPage();
  const black = await driver.newPage();
  const spectator = await driver.newPage();

  const { gameId, opponentInvite, blackToken, spectatorUrl } = await createOnlineGameFromApi(white);
  await verifyBoardAccountGoogleOAuthUi(white);
  const initialSnapshot = await fetchSpectatorSnapshot(gameId, 0);
  await verifyAccessDeniedRecovery(driver, gameId);
  await verifyStaleActionContract(initialSnapshot.setup);

  await rememberDirectCreateJoinToken(black, gameId, "b", blackToken);
  await black.goto(opponentInvite);
  await black.waitForText("Online Black");
  await assertNoQueryToken(black, "Black player");
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

  await verifyBrowserStaleActionUi(white, gameId);
  await waitUntil("white pass to persist", async () => {
    const snapshot = await fetchSpectatorSnapshot(gameId);
    return snapshot.version >= 1 ? snapshot : null;
  });

  await white.goto(await white.url());
  await white.waitForText("Online White");
  await white.waitForButton("Copy Spectator Link");
  await verifyBrowserReconnect(white);

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

  await white.waitForButton(setupLabels.configure);
  await white.clickButton(setupLabels.configure);
  await waitUntil("white URL to clear online params", async () => !urlHasOnlineParams(await white.url()));
  assert(
    normalizeUrl(await white.url()) === normalizeUrl(baseUrl),
    `White Configure New Game did not return to base URL: ${await white.url()}`
  );

  await black.waitForButton(setupLabels.configure);
  await black.clickButton(setupLabels.configure);
  await waitUntil("black URL to clear online params", async () => !urlHasOnlineParams(await black.url()));
  assert(
    normalizeUrl(await black.url()) === normalizeUrl(baseUrl),
    `Black Configure New Game did not return to base URL: ${await black.url()}`
  );

  await spectator.waitForButton(setupLabels.configure);
  await spectator.clickButton(setupLabels.configure);
  await waitUntil("spectator URL to clear online params", async () => !urlHasOnlineParams(await spectator.url()));
  assert(
    normalizeUrl(await spectator.url()) === normalizeUrl(baseUrl),
    `Spectator Configure New Game did not return to base URL: ${await spectator.url()}`
  );

  await verifyBrowserChallengeFlow(driver);

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
