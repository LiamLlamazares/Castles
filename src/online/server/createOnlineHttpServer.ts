import http from "node:http";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { OnlineGameRoomRecord } from "../OnlineGameRoom";
import { OnlineGameService } from "../OnlineGameService";
import { OnlineActionDTO, OnlineGameSetupDTO } from "../types";

interface OnlineConnection {
  gameId: string;
  token: string;
}

export interface CreateOnlineHttpServerOptions {
  publicBaseUrl: string;
  service?: OnlineGameService;
  onRoomsChanged?: (records: OnlineGameRoomRecord[]) => void | Promise<void>;
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function parseMessage(data: RawData): unknown {
  const text = typeof data === "string" ? data : data.toString("utf8");
  return JSON.parse(text);
}

function isOnlineSetupDTO(value: unknown): value is OnlineGameSetupDTO {
  if (!value || typeof value !== "object") return false;
  const setup = value as Partial<OnlineGameSetupDTO>;
  return !!setup.board && Array.isArray(setup.pieces) && Array.isArray(setup.sanctuaries);
}

export function createOnlineHttpServer(options: CreateOnlineHttpServerOptions) {
  const app = express();
  const service = options.service ?? new OnlineGameService();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  const connections = new Map<WebSocket, OnlineConnection>();

  const persistRooms = () => {
    Promise.resolve(options.onRoomsChanged?.(service.toRecords())).catch((error) => {
      console.error("Failed to persist online game rooms", error);
    });
  };

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/online/games", (req, res) => {
    if (!isOnlineSetupDTO(req.body?.setup)) {
      res.status(400).json({
        error: {
          code: "bad_request",
          message: "Request body must include a valid online game setup.",
        },
      });
      return;
    }

    const created = service.createGame(req.body.setup, {
      publicBaseUrl: options.publicBaseUrl,
    });
    persistRooms();
    res.status(201).json(created);
  });

  app.get("/api/online/games/:gameId", (req, res) => {
    const token = String(req.query.token ?? "");
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

  wss.on("connection", (socket) => {
    socket.on("message", (data) => {
      let message: any;
      try {
        message = parseMessage(data);
      } catch {
        sendJson(socket, {
          type: "error",
          error: { code: "bad_json", message: "Message was not valid JSON." },
        });
        return;
      }

      if (message?.type === "join") {
        const gameId = String(message.gameId ?? "");
        const token = String(message.token ?? "");
        const room = service.getRoomForToken(gameId, token);
        if (!room) {
          sendJson(socket, {
            type: "error",
            error: {
              code: "unauthorized",
              message: "No online game was found for that id and token.",
            },
          });
          return;
        }

        connections.set(socket, { gameId, token });
        sendJson(socket, {
          type: "joined",
          color: room.authenticate(token),
          snapshot: room.getSnapshot(),
        });
        return;
      }

      if (message?.type === "action") {
        const connection = connections.get(socket);
        if (!connection) {
          sendJson(socket, {
            type: "error",
            error: {
              code: "not_joined",
              message: "Join an online game before sending actions.",
            },
          });
          return;
        }

        const action = message.action as OnlineActionDTO;
        const room = service.getRoomForToken(connection.gameId, connection.token);
        if (!room) {
          sendJson(socket, {
            type: "error",
            error: {
              code: "not_found",
              message: "Online game no longer exists.",
            },
          });
          return;
        }

        const result = room.submitAction(connection.token, action);
        if (!result.ok) {
          sendJson(socket, {
            type: "rejected",
            error: result.error,
            snapshot: result.snapshot,
          });
          return;
        }

        persistRooms();
        broadcastSnapshot(connection.gameId);
        return;
      }

      sendJson(socket, {
        type: "error",
        error: { code: "unknown_message", message: "Unknown online message type." },
      });
    });

    socket.on("close", () => {
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
