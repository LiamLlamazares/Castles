import http from "node:http";
import express, { NextFunction, Request, Response } from "express";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { OnlineGameRoomRecord } from "../OnlineGameRoom";
import { OnlineGameService } from "../OnlineGameService";
import { OnlineReject } from "../types";
import {
  OnlineClientMessage,
  validateClientMessage,
  validateOnlineGameSetup,
} from "../validation";

interface OnlineConnection {
  gameId: string;
  token: string;
}

export interface CreateOnlineHttpServerOptions {
  publicBaseUrl: string;
  service?: OnlineGameService;
  onRoomsChanged?: (records: OnlineGameRoomRecord[]) => void | Promise<void>;
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

function getClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function getBearerToken(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function createOnlineHttpServer(options: CreateOnlineHttpServerOptions) {
  const app = express();
  const service = options.service ?? new OnlineGameService();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });
  const connections = new Map<WebSocket, OnlineConnection>();
  const createGameLimiter = new FixedWindowRateLimiter(20, 60_000);
  const socketMessageLimiter = new FixedWindowRateLimiter(120, 10_000);

  const persistRooms = async () => {
    await options.onRoomsChanged?.(service.toRecords());
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

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/online/games", async (req, res) => {
    if (!createGameLimiter.take(getClientKey(req))) {
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
      res.status(400).json({
        error: setup.error,
      });
      return;
    }

    const created = service.createGame(setup.value, {
      publicBaseUrl: options.publicBaseUrl,
    });

    try {
      await persistRooms();
    } catch (error) {
      service.deleteGame(created.gameId);
      console.error("Failed to persist online game rooms", error);
      res.status(503).json({
        error: {
          code: "persistence_failed",
          message: "The online game could not be saved.",
        },
      });
      return;
    }

    res.status(201).json(created);
  });

  app.get("/api/online/games/:gameId", (req, res) => {
    const token = getBearerToken(req.headers.authorization) ?? String(req.query.token ?? "");
    const room = service.getRoomForToken(req.params.gameId, token);
    if (!room) {
      res.status(404).json({
        error: {
          code: "not_found",
          message: "No online game was found for that id and token.",
        },
      });
      return;
    }

    res.json({
      color: room.authenticate(token),
      snapshot: room.getSnapshot(),
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
      sendSocketError(socket, {
        code: "bad_json",
        message: "Message was not valid JSON.",
      });
      return;
    }

    const validation = validateClientMessage(parsed);
    if (!validation.ok) {
      sendSocketError(socket, validation.error);
      return;
    }

    const message: OnlineClientMessage = validation.value;

    if (message.type === "ping") {
      sendJson(socket, {
        type: "pong",
        clientTime: message.clientTime,
        serverTime: Date.now(),
      });
      return;
    }

    if (message.type === "join") {
      const room = service.getRoomForToken(message.gameId, message.token);
      if (!room) {
        sendSocketError(socket, {
          code: "unauthorized",
          message: "No online game was found for that id and token.",
        });
        return;
      }

      connections.set(socket, { gameId: message.gameId, token: message.token });
      sendJson(socket, {
        type: "joined",
        color: room.authenticate(message.token),
        snapshot: room.getSnapshot(),
      });
      return;
    }

    if (message.type === "action") {
      const connection = connections.get(socket);
      if (!connection) {
        sendSocketError(socket, {
          code: "not_joined",
          message: "Join an online game before sending actions.",
        });
        return;
      }

      const room = service.getRoomForToken(connection.gameId, connection.token);
      if (!room) {
        sendSocketError(socket, {
          code: "not_found",
          message: "Online game no longer exists.",
        });
        return;
      }

      const beforeAction = room.toRecord();
      const result = room.submitAction(connection.token, message.action);
      if (!result.ok) {
        sendJson(socket, {
          type: "rejected",
          error: result.error,
          snapshot: result.snapshot,
        });
        return;
      }

      try {
        await persistRooms();
      } catch (error) {
        service.replaceRoom(beforeAction);
        const restoredSnapshot =
          service.getRoom(connection.gameId)?.getSnapshot() ?? result.snapshot;
        console.error("Failed to persist online game rooms", error);
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

      broadcastSnapshot(connection.gameId);
      return;
    }
  };

  wss.on("connection", (socket, req) => {
    const clientKey = req.socket.remoteAddress ?? "unknown";

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
      connections.delete(socket);
    });

    socket.on("error", () => {
      connections.delete(socket);
    });
  });

  return {
    app,
    server,
    service,
    wss,
  };
}
