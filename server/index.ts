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
    path.resolve(process.cwd(), "server-data", "online-games.json");

  const store = new JsonOnlineGameStore(storePath);
  const service = OnlineGameService.fromRecords(await store.load(), {
    onRecordError: (gameId, error) => {
      console.error(`Skipped corrupt online room record${gameId ? ` ${gameId}` : ""}`, error);
    },
  });
  const { app, server } = createOnlineHttpServer({
    publicBaseUrl,
    service,
    onRoomsChanged: (records) => store.save(records),
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
