export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export const ONLINE_PROTOCOL_VERSION = 1;
const DEFAULT_PRODUCTION_BASE_URL = "https://castles.ls314.xyz";

function firstNonEmpty(...values) {
  const match = values.find((value) => String(value ?? "").trim() !== "");
  return match === undefined ? undefined : String(match).trim();
}

export function resolveOnlineSmokeCliOptions(argv = [], env = process.env) {
  return {
    baseUrl: firstNonEmpty(argv[0], env.BASE_URL, DEFAULT_PRODUCTION_BASE_URL).replace(/\/$/, ""),
    expectedCommit: firstNonEmpty(argv[1], env.EXPECTED_COMMIT),
  };
}

export async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 200)}`);
  }
}

export function assertProtocolVersionedBody(body, description = "Response body") {
  assert(
    body?.protocolVersion === ONLINE_PROTOCOL_VERSION,
    `${description} did not report protocolVersion ${ONLINE_PROTOCOL_VERSION}`
  );
}

const INTERNAL_RUNTIME_NODE_HEALTH_KEYS = new Set([
  "nodeId",
  "runtimeNodeId",
  "runtimeNode",
  "nodeState",
  "persistedNode",
  "online_runtime_nodes",
]);

function assertNoInternalRuntimeNodeHealth(value, path = "health") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const isRuntimeStatusPath = path.startsWith("health.online.runtime");
    if (INTERNAL_RUNTIME_NODE_HEALTH_KEYS.has(key) || (isRuntimeStatusPath && key === "node")) {
      throw new Error(`Public health exposed internal runtime-node state at ${path}.${key}`);
    }
    assertNoInternalRuntimeNodeHealth(nested, `${path}.${key}`);
  }
}

export function assertProductionRuntimeHealthReady(healthBody) {
  assertNoInternalRuntimeNodeHealth(healthBody);

  const runtime = healthBody?.online?.runtime;
  assert(runtime && typeof runtime === "object", "Production health runtime health was missing");
  assert(runtime.readiness?.ok === true, "Production runtime readiness was not ok");
  assert(
    runtime.eventPolling?.ready === true,
    "Production runtime event polling was not ready"
  );
  assert(
    runtime.nodeHeartbeat?.ready === true,
    "Production runtime-node heartbeat was not ready"
  );
}

export function versionedSocketMessage(message) {
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    ...message,
  };
}

export function createFetchWithTimeout(requestTimeoutMs) {
  return async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Timed out fetching ${url} after ${requestTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

export async function assertSpectatorSnapshot(
  fetchWithTimeout,
  baseUrl,
  gameId,
  expectedVersion
) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/games/${encodeURIComponent(gameId)}/spectator`
  );
  const body = await readJson(response);
  assert(response.status === 200, `Spectator snapshot fetch failed with ${response.status}`);
  assertProtocolVersionedBody(body, "Spectator snapshot response");
  assert(body.role === "spectator", "Spectator snapshot did not report spectator role");
  assert(
    body.snapshot?.version === expectedVersion,
    `Spectator snapshot returned version ${body.snapshot?.version}, expected ${expectedVersion}`
  );
  assertDefaultOnlineClock(body.snapshot, "Spectator snapshot");
}

export async function assertGoogleOAuthSmoke(fetchWithTimeout, baseUrl) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const smokeReturnTo = "/?onlineGame=game_return&seat=w&view=spectator";
  const providersResponse = await fetchWithTimeout(
    `${normalizedBaseUrl}/api/online/account/oauth/providers`
  );
  const providersBody = await readJson(providersResponse);
  assert(
    providersResponse.status === 200,
    `OAuth providers fetch failed with ${providersResponse.status}`
  );
  assertProtocolVersionedBody(providersBody, "OAuth providers response");
  assert(Array.isArray(providersBody.providers), "OAuth providers response did not include providers");

  const googleProvider = providersBody.providers.find((provider) => provider?.provider === "google");
  assert(googleProvider?.enabled === true, "Google OAuth provider was not enabled");
  assert(
    googleProvider.startUrl === "/api/online/account/oauth/google/start",
    "Google OAuth provider did not expose the expected start URL"
  );

  const startUrl = new URL(`${normalizedBaseUrl}${googleProvider.startUrl}`);
  startUrl.searchParams.set("returnTo", smokeReturnTo);
  const startResponse = await fetchWithTimeout(startUrl.toString(), { redirect: "manual" });
  assert(
    startResponse.status >= 300 && startResponse.status < 400,
    `Google OAuth start did not redirect; got ${startResponse.status}`
  );
  const location = startResponse.headers.get("location");
  assert(location, "Google OAuth start did not include a Location header");

  const redirect = new URL(location);
  assert(redirect.origin === "https://accounts.google.com", "Google OAuth start did not redirect to Google");
  assert(redirect.pathname === "/o/oauth2/v2/auth", "Google OAuth start used an unexpected Google path");
  assert(redirect.searchParams.get("response_type") === "code", "Google OAuth response_type was not code");
  assert(redirect.searchParams.get("client_id"), "Google OAuth client_id was missing");
  assertGoogleOAuthStateReturnTo(redirect.searchParams.get("state"), smokeReturnTo);
  const scopes = new Set((redirect.searchParams.get("scope") ?? "").split(/\s+/).filter(Boolean));
  for (const scope of ["openid", "email", "profile"]) {
    assert(scopes.has(scope), `Google OAuth scope ${scope} was missing`);
  }
  assert(
    redirect.searchParams.get("redirect_uri") ===
      `${normalizedBaseUrl}/api/online/account/oauth/google/callback`,
    "Google OAuth redirect_uri did not match production callback"
  );
}

function assertGoogleOAuthStateReturnTo(state, expectedReturnTo) {
  assert(state, "Google OAuth state was missing");
  const [encodedPayload, signature, extra] = state.split(".");
  assert(encodedPayload && signature && extra === undefined, "Google OAuth state had an unexpected shape");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Google OAuth state payload was not valid JSON");
  }
  assert(
    payload?.returnTo === expectedReturnTo,
    `Google OAuth state returnTo was ${payload?.returnTo ?? "<missing>"}, expected ${expectedReturnTo}`
  );
}

export function assertDefaultOnlineClock(snapshot, description = "Snapshot") {
  assert(snapshot?.setup?.timeControl?.initial === 20, `${description} did not use 20 minute initial time`);
  assert(snapshot?.setup?.timeControl?.increment === 20, `${description} did not use 20 second increment`);
  assert(
    snapshot?.clock?.timeControl?.initialMs === 1_200_000,
    `${description} did not include the default initial clock`
  );
  assert(
    snapshot?.clock?.timeControl?.incrementMs === 20_000,
    `${description} did not include the default increment clock`
  );
  assert(
    typeof snapshot.clock.remainingMs?.w === "number" &&
      typeof snapshot.clock.remainingMs?.b === "number",
    `${description} did not include both remaining clock values`
  );
}

export function createWebSocketWaiters(socketTimeoutMs) {
  function waitForSocketOpen(socket) {
    if (socket.readyState === 1) return Promise.resolve();

    return new Promise((resolveMessage, rejectMessage) => {
      const timeout = setTimeout(() => {
        cleanup();
        rejectMessage(new Error(`Timed out opening WebSocket after ${socketTimeoutMs}ms`));
      }, socketTimeoutMs);
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off("open", onOpen);
        socket.off("error", onError);
        socket.off("close", onClose);
      };
      const onOpen = () => {
        cleanup();
        resolveMessage();
      };
      const onError = (error) => {
        cleanup();
        rejectMessage(error);
      };
      const onClose = () => {
        cleanup();
        rejectMessage(new Error("WebSocket closed before opening"));
      };

      socket.once("open", onOpen);
      socket.once("error", onError);
      socket.once("close", onClose);
    });
  }

  function nextSocketMessage(socket, description = "WebSocket message") {
    return new Promise((resolveMessage, rejectMessage) => {
      const timeout = setTimeout(() => {
        cleanup();
        rejectMessage(new Error(`Timed out waiting for ${description} after ${socketTimeoutMs}ms`));
      }, socketTimeoutMs);
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off("message", onMessage);
        socket.off("error", onError);
        socket.off("close", onClose);
      };
      const onMessage = (data) => {
        cleanup();
        try {
          resolveMessage(JSON.parse(data.toString("utf8")));
        } catch (error) {
          rejectMessage(error);
        }
      };
      const onError = (error) => {
        cleanup();
        rejectMessage(error);
      };
      const onClose = () => {
        cleanup();
        rejectMessage(new Error(`WebSocket closed before ${description}`));
      };

      socket.once("message", onMessage);
      socket.once("error", onError);
      socket.once("close", onClose);
    });
  }

  return { waitForSocketOpen, nextSocketMessage };
}

export function buildWebSocketUrl(baseUrl) {
  return baseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:") + "/ws";
}

export function makeSmokeSetup() {
  const whiteCastle = {
    hex: { q: 0, r: 3, s: -3, colorIndex: 0 },
    color: "w",
    turnsControlled: 0,
    usedThisTurn: false,
    owner: "w",
    recruitmentCooldown: 0,
  };
  const blackCastle = {
    hex: { q: 0, r: -3, s: 3, colorIndex: 0 },
    color: "b",
    turnsControlled: 0,
    usedThisTurn: false,
    owner: "b",
    recruitmentCooldown: 0,
  };
  const piece = (color, q, r, s) => ({
    hex: { q, r, s, colorIndex: 0 },
    color,
    type: "Monarch",
    canMove: true,
    canAttack: true,
    damage: 0,
    abilityUsed: false,
    souls: 0,
    isRevived: false,
  });

  return {
    board: {
      config: { nSquares: 3, hasHighGround: false },
      castles: [whiteCastle, blackCastle],
    },
    pieces: [piece("w", 0, 1, -1), piece("b", 0, -1, 1)],
    sanctuaries: [],
    sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
    gameRules: { vpModeEnabled: false },
    initialPoolTypes: [],
    pieceTheme: "Castles",
  };
}
