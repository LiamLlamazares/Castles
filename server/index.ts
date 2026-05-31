import path from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import { createOnlineHttpServer } from "../src/online/server/createOnlineHttpServer";
import { JsonOnlineGameStore } from "../src/online/server/JsonOnlineGameStore";
import { OnlineGameService } from "../src/online/OnlineGameService";

async function main() {
  const port = Number(process.env.PORT ?? 3000);
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
  const staticDir = process.env.CASTLES_STATIC_DIR ?? path.resolve(process.cwd(), "build");
  const storePath =
    process.env.ONLINE_STORE_PATH ??
    path.resolve(process.cwd(), "server-data", "online-game-events.jsonl");

  const store = new JsonOnlineGameStore(storePath);
  const records = await store.load({
    onEventError: (line, error) => {
      console.error(`Invalid online event log line ${line}`, error);
    },
  });
  const service = OnlineGameService.fromRecords(records);
  const { app, server } = createOnlineHttpServer({
    publicBaseUrl,
    service,
    onGameEvent: (event) => store.appendEvent(event),
    health: {
      buildId: process.env.BUILD_ID,
      commit: process.env.GIT_COMMIT,
      storePath,
      checkStoreReady: () => store.checkReady(),
    },
  });

  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  } else {
    console.warn(`Static build directory not found: ${staticDir}`);
  }

  server.listen(port, () => {
    console.log(`Castles online server listening on ${publicBaseUrl}`);
    console.log(`Persisting online games to ${storePath}`);
  });
}

main().catch((error) => {
  console.error("Failed to start Castles online server", error);
  process.exitCode = 1;
});
