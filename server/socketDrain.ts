import type { Server as HttpServer } from "node:http";
import WebSocket, { type WebSocketServer } from "ws";
import { ONLINE_PROTOCOL_VERSION } from "../src/online/protocolVersion";
import type { OnlineReject } from "../src/online/types";

export const DRAIN_SOCKET_ERROR: OnlineReject = {
  code: "service_unavailable",
  message: "This node is draining for a deploy. Reconnect shortly.",
};

function resolveOnce<T>(
  settle: (resolve: (value: T) => void, reject: (error: unknown) => void) => void
): Promise<T> {
  let settled = false;
  return new Promise<T>((resolve, reject) => {
    settle(
      (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      }
    );
  });
}

function sendDrainError(socket: WebSocket): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: "error",
      error: DRAIN_SOCKET_ERROR,
    })
  );
}

export function closeHttpServer(
  server: HttpServer,
  options: { timeoutMs: number }
): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return resolveOnce<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      server.closeAllConnections?.();
      resolve();
    }, options.timeoutMs);

    server.close((error) => {
      clearTimeout(timeoutId);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function closeWebSocketServerAfterDrain(
  wss: WebSocketServer,
  options: { drainGraceMs: number; closeTimeoutMs: number }
): Promise<void> {
  return resolveOnce<void>((resolve) => {
    setTimeout(() => {
      const closeTimeoutId = setTimeout(() => {
        for (const client of wss.clients) {
          if (client.readyState !== WebSocket.CLOSED) {
            client.terminate();
          }
        }
        resolve();
      }, options.closeTimeoutMs);

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          sendDrainError(client);
          client.close(1001, "Server draining for deploy");
        }
      }

      wss.close(() => {
        clearTimeout(closeTimeoutId);
        resolve();
      });
    }, options.drainGraceMs);
  });
}
