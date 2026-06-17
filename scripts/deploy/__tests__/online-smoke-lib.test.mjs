import { describe, expect, it } from "vitest";
import * as smokeLib from "../online-smoke-lib.mjs";

const { assertGoogleOAuthSmoke, resolveOnlineSmokeCliOptions } = smokeLib;

const SINGLE_NODE_DEPLOYMENT = {
  mode: "single-node",
  multiInstanceReady: false,
  websocketFanout: "process-local",
  spectatorPresence: "postgres-live-presence",
  accountPresence: "session-store",
  roomState: "process-local",
  queueGuards: "process-local",
  routing: "single-node",
};

const MULTI_INSTANCE_DEPLOYMENT = {
  mode: "multi-instance",
  multiInstanceReady: true,
  websocketFanout: "postgres-runtime-events",
  spectatorPresence: "postgres-live-presence",
  accountPresence: "session-store",
  roomState: "store-authoritative-warm-cache",
  queueGuards: "postgres-locks-and-store-transactions",
  routing: "multi-node",
};

function jsonResponse(url, body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

function stateWithReturnTo(returnTo = "/?onlineGame=game_return&seat=w&view=spectator") {
  return `${Buffer.from(
    JSON.stringify({
      nonce: "production-smoke-nonce",
      returnTo,
      exp: 1_800_000_000,
    })
  ).toString("base64url")}.signature`;
}

function healthWithRuntime(runtime = {}) {
  return {
    ok: true,
    online: {
      deployment: SINGLE_NODE_DEPLOYMENT,
      eventSchemaVersion: 2,
      runtime: {
        readiness: { ok: true },
        eventPolling: { ready: true, running: true, consecutiveFailures: 0 },
        nodeHeartbeat: { ready: true, running: true, consecutiveFailures: 0 },
        ...runtime,
      },
    },
  };
}

describe("online smoke helpers", () => {
  it("defaults the API smoke to the current production domain and ignores empty env overrides", () => {
    expect(resolveOnlineSmokeCliOptions).toEqual(expect.any(Function));

    expect(resolveOnlineSmokeCliOptions([], {})).toMatchObject({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: undefined,
    });
    expect(
      resolveOnlineSmokeCliOptions(
        [],
        {
          BASE_URL: "   ",
          EXPECTED_COMMIT: "   ",
        },
      ),
    ).toMatchObject({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: undefined,
    });
    expect(
      resolveOnlineSmokeCliOptions(["https://preview.example/", "abcdef"], {
        BASE_URL: "https://wrong.example",
        EXPECTED_COMMIT: "wrong",
      }),
    ).toMatchObject({
      baseUrl: "https://preview.example",
      expectedCommit: "abcdef",
    });
    expect(
      resolveOnlineSmokeCliOptions([], {
        BASE_URL: " https://env.example/ ",
        EXPECTED_COMMIT: " abcdef ",
      }),
    ).toMatchObject({
      baseUrl: "https://env.example",
      expectedCommit: "abcdef",
    });
  });

  it("accepts ready runtime health for production smoke", () => {
    expect(smokeLib.assertProductionRuntimeHealthReady).toEqual(expect.any(Function));

    expect(() => {
      smokeLib.assertProductionRuntimeHealthReady(healthWithRuntime());
    }).not.toThrow();
  });

  it("accepts supported multi-instance deployment metadata for production smoke", () => {
    expect(() => {
      smokeLib.assertProductionRuntimeHealthReady({
        ...healthWithRuntime(),
        online: {
          ...healthWithRuntime().online,
          deployment: MULTI_INSTANCE_DEPLOYMENT,
        },
      });
    }).not.toThrow();
  });

  it("rejects missing or unsafe deployment metadata before production smoke mutates state", () => {
    expect(() => {
      smokeLib.assertProductionRuntimeHealthReady({
        ...healthWithRuntime(),
        online: {
          ...healthWithRuntime().online,
          deployment: undefined,
        },
      });
    }).toThrow(/deployment metadata/i);
    expect(() => {
      smokeLib.assertProductionRuntimeHealthReady({
        ...healthWithRuntime(),
        online: {
          ...healthWithRuntime().online,
          deployment: {
            ...SINGLE_NODE_DEPLOYMENT,
            mode: "multi-instance",
            multiInstanceReady: true,
          },
        },
      });
    }).toThrow(/deployment metadata/i);
  });

  it("rejects production health without runtime scheduler status", () => {
    expect(() => {
      smokeLib.assertProductionRuntimeHealthReady?.({
        ok: true,
        online: { deployment: SINGLE_NODE_DEPLOYMENT, eventSchemaVersion: 2 },
      });
    }).toThrow(/runtime health/i);
  });

  it("rejects production health when runtime event polling is not ready", () => {
    expect(() => {
      smokeLib.assertProductionRuntimeHealthReady?.(
        healthWithRuntime({
          eventPolling: { ready: false, running: true, consecutiveFailures: 3 },
        })
      );
    }).toThrow(/runtime event polling.*not ready/i);
  });

  it("rejects production health when runtime-node heartbeat is not ready", () => {
    expect(() => {
      smokeLib.assertProductionRuntimeHealthReady?.(
        healthWithRuntime({
          nodeHeartbeat: { ready: false, running: true, consecutiveFailures: 2 },
        })
      );
    }).toThrow(/runtime-node heartbeat.*not ready/i);
  });

  it("rejects public health that exposes runtime-node identity or persisted node rows", () => {
    for (const leakedRuntime of [
      { nodeId: "prod-node-a" },
      { runtimeNodeId: "prod-node-a" },
      { node: { nodeId: "prod-node-a" } },
      { runtimeNode: { nodeId: "prod-node-a" } },
      { nodeState: { nodeId: "prod-node-a" } },
      { persistedNode: { nodeId: "prod-node-a" } },
      { online_runtime_nodes: [{ node_id: "prod-node-a" }] },
    ]) {
      expect(() => {
        smokeLib.assertProductionRuntimeHealthReady?.(healthWithRuntime(leakedRuntime));
      }).toThrow(/public health exposed internal runtime-node state/i);
    }
  });

  it("allows unrelated public health node metadata outside runtime status", () => {
    expect(() => {
      smokeLib.assertProductionRuntimeHealthReady({
        ...healthWithRuntime(),
        build: { node: "v22.0.0", commit: "abc123" },
      });
    }).not.toThrow();
  });

  it("accepts a configured Google OAuth provider and production callback redirect", async () => {
    const calls = [];
    const fetchWithTimeout = async (url, options) => {
      calls.push({ url, options });
      if (url === "https://castles.example/api/online/account/oauth/providers") {
        return jsonResponse(url, {
          protocolVersion: 1,
          providers: [
            {
              provider: "google",
              enabled: true,
              startUrl: "/api/online/account/oauth/google/start",
            },
          ],
        });
      }
      if (
        url ===
        "https://castles.example/api/online/account/oauth/google/start?returnTo=%2F%3FonlineGame%3Dgame_return%26seat%3Dw%26view%3Dspectator"
      ) {
        const redirect = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        redirect.searchParams.set("client_id", "public-client-id.apps.googleusercontent.com");
        redirect.searchParams.set("response_type", "code");
        redirect.searchParams.set("scope", "openid email profile");
        redirect.searchParams.set(
          "redirect_uri",
          "https://castles.example/api/online/account/oauth/google/callback"
        );
        redirect.searchParams.set("state", stateWithReturnTo());
        return new Response(null, {
          status: 302,
          headers: { location: redirect.toString() },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    };

    await expect(assertGoogleOAuthSmoke(fetchWithTimeout, "https://castles.example/")).resolves.toBeUndefined();
    expect(calls).toEqual([
      {
        url: "https://castles.example/api/online/account/oauth/providers",
        options: undefined,
      },
      {
        url: "https://castles.example/api/online/account/oauth/google/start?returnTo=%2F%3FonlineGame%3Dgame_return%26seat%3Dw%26view%3Dspectator",
        options: { redirect: "manual" },
      },
    ]);
  });

  it("verifies Google OAuth start preserves a safe board return path in signed state", async () => {
    const calls = [];
    const fetchWithTimeout = async (url, options) => {
      calls.push({ url, options });
      if (url === "https://castles.example/api/online/account/oauth/providers") {
        return jsonResponse(url, {
          protocolVersion: 1,
          providers: [
            {
              provider: "google",
              enabled: true,
              startUrl: "/api/online/account/oauth/google/start",
            },
          ],
        });
      }
      if (
        url ===
        "https://castles.example/api/online/account/oauth/google/start?returnTo=%2F%3FonlineGame%3Dgame_return%26seat%3Dw%26view%3Dspectator"
      ) {
        const redirect = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        redirect.searchParams.set("client_id", "public-client-id.apps.googleusercontent.com");
        redirect.searchParams.set("response_type", "code");
        redirect.searchParams.set("scope", "openid email profile");
        redirect.searchParams.set(
          "redirect_uri",
          "https://castles.example/api/online/account/oauth/google/callback"
        );
        redirect.searchParams.set("state", stateWithReturnTo());
        return new Response(null, {
          status: 302,
          headers: { location: redirect.toString() },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    };

    await expect(assertGoogleOAuthSmoke(fetchWithTimeout, "https://castles.example/")).resolves.toBeUndefined();
    expect(calls[1]).toEqual({
      url: "https://castles.example/api/online/account/oauth/google/start?returnTo=%2F%3FonlineGame%3Dgame_return%26seat%3Dw%26view%3Dspectator",
      options: { redirect: "manual" },
    });
  });

  it("rejects disabled or missing Google OAuth providers", async () => {
    const fetchWithTimeout = async () =>
      jsonResponse("https://castles.example/api/online/account/oauth/providers", {
        protocolVersion: 1,
        providers: [{ provider: "google", enabled: false }],
      });

    await expect(assertGoogleOAuthSmoke(fetchWithTimeout, "https://castles.example")).rejects.toThrow(
      /Google OAuth provider was not enabled/
    );
  });

  it("rejects Google OAuth starts that use the wrong callback URL", async () => {
    const fetchWithTimeout = async (url) => {
      if (url.endsWith("/providers")) {
        return jsonResponse(url, {
          protocolVersion: 1,
          providers: [
            {
              provider: "google",
              enabled: true,
              startUrl: "/api/online/account/oauth/google/start",
            },
          ],
        });
      }
      const redirect = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      redirect.searchParams.set("client_id", "public-client-id.apps.googleusercontent.com");
      redirect.searchParams.set("response_type", "code");
      redirect.searchParams.set("scope", "openid email profile");
      redirect.searchParams.set("redirect_uri", "https://wrong.example/callback");
      redirect.searchParams.set("state", stateWithReturnTo());
      return new Response(null, {
        status: 302,
        headers: { location: redirect.toString() },
      });
    };

    await expect(assertGoogleOAuthSmoke(fetchWithTimeout, "https://castles.example")).rejects.toThrow(
      /Google OAuth redirect_uri did not match production callback/
    );
  });
});
