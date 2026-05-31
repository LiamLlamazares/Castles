import path from "node:path";
import { migrateJsonOnlineEventsToPostgres } from "../src/online/server/migrateJsonOnlineEventsToPostgres";
import { PostgresOnlineGameStore } from "../src/online/server/PostgresOnlineGameStore";

async function main(): Promise<void> {
  const sourcePath =
    process.env.ONLINE_STORE_PATH ??
    path.resolve(process.cwd(), "server-data", "online-game-events.jsonl");
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to migrate online events to PostgreSQL.");
  }

  const store = new PostgresOnlineGameStore({ connectionString: databaseUrl });
  try {
    const existingEvents = await store.countEvents();
    if (existingEvents > 0) {
      throw new Error(
        `PostgreSQL already contains ${existingEvents} online event(s). Run this migration before switching the live service to PostgreSQL.`
      );
    }

    const result = await migrateJsonOnlineEventsToPostgres({ sourcePath, store });
    console.log(`Imported ${result.imported} online event(s) from ${sourcePath}.`);
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error("Failed to migrate online JSONL events to PostgreSQL", error);
  process.exitCode = 1;
});
