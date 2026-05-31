import { constants } from "node:fs";
import { access, appendFile, mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { OnlineGameRoomRecord } from "../OnlineGameRoom";
import {
  OnlineGameEvent,
  onlineGameEventsToRecords,
  validateOnlineGameEvent,
} from "../events";

export interface JsonOnlineGameStoreLoadOptions {
  onEventError?: (line: number, error: unknown) => void;
}

interface LoadedOnlineGameEvent {
  event: OnlineGameEvent;
  line: number;
}

export class JsonOnlineGameStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(options: JsonOnlineGameStoreLoadOptions = {}): Promise<OnlineGameRoomRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const loadedEvents = this.parseStoredEvents(raw, options);
      return onlineGameEventsToRecords(
        loadedEvents.map(({ event }) => event),
        {
          onEventError: (eventIndex, error) => {
            options.onEventError?.(loadedEvents[eventIndex]?.line ?? eventIndex + 1, error);
          },
        }
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async appendEvent(event: OnlineGameEvent): Promise<void> {
    const validation = validateOnlineGameEvent(event);
    if (!validation.ok) {
      throw new Error(validation.error.message);
    }

    const saveOperation = this.writeQueue.then(() => this.appendValidatedEvent(validation.value));
    this.writeQueue = saveOperation.catch(() => undefined);
    return saveOperation;
  }

  async checkReady(): Promise<boolean> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    const handle = await open(this.filePath, "a");
    await handle.close();
    return true;
  }

  private async appendValidatedEvent(event: OnlineGameEvent): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
  }

  private parseStoredEvents(
    raw: string,
    options: JsonOnlineGameStoreLoadOptions = {}
  ): LoadedOnlineGameEvent[] {
    const loadedEvents: LoadedOnlineGameEvent[] = [];
    const lines = raw.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      const lineNumber = index + 1;
      const line = lines[index].trim();
      if (!line) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        options.onEventError?.(lineNumber, error);
        throw error;
      }

      const validation = validateOnlineGameEvent(parsed);
      if (!validation.ok) {
        const error = new Error(validation.error.message);
        options.onEventError?.(lineNumber, error);
        throw error;
      }
      loadedEvents.push({ event: validation.value, line: lineNumber });
    }

    return loadedEvents;
  }
}
