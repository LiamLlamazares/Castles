import http from "node:http";
import express, { NextFunction, Request, Response } from "express";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { OnlineGameService } from "../OnlineGameService";
import type { AcceptedOnlineTimeoutRecord } from "../OnlineGameRoom";
import {
  createOnlineActionAcceptedEvent,
  createOnlineGameCreatedEvent,
  createOnlineTimeoutAdjudicatedEvent,
  OnlineGameEvent,
  ONLINE_EVENT_SCHEMA_VERSION,
  ONLINE_RULESET_VERSION,
} from "../events";
import {
  OnlineGameSummary,
  validateOnlineGameSummary,
} from "../readModel";
import { OnlineReject } from "../types";
import {
  OnlineClientMessage,
  validateClientMessage,
  validateOnlineGameId,
  validateOnlineGameSetup,
} from "../validation";
import type {
  OnlineGameStoreActionInput,
  OnlineGameStoreActionResult,
  OnlineGameStoreTimeoutInput,
  OnlineGameStoreTimeoutResult,
} from "./OnlineGameStore";

type OnlineConnection =
  | { role: "player"; gameId: string; token: string }
  | { role: "spectator"; gameId: string };

export type OnlineServerLogEvent = {
  event: string;
  status: "accepted" | "rejected" | "connected" | "disconnected" | "expired" | "failed";
  gameId?: string;
  role?: "player" | "spectator";
  action?: string;
  reason?: string;
};

const DEFAULT_ONLINE_TIME_CONTROL = { initial: 20, increment: 20 } as const;

export interface CreateOnlineHttpServerOptions {
  publicBaseUrl: string;
  service?: OnlineGameService;
  onGameEvent?: (event: OnlineGameEvent) => void | Promise<void>;
  applyGameAction?: (
    input: OnlineGameStoreActionInput
  ) => OnlineGameStoreActionResult | Promise<OnlineGameStoreActionResult>;
  adjudicateGameTimeout?: (
    input: OnlineGameStoreTimeoutInput
  ) => OnlineGameStoreTimeoutResult | Promise<OnlineGameStoreTimeoutResult>;
  loadGameSummaries?: () => OnlineGameSummary[] | Promise<OnlineGameSummary[]>;
  onLog?: (event: OnlineServerLogEvent) => void;
  now?: () => number;
  health?: {
    buildId?: string;
    commit?: string;
    storePath?: string;
    storeBackend?: string;
    checkStoreReady?: () => boolean | Promise<boolean>;
  };
}

class FixedWindowRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  take(key: string): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) {
      return false;
    }
    entry.count += 1;
    return true;
  }
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function sendSocketError(socket: WebSocket, error: OnlineReject): void {
  sendJson(socket, {
    type: "error",
    error,
  });
}

function parseMessage(data: RawData): unknown {
  const text = typeof data === "string" ? data : data.toString("utf8");
  return JSON.parse(text);
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function lastHeaderValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const values = raw?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  return values.at(-1) ?? null;
}

function getTrustedForwardedClient(headers: http.IncomingHttpHeaders, remoteAddress: string | undefined): string | null {
  if (!isLoopbackAddress(remoteAddress)) return null;
  return lastHeaderValue(headers["x-forwarded-for"]) ?? lastHeaderValue(headers["x-real-ip"]);
}

function getClientKey(req: Request): string {
  return getTrustedForwardedClient(req.headers, req.socket.remoteAddress) ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function getSocketClientKey(req: http.IncomingMessage): string {
  return getTrustedForwardedClient(req.headers, req.socket.remoteAddress) ?? req.socket.remoteAddress ?? "unknown";
}

function getBearerToken(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function setOnlineNoStoreHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.vary("Authorization");
}

function httpStatusForOnlineError(error: OnlineReject): number {
  switch (error.code) {
    case "bad_json":
    case "bad_request":
    case "unknown_message":
      return 400;
    case "unauthorized":
    case "not_found":
    case "not_joined":
      return 404;
    case "rate_limited":
      return 429;
    case "persistence_failed":
      return 503;
    default:
      return 409;
  }
}

function responseBodyWithOptionalSnapshot(
  error: OnlineReject,
  snapshot?: unknown
): { error: OnlineReject; snapshot?: unknown } {
  return snapshot ? { error, snapshot } : { error };
}

export function createOnlineHttpServer(options: CreateOnlineHttpServerOptions) {
  const app = express();
  app.set("trust proxy", "loopback");
  const service = options.service ?? new OnlineGameService({ now: options.now });
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
  const connections = new Map<WebSocket, OnlineConnection>();
  const disconnectedSockets = new WeakSet<WebSocket>();
  const actionQueues = new Map<string, Promise<void>>();
  const createGameLimiter = new FixedWindowRateLimiter(20, 60_000);
  const spectatorSnapshotLimiter = new FixedWindowRateLimiter(120, 10_000);
  const socketMessageLimiter = new FixedWindowRateLimiter(120, 10_000);

  const log = (event: OnlineServerLogEvent): void => {
    try {
      options.onLog?.(event);
    } catch (error) {
      console.error("Online server log hook failed", error);
    }
  };

  const logSocketDisconnect = (socket: WebSocket, reason?: string): void => {
    if (disconnectedSockets.has(socket)) return;
    disconnectedSockets.add(socket);
    const connection = connections.get(socket);
    log({
      event: "online.socket.disconnect",
      gameId: connection?.gameId,
      role: connection?.role,
      status: "disconnected",
      reason,
    });
    connections.delete(socket);
  };

  const enqueueGameAction = (gameId: string, operation: () => Promise<void>): Promise<void> => {
    const previous = actionQueues.get(gameId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const settled = next.catch(() => undefined);
    actionQueues.set(gameId, settled);
    settled.finally(() => {
      if (actionQueues.get(gameId) === settled) {
        actionQueues.delete(gameId);
      }
    });
    return next;
  };

  const persistActionAccepted = async (
    gameId: string,
    playerColor: Extract<OnlineGameEvent, { type: "action_accepted" }>["playerColor"],
    version: number,
    action: Extract<OnlineGameEvent, { type: "action_accepted" }>["action"],
    playedAt: number,
    clock?: Extract<OnlineGameEvent, { type: "action_accepted" }>["clock"]
  ) => {
    await options.onGameEvent?.(
      createOnlineActionAcceptedEvent({
        type: "action_accepted",
        gameId,
        playerColor,
        version,
        action,
        playedAt,
        clock,
      })
    );
  };

  const persistTimeoutAdjudicated = async (
    gameId: string,
    timeout: AcceptedOnlineTimeoutRecord
  ) => {
    await options.onGameEvent?.(
      createOnlineTimeoutAdjudicatedEvent({
        type: "timeout_adjudicated",
        gameId,
        playerColor: timeout.playerColor,
        version: timeout.version,
        adjudicatedAt: timeout.adjudicatedAt,
        result: timeout.result,
        clock: timeout.clock,
      })
    );
  };

  const adjudicateTimeoutForRoom = async (
    gameId: string,
    room: NonNullable<ReturnType<OnlineGameService["getRoom"]>>
  ):
    Promise<
      | { ok: true; timeout: AcceptedOnlineTimeoutRecord | null }
      | { ok: false; error: OnlineReject; snapshot?: ReturnType<typeof room.getSnapshot> }
    > => {
    if (options.adjudicateGameTimeout) {
      try {
        const transition = await options.adjudicateGameTimeout({
          gameId,
          now: options.now,
        });
        if (!transition.ok) {
          return {
            ok: false,
            error: transition.error,
            snapshot: transition.snapshot,
          };
        }
        if (transition.room) {
          service.replaceRoom(transition.room);
        }
        if (!transition.event) {
          return { ok: true, timeout: null };
        }
        log({
          event: "online.timeout",
          gameId,
          role: "player",
          status: "expired",
          reason: transition.event.playerColor,
        });
        return {
          ok: true,
          timeout: {
            playerColor: transition.event.playerColor,
            version: transition.event.version,
            adjudicatedAt: transition.event.adjudicatedAt,
            result: transition.event.result,
            clock: transition.event.clock,
          },
        };
      } catch (error) {
        log({
          event: "online.persistence",
          gameId,
          role: "player",
          status: "failed",
          reason: "timeout_adjudicated",
        });
        log({
          event: "online.timeout",
          gameId,
          role: "player",
          status: "rejected",
          reason: "persistence_failed",
        });
        console.error("Failed to persist online game timeout", error);
        return {
          ok: false,
          error: {
            code: "persistence_failed",
            message: "The timeout result could not be saved.",
          },
          snapshot: room.getSnapshot(),
        };
      }
    }

    const beforeTimeout = room.toRecord();
    const timeout = room.adjudicateTimeout();
    if (!timeout) {
      return { ok: true, timeout: null };
    }

    try {
      await persistTimeoutAdjudicated(gameId, timeout);
      log({
        event: "online.timeout",
        gameId,
        role: "player",
        status: "expired",
        reason: timeout.playerColor,
      });
      return { ok: true, timeout };
    } catch (error) {
      service.replaceRoom(beforeTimeout);
      const restoredSnapshot = service.getRoom(gameId)?.getSnapshot() ?? room.getSnapshot();
      log({
        event: "online.persistence",
        gameId,
        role: "player",
        status: "failed",
        reason: "timeout_adjudicated",
      });
      log({
        event: "online.timeout",
        gameId,
        role: "player",
        status: "rejected",
        reason: "persistence_failed",
      });
      console.error("Failed to persist online game timeout", error);
      return {
        ok: false,
        error: {
          code: "persistence_failed",
          message: "The timeout result could not be saved.",
        },
        snapshot: restoredSnapshot,
      };
    }
  };

  app.use((_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  app.use(express.json({ limit: "256kb" }));

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof SyntaxError) {
      res.status(400).json({
        error: {
          code: "bad_json",
          message: "Request body was not valid JSON.",
        },
      });
      return;
    }
    next(error);
  });

  app.get("/api/health", async (_req, res) => {
    let storeOk = true;
    let storeError: string | undefined;
    try {
      storeOk = options.health?.checkStoreReady
        ? await options.health.checkStoreReady()
        : true;
    } catch (error) {
      storeOk = false;
      storeError = error instanceof Error ? error.message : "Store readiness check failed.";
    }

    res.status(storeOk ? 200 : 503).json({
      ok: storeOk,
      build: {
        buildId: options.health?.buildId ?? "development",
        commit: options.health?.commit ?? "unknown",
      },
      online: {
        eventSchemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
        rulesetVersion: ONLINE_RULESET_VERSION,
        store: {
          ok: storeOk,
          backend: options.health?.storeBackend ?? "unknown",
          path: options.health?.storePath ?? null,
          error: storeError,
        },
      },
    });
  });

  app.use("/api/online", (_req, res, next) => {
    setOnlineNoStoreHeaders(res);
    next();
  });

  app.get("/api/online/games", async (_req, res) => {
    try {
      const summaries = await options.loadGameSummaries?.() ?? [];
      const games: OnlineGameSummary[] = [];
      for (const summary of summaries) {
        const validation = validateOnlineGameSummary(summary);
        if (!validation.ok) {
          throw new Error(validation.error.message);
        }
        if (validation.value.visibility === "public") {
          games.push(validation.value);
        }
      }

      res.json({ games });
      log({ event: "online.summary.list", status: "accepted" });
    } catch (error) {
      log({ event: "online.summary.list", status: "failed", reason: "summary_load_failed" });
      console.error("Failed to load online game summaries", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "Online game summaries could not be loaded.",
        },
      });
    }
  });

  app.post("/api/online/games", async (req, res) => {
    if (!createGameLimiter.take(getClientKey(req))) {
      log({ event: "online.game.create", status: "rejected", reason: "rate_limited" });
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many online games have been created from this client. Try again shortly.",
        },
      });
      return;
    }

    const setup = validateOnlineGameSetup(req.body?.setup);
    if (!setup.ok) {
      log({ event: "online.game.create", status: "rejected", reason: setup.error.code });
      res.status(400).json({
        error: setup.error,
      });
      return;
    }

    const normalizedSetup = setup.value.timeControl
      ? setup.value
      : {
          ...setup.value,
          timeControl: { ...DEFAULT_ONLINE_TIME_CONTROL },
        };

    const created = service.createGame(normalizedSetup, {
      publicBaseUrl: options.publicBaseUrl,
    });
    const room = service.getRoom(created.gameId);

    try {
      if (!room) {
        throw new Error(`Created online game ${created.gameId} is missing from service.`);
      }
      const record = room.toRecord();
      await options.onGameEvent?.(
        createOnlineGameCreatedEvent({
          type: "game_created",
          gameId: record.gameId,
          whiteToken: record.whiteToken,
          blackToken: record.blackToken,
          setup: record.setup,
          clock: record.clock,
        })
      );
    } catch (error) {
      service.deleteGame(created.gameId);
      log({
        event: "online.persistence",
        gameId: created.gameId,
        status: "failed",
        reason: "game_created",
      });
      log({
        event: "online.game.create",
        gameId: created.gameId,
        status: "rejected",
        reason: "persistence_failed",
      });
      console.error("Failed to persist online game creation", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "The online game could not be saved.",
        },
      });
      return;
    }

    log({ event: "online.game.create", gameId: created.gameId, status: "accepted" });
    res.status(201).json(created);
  });

  app.get("/api/online/games/:gameId", async (req, res) => {
    const gameId = validateOnlineGameId(req.params.gameId, "join.gameId");
    if (!gameId.ok) {
      log({ event: "online.http.join", role: "player", status: "rejected", reason: gameId.error.code });
      res.status(400).json({ error: gameId.error });
      return;
    }

    await enqueueGameAction(gameId.value, async () => {
      const token = getBearerToken(req.headers.authorization) ?? "";
      const room = service.getRoomForToken(gameId.value, token);
      if (!room) {
        log({
          event: "online.http.join",
          gameId: gameId.value,
          role: "player",
          status: "rejected",
          reason: "not_found",
        });
        res.status(404).json({
          error: {
            code: "not_found",
            message: "No online game was found for that id and token.",
          },
        });
        return;
      }

      const timeout = await adjudicateTimeoutForRoom(gameId.value, room);
      if (!timeout.ok) {
        log({
          event: "online.http.join",
          gameId: gameId.value,
          role: "player",
          status: "rejected",
          reason: timeout.error.code,
        });
        res
          .status(httpStatusForOnlineError(timeout.error))
          .json(responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot));
        return;
      }
      if (timeout.timeout) {
        broadcastSnapshot(gameId.value);
      }
      const currentRoom = service.getRoom(gameId.value) ?? room;

      const color = currentRoom.authenticate(token);
      if (!color) {
        log({
          event: "online.http.join",
          gameId: gameId.value,
          role: "player",
          status: "rejected",
          reason: "not_found",
        });
        res.status(404).json({
          error: {
            code: "not_found",
            message: "No online game was found for that id and token.",
          },
        });
        return;
      }

      res.json({
        color,
        snapshot: currentRoom.getSnapshot(),
      });
      log({
        event: "online.http.join",
        gameId: gameId.value,
        role: "player",
        status: "accepted",
      });
    });
  });

  app.get("/api/online/games/:gameId/spectator", async (req, res) => {
    const gameId = validateOnlineGameId(req.params.gameId, "spectator.gameId");
    if (!gameId.ok) {
      log({ event: "online.http.spectate", status: "rejected", reason: gameId.error.code });
      res.status(400).json({ error: gameId.error });
      return;
    }

    if (!spectatorSnapshotLimiter.take(getClientKey(req))) {
      log({
        event: "online.http.spectate",
        gameId: gameId.value,
        role: "spectator",
        status: "rejected",
        reason: "rate_limited",
      });
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many spectator snapshots have been requested from this client. Try again shortly.",
        },
      });
      return;
    }

    await enqueueGameAction(gameId.value, async () => {
      const room = service.getRoom(gameId.value);
      if (!room) {
        log({
          event: "online.http.spectate",
          gameId: gameId.value,
          role: "spectator",
          status: "rejected",
          reason: "not_found",
        });
        res.status(404).json({
          error: {
            code: "not_found",
            message: "No online game was found for that id.",
          },
        });
        return;
      }

      const timeout = await adjudicateTimeoutForRoom(gameId.value, room);
      if (!timeout.ok) {
        log({
          event: "online.http.spectate",
          gameId: gameId.value,
          role: "spectator",
          status: "rejected",
          reason: timeout.error.code,
        });
        res
          .status(httpStatusForOnlineError(timeout.error))
          .json(responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot));
        return;
      }
      if (timeout.timeout) {
        broadcastSnapshot(gameId.value);
      }
      const currentRoom = service.getRoom(gameId.value) ?? room;

      res.json({
        role: "spectator",
        snapshot: currentRoom.getSnapshot(),
      });
      log({
        event: "online.http.spectate",
        gameId: gameId.value,
        role: "spectator",
        status: "accepted",
      });
    });
  });

  const broadcastSnapshot = (gameId: string) => {
    const room = service.getRoom(gameId);
    if (!room) return;
    const snapshot = room.getSnapshot();
    for (const [socket, connection] of connections) {
      if (connection.gameId === gameId) {
        sendJson(socket, { type: "snapshot", snapshot });
      }
    }
  };

  const handleClientMessage = async (
    socket: WebSocket,
    data: RawData,
    clientKey: string
  ): Promise<void> => {
    if (!socketMessageLimiter.take(clientKey)) {
      log({ event: "online.socket.message", status: "rejected", reason: "rate_limited" });
      sendSocketError(socket, {
        code: "rate_limited",
        message: "Too many online messages were sent too quickly.",
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = parseMessage(data);
    } catch {
      log({ event: "online.socket.message", status: "rejected", reason: "bad_json" });
      sendSocketError(socket, {
        code: "bad_json",
        message: "Message was not valid JSON.",
      });
      return;
    }

    const validation = validateClientMessage(parsed);
    if (!validation.ok) {
      log({ event: "online.socket.message", status: "rejected", reason: validation.error.code });
      sendSocketError(socket, validation.error);
      return;
    }

    const message: OnlineClientMessage = validation.value;

    if (message.type === "ping") {
      const connection = connections.get(socket);
      if (!connection) {
        sendJson(socket, {
          type: "pong",
          clientTime: message.clientTime,
          serverTime: Date.now(),
        });
        return;
      }

      await enqueueGameAction(connection.gameId, async () => {
        const room =
          connection.role === "player"
            ? service.getRoomForToken(connection.gameId, connection.token)
            : service.getRoom(connection.gameId);
        if (!room) {
          sendSocketError(socket, {
            code: "not_found",
            message: "Online game no longer exists.",
          });
          return;
        }

        const timeout = await adjudicateTimeoutForRoom(connection.gameId, room);
        if (!timeout.ok) {
          sendJson(socket, {
            type: "error",
            ...responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot),
          });
          return;
        }
        if (timeout.timeout) {
          broadcastSnapshot(connection.gameId);
        }
        sendJson(socket, {
          type: "pong",
          clientTime: message.clientTime,
          serverTime: Date.now(),
        });
      });
      return;
    }

    if (message.type === "join") {
      await enqueueGameAction(message.gameId, async () => {
        const room = service.getRoomForToken(message.gameId, message.token);
        if (!room) {
          log({
            event: "online.socket.join",
            gameId: message.gameId,
            role: "player",
            status: "rejected",
            reason: "unauthorized",
          });
          sendSocketError(socket, {
            code: "unauthorized",
            message: "No online game was found for that id and token.",
          });
          return;
        }

        const timeout = await adjudicateTimeoutForRoom(message.gameId, room);
        if (!timeout.ok) {
          log({
            event: "online.socket.join",
            gameId: message.gameId,
            role: "player",
            status: "rejected",
            reason: timeout.error.code,
          });
          sendJson(socket, {
            type: "error",
            ...responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot),
          });
          return;
        }

        const currentRoom = service.getRoom(message.gameId) ?? room;
        const color = currentRoom.authenticate(message.token);
        if (!color) {
          log({
            event: "online.socket.join",
            gameId: message.gameId,
            role: "player",
            status: "rejected",
            reason: "unauthorized",
          });
          sendSocketError(socket, {
            code: "unauthorized",
            message: "No online game was found for that id and token.",
          });
          return;
        }

        connections.set(socket, { role: "player", gameId: message.gameId, token: message.token });
        log({
          event: "online.socket.join",
          gameId: message.gameId,
          role: "player",
          status: "accepted",
        });
        sendJson(socket, {
          type: "joined",
          color,
          snapshot: currentRoom.getSnapshot(),
        });
        if (timeout.timeout) {
          broadcastSnapshot(message.gameId);
        }
      });
      return;
    }

    if (message.type === "spectate") {
      await enqueueGameAction(message.gameId, async () => {
        const room = service.getRoom(message.gameId);
        if (!room) {
          log({
            event: "online.socket.spectate",
            gameId: message.gameId,
            role: "spectator",
            status: "rejected",
            reason: "not_found",
          });
          sendSocketError(socket, {
            code: "not_found",
            message: "No online game was found for that id.",
          });
          return;
        }

        const timeout = await adjudicateTimeoutForRoom(message.gameId, room);
        if (!timeout.ok) {
          log({
            event: "online.socket.spectate",
            gameId: message.gameId,
            role: "spectator",
            status: "rejected",
            reason: timeout.error.code,
          });
          sendJson(socket, {
            type: "error",
            ...responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot),
          });
          return;
        }

        connections.set(socket, { role: "spectator", gameId: message.gameId });
        log({
          event: "online.socket.spectate",
          gameId: message.gameId,
          role: "spectator",
          status: "accepted",
        });
        const currentRoom = service.getRoom(message.gameId) ?? room;
        sendJson(socket, {
          type: "spectating",
          snapshot: currentRoom.getSnapshot(),
        });
        if (timeout.timeout) {
          broadcastSnapshot(message.gameId);
        }
      });
      return;
    }

    if (message.type === "action") {
      const connection = connections.get(socket);
      if (!connection || connection.role !== "player") {
        log({
          event: "online.action",
          role: "player",
          action: message.action.type,
          status: "rejected",
          reason: "not_joined",
        });
        sendSocketError(socket, {
          code: "not_joined",
          message: "Join an online game before sending actions.",
        });
        return;
      }

      await enqueueGameAction(connection.gameId, async () => {
        const currentConnection = connections.get(socket);
        if (
          !currentConnection ||
          currentConnection.role !== "player" ||
          currentConnection.gameId !== connection.gameId ||
          currentConnection.token !== connection.token
        ) {
          log({
            event: "online.action",
            gameId: connection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "not_joined",
          });
          sendSocketError(socket, {
            code: "not_joined",
            message: "Join an online game before sending actions.",
          });
          return;
        }

        if (options.applyGameAction) {
          try {
            const transition = await options.applyGameAction({
              gameId: currentConnection.gameId,
              token: currentConnection.token,
              action: message.action,
              now: options.now,
            });
            if (transition.room) {
              service.replaceRoom(transition.room);
            }
            if (transition.event?.type === "timeout_adjudicated") {
              log({
                event: "online.timeout",
                gameId: currentConnection.gameId,
                role: "player",
                status: "expired",
                reason: transition.event.playerColor,
              });
            }
            if (!transition.ok) {
              log({
                event: "online.action",
                gameId: currentConnection.gameId,
                role: "player",
                action: message.action.type,
                status: "rejected",
                reason: transition.error.code,
              });
              if (
                transition.snapshot &&
                transition.error.code !== "not_found" &&
                transition.error.code !== "unauthorized"
              ) {
                sendJson(socket, {
                  type: "rejected",
                  error: transition.error,
                  snapshot: transition.snapshot,
                });
              } else {
                sendSocketError(socket, transition.error);
              }
              if (transition.event?.type === "timeout_adjudicated") {
                broadcastSnapshot(currentConnection.gameId);
              }
              return;
            }

            log({
              event: "online.action",
              gameId: currentConnection.gameId,
              role: "player",
              action: transition.event.action.type,
              status: "accepted",
            });
            broadcastSnapshot(currentConnection.gameId);
          } catch (error) {
            log({
              event: "online.persistence",
              gameId: currentConnection.gameId,
              role: "player",
              action: message.action.type,
              status: "failed",
              reason: "action_accepted",
            });
            log({
              event: "online.action",
              gameId: currentConnection.gameId,
              role: "player",
              action: message.action.type,
              status: "rejected",
              reason: "persistence_failed",
            });
            console.error("Failed to persist online game action", error);
            sendSocketError(socket, {
              code: "persistence_failed",
              message: "The accepted action could not be saved.",
            });
          }
          return;
        }

        const room = service.getRoomForToken(currentConnection.gameId, currentConnection.token);
        if (!room) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "not_found",
          });
          sendSocketError(socket, {
            code: "not_found",
            message: "Online game no longer exists.",
          });
          return;
        }

        const playerColor = room.authenticate(currentConnection.token);
        if (!playerColor) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "unauthorized",
          });
          sendSocketError(socket, {
            code: "unauthorized",
            message: "This player token is not valid.",
          });
          return;
        }

        const timeout = await adjudicateTimeoutForRoom(currentConnection.gameId, room);
        if (!timeout.ok) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: timeout.error.code,
          });
          sendJson(socket, {
            type: "error",
            ...responseBodyWithOptionalSnapshot(timeout.error, timeout.snapshot),
          });
          return;
        }
        if (timeout.timeout) {
          const snapshot = (service.getRoom(currentConnection.gameId) ?? room).getSnapshot();
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "game_over",
          });
          sendJson(socket, {
            type: "rejected",
            error: {
              code: "game_over",
              message: "This game is already over on time.",
            },
            snapshot,
          });
          broadcastSnapshot(currentConnection.gameId);
          return;
        }

        const beforeAction = room.toRecord();
        const result = room.submitAction(currentConnection.token, message.action);
        if (!result.ok) {
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: result.error.code,
          });
          sendJson(socket, {
            type: "rejected",
            error: result.error,
            snapshot: result.snapshot,
          });
          return;
        }

        const acceptedAction = room.toRecord().acceptedActions.at(-1);
        if (!acceptedAction || acceptedAction.version !== result.snapshot.version) {
          throw new Error(
            `Accepted online action for ${currentConnection.gameId} was not recorded.`
          );
        }
        if (result.snapshot.clock && !acceptedAction.clock) {
          throw new Error(
            `Accepted online action for ${currentConnection.gameId} is missing clock.`
          );
        }
        try {
          await persistActionAccepted(
            currentConnection.gameId,
            playerColor,
            result.snapshot.version,
            acceptedAction.action,
            acceptedAction.playedAt,
            acceptedAction.clock
          );
        } catch (error) {
          service.replaceRoom(beforeAction);
          const restoredSnapshot =
            service.getRoom(currentConnection.gameId)?.getSnapshot() ?? result.snapshot;
          log({
            event: "online.persistence",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "failed",
            reason: "action_accepted",
          });
          log({
            event: "online.action",
            gameId: currentConnection.gameId,
            role: "player",
            action: message.action.type,
            status: "rejected",
            reason: "persistence_failed",
          });
          console.error("Failed to persist online game action", error);
          sendJson(socket, {
            type: "error",
            error: {
              code: "persistence_failed",
              message: "The accepted action could not be saved.",
            },
            snapshot: restoredSnapshot,
          });
          return;
        }

        log({
          event: "online.action",
          gameId: currentConnection.gameId,
          role: "player",
          action: acceptedAction.action.type,
          status: "accepted",
        });
        broadcastSnapshot(currentConnection.gameId);
      });
      return;
    }
  };

  wss.on("connection", (socket, req) => {
    const clientKey = getSocketClientKey(req);
    log({ event: "online.socket.connect", status: "connected" });

    socket.on("message", (data) => {
      handleClientMessage(socket, data, clientKey).catch((error) => {
        console.error("Unhandled online socket message error", error);
        sendSocketError(socket, {
          code: "bad_request",
          message: "The online message could not be processed.",
        });
      });
    });

    socket.on("close", () => {
      logSocketDisconnect(socket);
    });

    socket.on("error", () => {
      logSocketDisconnect(socket, "socket_error");
    });
  });

  return {
    app,
    server,
    service,
    wss,
  };
}
