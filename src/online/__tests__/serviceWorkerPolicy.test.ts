import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

function loadServiceWorkerPolicy() {
  const script = readFileSync(resolve(process.cwd(), "public", "service-worker.js"), "utf8");
  const context = {
    caches: {
      delete: vi.fn(() => Promise.resolve(true)),
      keys: vi.fn(),
      open: vi.fn(),
      match: vi.fn(),
    },
    self: {
      addEventListener: vi.fn(),
      clients: { claim: vi.fn() },
      location: { origin: "https://castles.example" },
      skipWaiting: vi.fn(),
    },
    URL,
  };
  vm.runInNewContext(script, context);
  return context as typeof context & {
    shouldBypassCacheForRequest?: (request: { method: string; url: string; mode?: string }) => boolean;
    shouldUseNetworkFirstForRequest?: (request: { method: string; url: string; mode?: string }) => boolean;
  };
}

function getCurrentCacheName(): string {
  const script = readFileSync(resolve(process.cwd(), "public", "service-worker.js"), "utf8");
  const match = script.match(/const CACHE_NAME = "(castles-shell-v\d+)";/);
  expect(match).not.toBeNull();
  return match![1];
}

describe("service worker cache policy", () => {
  it("bypasses online, API, websocket, service-worker, and token-bearing same-origin GET requests", () => {
    const context = loadServiceWorkerPolicy();

    expect(typeof context.shouldBypassCacheForRequest).toBe("function");
    const shouldBypass = context.shouldBypassCacheForRequest!;

    expect(shouldBypass({ method: "GET", url: "https://castles.example/service-worker.js" })).toBe(true);
    expect(shouldBypass({ method: "GET", url: "https://castles.example/api/health" })).toBe(true);
    expect(shouldBypass({ method: "GET", url: "https://castles.example/api/online/games/game_1" })).toBe(true);
    expect(shouldBypass({ method: "GET", url: "https://castles.example/ws" })).toBe(true);
    expect(
      shouldBypass({
        method: "GET",
        url: "https://castles.example/?onlineGame=game_1&seat=w",
      })
    ).toBe(true);
    expect(
      shouldBypass({
        method: "GET",
        url: "https://castles.example/?onlineGame=game_1&seat=w&token=secret",
      })
    ).toBe(true);
    expect(
      shouldBypass({
        method: "GET",
        url: "https://castles.example/?onlineChallenge=challenge_1&challengeRole=challenged",
      })
    ).toBe(true);
    expect(
      shouldBypass({
        method: "GET",
        url: "https://castles.example/?challengeToken=secret",
      })
    ).toBe(true);
    expect(shouldBypass({ method: "GET", url: "https://castles.example/manifest.json" })).toBe(
      false
    );
  });

  it("uses network-first for app shell requests so deploys replace old bundles", () => {
    const context = loadServiceWorkerPolicy();

    expect(typeof context.shouldUseNetworkFirstForRequest).toBe("function");
    const shouldUseNetworkFirst = context.shouldUseNetworkFirstForRequest!;

    expect(
      shouldUseNetworkFirst({ method: "GET", url: "https://castles.example/", mode: "navigate" })
    ).toBe(true);
    expect(
      shouldUseNetworkFirst({ method: "GET", url: "https://castles.example/index.html" })
    ).toBe(true);
    expect(
      shouldUseNetworkFirst({ method: "GET", url: "https://castles.example/rules", mode: "navigate" })
    ).toBe(true);
    expect(
      shouldUseNetworkFirst({ method: "GET", url: "https://castles.example/manifest.json" })
    ).toBe(false);
  });

  it("deletes old cache versions during activation", async () => {
    const context = loadServiceWorkerPolicy();
    const currentCacheName = getCurrentCacheName();
    const activateHandler = context.self.addEventListener.mock.calls.find(
      ([eventName]) => eventName === "activate"
    )?.[1];
    expect(typeof activateHandler).toBe("function");

    context.caches.keys.mockResolvedValue(["castles-shell-v3", "castles-shell-v4", currentCacheName]);
    let activationPromise: Promise<unknown> | undefined;
    activateHandler({
      waitUntil: (promise: Promise<unknown>) => {
        activationPromise = promise;
      },
    });

    await activationPromise;

    expect(context.caches.delete).toHaveBeenCalledWith("castles-shell-v3");
    expect(context.caches.delete).toHaveBeenCalledWith("castles-shell-v4");
    expect(context.caches.delete).not.toHaveBeenCalledWith(currentCacheName);
  });
});
