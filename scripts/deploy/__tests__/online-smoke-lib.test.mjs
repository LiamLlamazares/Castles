import { describe, expect, it } from "vitest";
import { assertGoogleOAuthSmoke } from "../online-smoke-lib.mjs";

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

describe("online smoke helpers", () => {
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
