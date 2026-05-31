export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 200)}`);
  }
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
  assert(body.role === "spectator", "Spectator snapshot did not report spectator role");
  assert(
    body.snapshot?.version === expectedVersion,
    `Spectator snapshot returned version ${body.snapshot?.version}, expected ${expectedVersion}`
  );
  assertDefaultOnlineClock(body.snapshot, "Spectator snapshot");
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
  };
  const blackCastle = {
    hex: { q: 0, r: -3, s: 3, colorIndex: 0 },
    color: "b",
    turnsControlled: 0,
    usedThisTurn: false,
    owner: "b",
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
