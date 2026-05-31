import { readFile } from "node:fs/promises";
import type { OnlineGameEvent } from "../events";
import { onlineGameEventsToRecords, validateOnlineGameEvent } from "../events";

export interface JsonToPostgresMigrationStore {
  importEventIfMissing(event: OnlineGameEvent): Promise<void>;
  importEventsIfMissing?(events: OnlineGameEvent[]): Promise<void>;
}

export interface MigrateJsonOnlineEventsToPostgresOptions {
  sourcePath: string;
  store: JsonToPostgresMigrationStore;
}

export async function migrateJsonOnlineEventsToPostgres({
  sourcePath,
  store,
}: MigrateJsonOnlineEventsToPostgresOptions): Promise<{ imported: number }> {
  const raw = await readFile(sourcePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const loadedEvents: Array<{ event: OnlineGameEvent; line: number }> = [];
  const eventIds = new Set<string>();

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON on online event log line ${lineNumber}: ${String(error)}`);
    }

    const validation = validateOnlineGameEvent(parsed);
    if (!validation.ok) {
      throw new Error(
        `Invalid online event on line ${lineNumber}: ${validation.error.message}`
      );
    }

    if (eventIds.has(validation.value.eventId)) {
      throw new Error(`Duplicate online event id ${validation.value.eventId} on line ${lineNumber}.`);
    }
    eventIds.add(validation.value.eventId);
    loadedEvents.push({ event: validation.value, line: lineNumber });
  }

  const events = loadedEvents.map(({ event }) => event);
  onlineGameEventsToRecords(events, {
    onEventError: (eventIndex, error) => {
      const line = loadedEvents[eventIndex]?.line ?? eventIndex + 1;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid online event replay at line ${line}: ${message}`);
    },
  });

  if (store.importEventsIfMissing) {
    await store.importEventsIfMissing(events);
  } else {
    for (const event of events) {
      await store.importEventIfMissing(event);
    }
  }

  return { imported: events.length };
}
