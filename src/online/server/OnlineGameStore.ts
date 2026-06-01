import type { OnlineGameRoomRecord } from "../OnlineGameRoom";
import type { OnlineGameEvent } from "../events";
import type { OnlineGameSummary } from "../readModel";

export interface OnlineGameStoreLoadOptions {
  onEventError?: (line: number, error: unknown) => void;
}

export interface OnlineGameStore {
  load(options?: OnlineGameStoreLoadOptions): Promise<OnlineGameRoomRecord[]>;
  loadSummaries(): Promise<OnlineGameSummary[]>;
  rebuildSummaries(options?: OnlineGameStoreLoadOptions): Promise<OnlineGameSummary[]>;
  appendEvent(event: OnlineGameEvent): Promise<void>;
  checkReady(): Promise<boolean>;
  close(): Promise<void>;
}
