import path from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import { createOnlineHttpServer } from "../src/online/server/createOnlineHttpServer";
import { createOnlineGameStoreFromEnv } from "../src/online/server/createOnlineGameStore";
import { formatOnlineServerLogEvent } from "../src/online/server/onlineServerLogging";
import type { OnlineRuntimeCoordinator } from "../src/online/server/onlineRuntimeCoordinator";
import {
  assertServerRuntimeFiles,
  parseServerRuntimeConfig,
} from "../src/online/server/serverRuntimeConfig";
import { createConfiguredRuntimeCoordinator } from "./runtimeCoordinator";
import { OnlineGameService } from "../src/online/OnlineGameService";
import {
  hashOnlineToken,
  verifyOnlineToken,
} from "../src/online/server/onlineTokenCredentials";
import {
  runOnlineRuntimeTableCleanup,
  runOnlineStartupMaintenance,
} from "./startupMaintenance";
import {
  startRuntimeEventPolling,
  type RuntimeEventPoller,
} from "./runtimeEventPolling";
import {
  startRuntimeNodeHeartbeat,
  type RuntimeNodeHeartbeat,
} from "./runtimeNodeHeartbeat";
import { closeHttpServer, closeWebSocketServerAfterDrain } from "./socketDrain";

const RUNTIME_EVENT_POLL_INTERVAL_MS = 1_000;
const RUNTIME_EVENT_POLL_MAX_BACKOFF_MS = 15_000;
const RUNTIME_EVENT_POLL_LIMIT = 100;
const RUNTIME_EVENT_POLL_FAILURE_READINESS_THRESHOLD = 3;
const RUNTIME_NODE_HEARTBEAT_INTERVAL_MS = 5_000;
const RUNTIME_NODE_HEARTBEAT_MAX_BACKOFF_MS = 30_000;
const RUNTIME_NODE_HEARTBEAT_FAILURE_READINESS_THRESHOLD = 3;
const HTTP_SHUTDOWN_TIMEOUT_MS = 5_000;
const WEBSOCKET_DRAIN_GRACE_MS = 30_000;
const WEBSOCKET_CLOSE_TIMEOUT_MS = 5_000;

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function main() {
  const config = parseServerRuntimeConfig(process.env, process.cwd());
  assertServerRuntimeFiles(config);
  const {
    backend: storeBackend,
    healthStorePath,
    store,
    accountStore,
    spectatorPresenceStore,
    runtimeEventStore,
    operationGateStore,
    rateLimitStore,
    startupMaintenanceStore,
    runtimeNodeStore,
  } = createOnlineGameStoreFromEnv(process.env, { runtimeNodeId: config.runtimeNodeId });

  let startupComplete = false;
  let runtimeCoordinator: OnlineRuntimeCoordinator | undefined;
  let runtimeEventPoller: RuntimeEventPoller | undefined;
  let runtimeNodeHeartbeat: RuntimeNodeHeartbeat | undefined;
  try {
    const records = await store.load({
      onEventError: (line, error) => {
        console.error(`Invalid online event store entry ${line}`, error);
      },
    });
    await runtimeNodeStore.recordNodeStarted();
    runtimeCoordinator = createConfiguredRuntimeCoordinator(config, {
      runtimeNodeStore,
      spectatorPresenceStore,
      runtimeEventStore,
      operationGateStore,
      rateLimitStore,
      startupMaintenanceStore,
    });
    await runOnlineStartupMaintenance({
      config,
      runtimeCoordinator,
      store,
      onGameEventError: (line, error) => {
        console.error(`Invalid online event store entry ${line}`, error);
      },
      onChallengeEventError: (line, error) => {
        console.error(`Invalid online challenge event store entry ${line}`, error);
      },
      onOpenSeekEventError: (line, error) => {
        console.error(`Invalid online seek event store entry ${line}`, error);
      },
    });
    await runOnlineRuntimeTableCleanup({
      config,
      runtimeCoordinator,
      stores: {
        spectatorPresenceStore,
        runtimeEventStore,
        operationGateStore,
        rateLimitStore,
      },
    });
    const service = OnlineGameService.fromRecords(records, {
      credentialFactory: hashOnlineToken,
      verifyToken: verifyOnlineToken,
    });
    const { app, server, wss } = createOnlineHttpServer({
      publicBaseUrl: config.publicBaseUrl,
      service,
      runtimeCoordinator,
      onGameCreated: (event, credentials) => store.appendGameCreated(event, credentials),
      onGameEvent: (event) => {
        if (event.type === "game_created") {
          throw new Error("game_created events must be persisted through onGameCreated.");
        }
        if (event.type === "visibility_changed") {
          throw new Error(
            "visibility_changed events must be persisted through appendGameVisibilityChanged."
          );
        }
        return store.appendEvent(event);
      },
      appendGameVisibilityChanged: (event) => store.appendGameVisibilityChanged(event),
      appendGameSeatCredential: (gameId, seat, credential) =>
        store.appendGameSeatCredential(gameId, seat, credential),
      appendChallengeCreated: (event, credentials) =>
        store.appendChallengeCreated(event, credentials),
      appendChallengeEvent: (event) => store.appendChallengeEvent(event),
      loadChallengeSummaries: () => store.loadChallengeSummaries(),
      resolveChallengeCredential: (challengeId, token) =>
        store.resolveChallengeCredential(challengeId, token),
      acceptChallengeAndCreateGame: (input) =>
        store.acceptChallengeAndCreateGame(input),
      appendOpenSeekCreated: (event, credentials) =>
        store.appendOpenSeekCreated(event, credentials),
      appendOpenSeekEvent: (event) => store.appendOpenSeekEvent(event),
      loadOpenSeekSummaries: () => store.loadOpenSeekSummaries(),
      listOpenSeekSummaries: (options) => store.listOpenSeekSummaries(options),
      resolveOpenSeekCredential: (seekId, token) =>
        store.resolveOpenSeekCredential(seekId, token),
      acceptOpenSeekAndCreateGame: (input) =>
        store.acceptOpenSeekAndCreateGame(input),
      applyGameAction: (input) => store.applyGameAction(input),
      adjudicateGameTimeout: (input) => store.adjudicateGameTimeout(input),
      loadGameSummaries: () => store.loadSummaries(),
      listGameSummaries: (options) => store.listGameSummaries(options),
      listPersonalGameSummaries: (options) => store.listPersonalGameSummaries(options),
      listAccountRatingHistory: (accountId, limit) => store.listAccountRatingHistory(accountId, limit),
      loadGameSummary: (gameId) => store.loadGameSummary(gameId),
      loadGameRoomRecord: (gameId) => store.loadGameRoomRecord(gameId),
      accountStore,
      adminBearerToken: config.adminBearerToken,
      oauth: config.googleOAuth
        ? {
            google: config.googleOAuth,
          }
        : undefined,
      onLog: (event) => {
        console.log(formatOnlineServerLogEvent(event));
      },
      health: {
        buildId: config.buildId,
        commit: config.commit,
        deployment: config.deployment,
        storePath: healthStorePath,
        storeBackend,
        checkRuntimeReady: async () => {
          const eventPollingReady = runtimeEventPoller?.getStatus().ready ?? true;
          const nodeHeartbeatReady = runtimeNodeHeartbeat?.getStatus().ready ?? true;
          return eventPollingReady && nodeHeartbeatReady;
        },
        getRuntimeEventPollingStatus: () => runtimeEventPoller?.getStatus(),
        getRuntimeNodeHeartbeatStatus: () => runtimeNodeHeartbeat?.getStatus(),
        checkStoreReady: async () => {
          const gameStoreReady = await store.checkReady();
          const accountStoreReady = accountStore.checkReady
            ? await accountStore.checkReady()
            : true;
          return gameStoreReady && accountStoreReady;
        },
      },
    });

    runtimeNodeHeartbeat = startRuntimeNodeHeartbeat({
      runtimeNodeStore,
      intervalMs: RUNTIME_NODE_HEARTBEAT_INTERVAL_MS,
      maxBackoffMs: RUNTIME_NODE_HEARTBEAT_MAX_BACKOFF_MS,
      failureReadinessThreshold: RUNTIME_NODE_HEARTBEAT_FAILURE_READINESS_THRESHOLD,
      onError: (_error, status) => {
        console.log(
          formatOnlineServerLogEvent({
            event: "online.runtime.node_heartbeat",
            status: "failed",
            reason: status.lastError ?? "Runtime node heartbeat failed.",
          })
        );
      },
    });

    runtimeEventPoller = startRuntimeEventPolling({
      runtimeCoordinator,
      intervalMs: RUNTIME_EVENT_POLL_INTERVAL_MS,
      maxBackoffMs: RUNTIME_EVENT_POLL_MAX_BACKOFF_MS,
      pollLimit: RUNTIME_EVENT_POLL_LIMIT,
      failureReadinessThreshold: RUNTIME_EVENT_POLL_FAILURE_READINESS_THRESHOLD,
      onError: (_error, status) => {
        console.log(
          formatOnlineServerLogEvent({
            event: "online.runtime.poll",
            status: "failed",
            reason: status.lastError ?? "Runtime event polling failed.",
          })
        );
      },
    });

    let shutdownStarted = false;
    const shutdown = async (reason: string) => {
      if (shutdownStarted) return;
      shutdownStarted = true;

      console.log(`Received ${reason}; shutting down Castles online server.`);

      try {
        await runtimeCoordinator?.startDrain({ reason });
      } catch (error) {
        console.error("Failed to mark online runtime coordinator draining", error);
        process.exitCode = 1;
      }

      const results = await Promise.allSettled([
        closeWebSocketServerAfterDrain(wss, {
          drainGraceMs: WEBSOCKET_DRAIN_GRACE_MS,
          closeTimeoutMs: WEBSOCKET_CLOSE_TIMEOUT_MS,
        }),
        closeHttpServer(server, {
          timeoutMs: HTTP_SHUTDOWN_TIMEOUT_MS,
        }),
      ]);
      await runtimeEventPoller?.stop();
      await runtimeNodeHeartbeat?.stop();
      const failedClose = results.find((result) => result.status === "rejected");
      if (failedClose?.status === "rejected") {
        console.error("Failed while closing network listeners", failedClose.reason);
        process.exitCode = 1;
      }

      try {
        await runtimeCoordinator?.close();
      } catch (error) {
        console.error("Failed to close online runtime coordinator", error);
        process.exitCode = 1;
      }
      try {
        await runtimeNodeStore.close();
      } catch (error) {
        console.error("Failed to close online runtime node store", error);
        process.exitCode = 1;
      }
      try {
        await store.close();
      } catch (error) {
        console.error("Failed to close online game store", error);
        process.exitCode = 1;
      }
      try {
        await accountStore.close?.();
      } catch (error) {
        console.error("Failed to close online account store", error);
        process.exitCode = 1;
      }
      try {
        await spectatorPresenceStore.close();
      } catch (error) {
        console.error("Failed to close online spectator presence store", error);
        process.exitCode = 1;
      }
      try {
        await runtimeEventStore.close();
      } catch (error) {
        console.error("Failed to close online runtime event store", error);
        process.exitCode = 1;
      }
      try {
        await operationGateStore.close();
      } catch (error) {
        console.error("Failed to close online operation gate store", error);
        process.exitCode = 1;
      }
      try {
        await rateLimitStore.close();
      } catch (error) {
        console.error("Failed to close online rate-limit store", error);
        process.exitCode = 1;
      }
      try {
        await startupMaintenanceStore.close();
      } catch (error) {
        console.error("Failed to close online startup maintenance store", error);
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
      app.use(express.static(config.staticDir, {
        setHeaders: (res, filePath) => {
          const fileName = path.basename(filePath);
          if (fileName === "index.html" || fileName === "service-worker.js") {
            res.setHeader("Cache-Control", "no-store");
            return;
          }
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }));
      app.use((req, res, next) => {
        if (req.method !== "GET" || req.path.startsWith("/api/")) {
          next();
          return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.sendFile(path.join(config.staticDir, "index.html"));
      });
    } else {
      console.warn(`Static build directory not found: ${config.staticDir}`);
    }

    server.listen(config.port, config.bindHost, () => {
      console.log(
        `Castles online server listening on ${config.publicBaseUrl} via ${config.bindHost}:${config.port}`
      );
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
      await runtimeEventPoller?.stop();
      await runtimeNodeHeartbeat?.stop();
      try {
        await runtimeCoordinator?.close();
      } catch (closeError) {
        console.error("Failed to close online runtime coordinator after startup failure", closeError);
      }
      try {
        await runtimeNodeStore.close();
      } catch (closeError) {
        console.error("Failed to close online runtime node store after startup failure", closeError);
      }
      try {
        await store.close();
      } catch (closeError) {
        console.error("Failed to close online game store after startup failure", closeError);
      }
      try {
        await accountStore.close?.();
      } catch (closeError) {
        console.error("Failed to close online account store after startup failure", closeError);
      }
      try {
        await spectatorPresenceStore.close();
      } catch (closeError) {
        console.error(
          "Failed to close online spectator presence store after startup failure",
          closeError
        );
      }
      try {
        await runtimeEventStore.close();
      } catch (closeError) {
        console.error(
          "Failed to close online runtime event store after startup failure",
          closeError
        );
      }
      try {
        await operationGateStore.close();
      } catch (closeError) {
        console.error(
          "Failed to close online operation gate store after startup failure",
          closeError
        );
      }
      try {
        await rateLimitStore.close();
      } catch (closeError) {
        console.error("Failed to close online rate-limit store after startup failure", closeError);
      }
      try {
        await startupMaintenanceStore.close();
      } catch (closeError) {
        console.error(
          "Failed to close online startup maintenance store after startup failure",
          closeError
        );
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("Failed to start Castles online server", error);
  process.exitCode = 1;
});
