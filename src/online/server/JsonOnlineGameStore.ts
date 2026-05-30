import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { OnlineGameRoomRecord } from "../OnlineGameRoom";

export class JsonOnlineGameStore {
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
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(
      tempPath,
      JSON.stringify({ rooms: records }, null, 2),
      "utf8"
    );
    await rename(tempPath, this.filePath);
  }
}

