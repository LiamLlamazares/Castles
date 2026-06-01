import path from "node:path";
import { existsSync } from "node:fs";
import type { Server as HttpServer } from "node:http";
import express from "express";
import type { WebSocketServer } from "ws";
import { createOnlineHttpServer } from "../src/online/server/createOnlineHttpServer";
import { createOnlineGameStoreFromEnv } from "../src/online/server/createOnlineGameStore";
import { formatOnlineServerLogEvent } from "../src/online/server/onlineServerLogging";
import {
  assertServerRuntimeFiles,
  parseServerRuntimeConfig,
} from "../src/online/server/serverRuntimeConfig";
import { OnlineGameService } from "../src/online/OnlineGameService";

function resolveOnce<T>(settle: (resolve: (value: T) => void, reject: (error: unknown) => void) => void): Promise<T> {
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

function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return resolveOnce<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      server.closeAllConnections?.();
      resolve();
    }, 5_000);

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

function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  return resolveOnce<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      for (const client of wss.clients) {
        client.terminate();
      }
      resolve();
    }, 5_000);

    for (const client of wss.clients) {
      client.close(1001, "Server shutting down");
    }

    wss.close(() => {
      clearTimeout(timeoutId);
      resolve();
    });
  });
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function main() {
  const config = parseServerRuntimeConfig(process.env, process.cwd());
  assertServerRuntimeFiles(config);
  const { backend: storeBackend, healthStorePath, store } = createOnlineGameStoreFromEnv(
    process.env
  );

  let startupComplete = false;
  try {
    const records = await store.load({
      onEventError: (line, error) => {
        console.error(`Invalid online event store entry ${line}`, error);
      },
    });
    await store.rebuildSummaries({
      onEventError: (line, error) => {
        console.error(`Invalid online event store entry ${line}`, error);
      },
    });
    const service = OnlineGameService.fromRecords(records);
    const { app, server, wss } = createOnlineHttpServer({
      publicBaseUrl: config.publicBaseUrl,
      service,
      onGameEvent: (event) => store.appendEvent(event),
      applyGameAction: (input) => store.applyGameAction(input),
      adjudicateGameTimeout: (input) => store.adjudicateGameTimeout(input),
      loadGameSummaries: () => store.loadSummaries(),
      onLog: (event) => {
        console.log(formatOnlineServerLogEvent(event));
      },
      health: {
        buildId: config.buildId,
        commit: config.commit,
        storePath: healthStorePath,
        storeBackend,
        checkStoreReady: () => store.checkReady(),
      },
    });

    let shutdownStarted = false;
    const shutdown = async (reason: string) => {
      if (shutdownStarted) return;
      shutdownStarted = true;

      console.log(`Received ${reason}; shutting down Castles online server.`);

      const results = await Promise.allSettled([
        closeWebSocketServer(wss),
        closeHttpServer(server),
      ]);
      const failedClose = results.find((result) => result.status === "rejected");
      if (failedClose?.status === "rejected") {
        console.error("Failed while closing network listeners", failedClose.reason);
        process.exitCode = 1;
      }

      try {
        await store.close();
      } catch (error) {
        console.error("Failed to close online game store", error);
        process.exitCode = 1;
      }
    };

    if (config.localShutdownEnabled && config.localShutdownToken) {
      app.post("/__local/shutdown", (req, res) => {
        if (!isLoopbackAddress(req.socket.remoteAddress)) {
          res.status(403).json({ error: "Local shutdown is only available from loopback." });
          return;
        }
        if (req.get("x-castles-local-shutdown-token") !== config.localShutdownToken) {
          res.status(403).json({ error: "Invalid local shutdown token." });
          return;
        }

        res.status(202).json({ ok: true });
        res.on("finish", () => {
          void shutdown("local shutdown request");
        });
      });
    }

    if (existsSync(config.staticDir)) {
      app.use(express.static(config.staticDir));
      app.use((req, res, next) => {
        if (req.method !== "GET" || req.path.startsWith("/api/")) {
          next();
          return;
        }
        res.sendFile(path.join(config.staticDir, "index.html"));
      });
    } else {
      console.warn(`Static build directory not found: ${config.staticDir}`);
    }

    server.listen(config.port, () => {
      console.log(`Castles online server listening on ${config.publicBaseUrl}`);
      console.log(`Persisting online games with ${storeBackend} store at ${healthStorePath}`);
    });

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
    startupComplete = true;
  } catch (error) {
    if (!startupComplete) {
      try {
        await store.close();
      } catch (closeError) {
        console.error("Failed to close online game store after startup failure", closeError);
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("Failed to start Castles online server", error);
  process.exitCode = 1;
});
