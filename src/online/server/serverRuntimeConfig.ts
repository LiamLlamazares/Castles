import path from "node:path";
import { existsSync } from "node:fs";

export interface ServerRuntimeConfig {
  port: number;
  publicBaseUrl: string;
  staticDir: string;
  requireStaticDir: boolean;
  localShutdownEnabled: boolean;
  localShutdownToken?: string;
  buildId?: string;
  commit?: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PLACEHOLDER_BUILD_IDS = new Set(["manual", "development", "replace-with-build-id"]);
const PLACEHOLDER_COMMITS = new Set([
  "local",
  "local-smoke",
  "unknown",
  "replace-with-deployed-sha",
]);

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function parseFlag(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "" || value === "0") return false;
  if (value === "1") return true;
  throw new Error(`${name} must be 1, 0, or unset.`);
}

function parsePort(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) return 3000;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function normalizePublicBaseUrl(env: NodeJS.ProcessEnv, port: number): string {
  const rawBaseUrl = env.PUBLIC_BASE_URL?.trim();
  if (env.NODE_ENV === "production" && !rawBaseUrl) {
    throw new Error("PUBLIC_BASE_URL is required when NODE_ENV=production.");
  }

  const candidate = rawBaseUrl || `http://localhost:${port}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be an absolute http or https URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PUBLIC_BASE_URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("PUBLIC_BASE_URL must not include credentials.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_BASE_URL must not include a path, query string, or hash.");
  }
  if (
    url.protocol === "http:" &&
    !isLoopbackHost(url.hostname) &&
    env.CASTLES_ALLOW_INSECURE_PUBLIC_BASE_URL !== "1"
  ) {
    throw new Error(
      "PUBLIC_BASE_URL must use HTTPS for non-loopback hosts, or set CASTLES_ALLOW_INSECURE_PUBLIC_BASE_URL=1 for a temporary HTTP test deployment."
    );
  }

  return url.toString().replace(/\/$/, "");
}

function requireProductionMetadata(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;

  const buildId = env.BUILD_ID?.trim();
  if (!buildId || PLACEHOLDER_BUILD_IDS.has(buildId)) {
    throw new Error("BUILD_ID must be set to a real deployment build id in production.");
  }

  const commit = env.GIT_COMMIT?.trim();
  if (!commit || PLACEHOLDER_COMMITS.has(commit)) {
    throw new Error("GIT_COMMIT must be set to the deployed commit SHA in production.");
  }
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error("GIT_COMMIT must be a full 40-character commit SHA in production.");
  }
}

export function parseServerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): ServerRuntimeConfig {
  const port = parsePort(env.PORT);
  const publicBaseUrl = normalizePublicBaseUrl(env, port);
  requireProductionMetadata(env);
  const staticDir = env.CASTLES_STATIC_DIR?.trim()
    ? env.CASTLES_STATIC_DIR.trim()
    : path.resolve(cwd, "build");
  if (!staticDir) {
    throw new Error("CASTLES_STATIC_DIR must not be empty.");
  }

  const requireStaticDir = parseFlag(env.CASTLES_REQUIRE_STATIC_DIR, "CASTLES_REQUIRE_STATIC_DIR");
  const localShutdownEnabled = parseFlag(
    env.CASTLES_ENABLE_LOCAL_SHUTDOWN,
    "CASTLES_ENABLE_LOCAL_SHUTDOWN"
  );
  const localShutdownToken = env.CASTLES_LOCAL_SHUTDOWN_TOKEN?.trim() || undefined;
  if (localShutdownEnabled && !localShutdownToken) {
    throw new Error(
      "CASTLES_LOCAL_SHUTDOWN_TOKEN is required when CASTLES_ENABLE_LOCAL_SHUTDOWN=1."
    );
  }

  return {
    port,
    publicBaseUrl,
    staticDir: normalizePath(staticDir),
    requireStaticDir,
    localShutdownEnabled,
    localShutdownToken,
    buildId: env.BUILD_ID?.trim() || undefined,
    commit: env.GIT_COMMIT?.trim() || undefined,
  };
}

export function assertServerRuntimeFiles(
  config: Pick<ServerRuntimeConfig, "staticDir" | "requireStaticDir">,
  exists: (target: string) => boolean = existsSync
): void {
  if (!config.requireStaticDir) return;

  if (!exists(config.staticDir)) {
    throw new Error(`Static build directory does not exist: ${config.staticDir}`);
  }

  const indexPath = normalizePath(path.join(config.staticDir, "index.html"));
  if (!exists(indexPath)) {
    throw new Error(`Static build index.html does not exist: ${indexPath}`);
  }
}
