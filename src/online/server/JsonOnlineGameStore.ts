import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { OnlineGameRoomRecord } from "../OnlineGameRoom";

export class JsonOnlineGameStore {
  private writeQueue: Promise<void> = Promise.resolve();
  private writeCounter = 0;

  constructor(private readonly filePath: string) {}

  async load(): Promise<OnlineGameRoomRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.rooms) ? parsed.rooms : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async save(records: OnlineGameRoomRecord[]): Promise<void> {
    const recordsJson = JSON.stringify({ rooms: records }, null, 2);
    const saveOperation = this.writeQueue.then(() => this.writeSnapshot(recordsJson));
    this.writeQueue = saveOperation.catch(() => undefined);
    return saveOperation;
  }

  private async writeSnapshot(recordsJson: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${this.writeCounter++}.tmp`;
    try {
      await writeFile(tempPath, recordsJson, "utf8");
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
