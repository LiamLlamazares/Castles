import { describe, expect, it } from "vitest";
import {
  assertServerRuntimeFiles,
  parseServerRuntimeConfig,
} from "../serverRuntimeConfig";

describe("parseServerRuntimeConfig", () => {
  it("normalizes a complete production runtime configuration", () => {
    const config = parseServerRuntimeConfig(
      {
        NODE_ENV: "production",
        PORT: "3100",
        PUBLIC_BASE_URL: "https://castles.example/",
        CASTLES_STATIC_DIR: "/srv/castles/build",
        CASTLES_REQUIRE_STATIC_DIR: "1",
        CASTLES_ENABLE_LOCAL_SHUTDOWN: "1",
        CASTLES_LOCAL_SHUTDOWN_TOKEN: "shutdown-token",
        CASTLES_DEPLOYMENT_MODE: "single-node",
        BUILD_ID: "20260601-010203",
        GIT_COMMIT: "0123456789abcdef0123456789abcdef01234567",
      },
      "/srv/castles"
    );

    expect(config).toEqual({
      port: 3100,
      bindHost: "127.0.0.1",
      publicBaseUrl: "https://castles.example",
      staticDir: "/srv/castles/build",
      requireStaticDir: true,
      localShutdownEnabled: true,
      localShutdownToken: "shutdown-token",
      deployment: {
        mode: "single-node",
        multiInstanceReady: false,
        websocketFanout: "process-local",
        spectatorPresence: "process-local",
        accountPresence: "session-store",
        roomState: "process-local",
        queueGuards: "process-local",
        routing: "single-node",
      },
      buildId: "20260601-010203",
      commit: "0123456789abcdef0123456789abcdef01234567",
    });
  });

  it("uses loopback HTTP defaults outside production", () => {
    const config = parseServerRuntimeConfig({}, "C:/repo/Castles");

    expect(config.port).toBe(3000);
    expect(config.bindHost).toBe("127.0.0.1");
    expect(config.publicBaseUrl).toBe("http://localhost:3000");
    expect(config.staticDir).toBe("C:/repo/Castles/build");
    expect(config.requireStaticDir).toBe(false);
    expect(config.deployment).toMatchObject({
      mode: "single-node",
      multiInstanceReady: false,
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      accountPresence: "session-store",
      roomState: "process-local",
      queueGuards: "process-local",
      routing: "single-node",
    });
  });

  it("rejects multi-instance deployment mode until shared presence and fanout exist", () => {
    expect(() =>
      parseServerRuntimeConfig(
        {
          CASTLES_DEPLOYMENT_MODE: "multi-instance",
          PUBLIC_BASE_URL: "http://127.0.0.1:3000",
        },
        "/srv/castles"
      )
    ).toThrow(/multi-instance.*not supported/i);
  });

  it("rejects unknown deployment modes before startup", () => {
    expect(() =>
      parseServerRuntimeConfig(
        {
          CASTLES_DEPLOYMENT_MODE: "cluster",
          PUBLIC_BASE_URL: "http://127.0.0.1:3000",
        },
        "/srv/castles"
      )
    ).toThrow(/CASTLES_DEPLOYMENT_MODE/);
  });

  it("rejects an invalid port before the server starts listening", () => {
    expect(() => parseServerRuntimeConfig({ PORT: "abc" }, "/srv/castles")).toThrow(
      /PORT/
    );
    expect(() => parseServerRuntimeConfig({ PORT: "70000" }, "/srv/castles")).toThrow(
      /PORT/
    );
  });

  it("allows an explicit bind host only as a host value", () => {
    expect(
      parseServerRuntimeConfig(
        { CASTLES_BIND_HOST: "0.0.0.0" },
        "/srv/castles"
      ).bindHost
    ).toBe("0.0.0.0");
    expect(
      parseServerRuntimeConfig(
        { CASTLES_BIND_HOST: "::1" },
        "/srv/castles"
      ).bindHost
    ).toBe("::1");

    expect(() =>
      parseServerRuntimeConfig(
        { CASTLES_BIND_HOST: "http://127.0.0.1:3000" },
        "/srv/castles"
      )
    ).toThrow(/CASTLES_BIND_HOST/);
    expect(() =>
      parseServerRuntimeConfig(
        { CASTLES_BIND_HOST: "127.0.0.1:3000" },
        "/srv/castles"
      )
    ).toThrow(/CASTLES_BIND_HOST/);
    expect(() =>
      parseServerRuntimeConfig(
        { CASTLES_BIND_HOST: "localhost:3000" },
        "/srv/castles"
      )
    ).toThrow(/CASTLES_BIND_HOST/);
    expect(() =>
      parseServerRuntimeConfig(
        { CASTLES_BIND_HOST: "[::1]" },
        "/srv/castles"
      )
    ).toThrow(/CASTLES_BIND_HOST/);
  });

  it("requires an explicit PUBLIC_BASE_URL in production", () => {
    expect(() =>
      parseServerRuntimeConfig({ NODE_ENV: "production", PORT: "3000" }, "/srv/castles")
    ).toThrow(/PUBLIC_BASE_URL/);
  });

  it("requires real build metadata in production", () => {
    expect(() =>
      parseServerRuntimeConfig(
        {
          NODE_ENV: "production",
          PORT: "3000",
          PUBLIC_BASE_URL: "https://castles.example",
          BUILD_ID: "manual",
          GIT_COMMIT: "replace-with-deployed-sha",
        },
        "/srv/castles"
      )
    ).toThrow(/BUILD_ID/);

    expect(() =>
      parseServerRuntimeConfig(
        {
          NODE_ENV: "production",
          PORT: "3000",
          PUBLIC_BASE_URL: "https://castles.example",
          BUILD_ID: "20260601-010203",
          GIT_COMMIT: "replace-with-deployed-sha",
        },
        "/srv/castles"
      )
    ).toThrow(/GIT_COMMIT/);
  });

  it("requires a full commit SHA in production", () => {
    expect(() =>
      parseServerRuntimeConfig(
        {
          NODE_ENV: "production",
          PORT: "3000",
          PUBLIC_BASE_URL: "https://castles.example",
          BUILD_ID: "20260601-010203",
          GIT_COMMIT: "feature-branch",
        },
        "/srv/castles"
      )
    ).toThrow(/GIT_COMMIT/);
  });

  it("rejects malformed public base URLs", () => {
    expect(() =>
      parseServerRuntimeConfig(
        { PUBLIC_BASE_URL: "ftp://castles.example" },
        "/srv/castles"
      )
    ).toThrow(/PUBLIC_BASE_URL/);
    expect(() =>
      parseServerRuntimeConfig(
        { PUBLIC_BASE_URL: "https://castles.example/play?room=1" },
        "/srv/castles"
      )
    ).toThrow(/PUBLIC_BASE_URL/);
  });

  it("rejects insecure non-loopback public URLs unless explicitly allowed", () => {
    expect(() =>
      parseServerRuntimeConfig(
        { PUBLIC_BASE_URL: "http://castles.example" },
        "/srv/castles"
      )
    ).toThrow(/HTTPS/);

    expect(
      parseServerRuntimeConfig(
        {
          PUBLIC_BASE_URL: "http://castles.example",
          CASTLES_ALLOW_INSECURE_PUBLIC_BASE_URL: "1",
        },
        "/srv/castles"
      ).publicBaseUrl
    ).toBe("http://castles.example");
  });

  it("allows loopback HTTP for local smoke tests", () => {
    expect(
      parseServerRuntimeConfig(
        { PUBLIC_BASE_URL: "http://127.0.0.1:4567" },
        "/srv/castles"
      ).publicBaseUrl
    ).toBe("http://127.0.0.1:4567");
  });

  it("requires a local shutdown token only when the endpoint is enabled", () => {
    expect(() =>
      parseServerRuntimeConfig(
        { CASTLES_ENABLE_LOCAL_SHUTDOWN: "1" },
        "/srv/castles"
      )
    ).toThrow(/CASTLES_LOCAL_SHUTDOWN_TOKEN/);

    expect(
      parseServerRuntimeConfig(
        {
          CASTLES_ENABLE_LOCAL_SHUTDOWN: "0",
          CASTLES_LOCAL_SHUTDOWN_TOKEN: "",
        },
        "/srv/castles"
      ).localShutdownEnabled
    ).toBe(false);
  });

  it("parses optional admin bearer tokens and rejects weak token shapes", () => {
    expect(
      parseServerRuntimeConfig(
        { CASTLES_ADMIN_BEARER_TOKEN: "  admin-token-with-enough-length  " },
        "/srv/castles"
      ).adminBearerToken
    ).toBe("admin-token-with-enough-length");

    expect(() =>
      parseServerRuntimeConfig(
        { CASTLES_ADMIN_BEARER_TOKEN: "short-secret" },
        "/srv/castles"
      )
    ).toThrow(/CASTLES_ADMIN_BEARER_TOKEN/);
    expect(() =>
      parseServerRuntimeConfig(
        { CASTLES_ADMIN_BEARER_TOKEN: "admin-token-with whitespace-123" },
        "/srv/castles"
      )
    ).toThrow(/CASTLES_ADMIN_BEARER_TOKEN/);
  });

  it("requires index.html when static assets are required", () => {
    const config = parseServerRuntimeConfig(
      {
        PUBLIC_BASE_URL: "http://127.0.0.1:3000",
        CASTLES_STATIC_DIR: "/srv/castles/build",
        CASTLES_REQUIRE_STATIC_DIR: "1",
      },
      "/srv/castles"
    );

    expect(() =>
      assertServerRuntimeFiles(config, (target) => target === "/srv/castles/build")
    ).toThrow(/index\.html/);
    expect(() =>
      assertServerRuntimeFiles(
        config,
        (target) => target === "/srv/castles/build" || target === "/srv/castles/build/index.html"
      )
    ).not.toThrow();
  });
});
