import type { OnlineGameRoomRecord } from "../OnlineGameRoom";
import type { OnlineGameEvent } from "../events";

export interface OnlineGameStoreLoadOptions {
  onEventError?: (line: number, error: unknown) => void;
}

export interface OnlineGameStore {
  load(options?: OnlineGameStoreLoadOptions): Promise<OnlineGameRoomRecord[]>;
  appendEvent(event: OnlineGameEvent): Promise<void>;
  checkReady(): Promise<boolean>;
  close(): Promise<void>;
}
