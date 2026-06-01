import type { OnlineGameRoomRecord } from "../OnlineGameRoom";
import type { OnlineGameCredentials, OnlineGameEvent } from "../events";
import type { OnlineGameSummary } from "../readModel";
import type {
  OnlineActionDTO,
  OnlineGameSnapshotDTO,
  OnlineReject,
} from "../types";

export interface OnlineGameStoreLoadOptions {
  onEventError?: (line: number, error: unknown) => void;
}

export interface OnlineGameStore {
  load(options?: OnlineGameStoreLoadOptions): Promise<OnlineGameRoomRecord[]>;
  loadSummaries(): Promise<OnlineGameSummary[]>;
  rebuildSummaries(options?: OnlineGameStoreLoadOptions): Promise<OnlineGameSummary[]>;
  appendGameCreated(
    event: Extract<OnlineGameEvent, { type: "game_created" }>,
    credentials: OnlineGameCredentials
  ): Promise<void>;
  appendEvent(event: OnlineGameEvent): Promise<void>;
  applyGameAction(input: OnlineGameStoreActionInput): Promise<OnlineGameStoreActionResult>;
  adjudicateGameTimeout(
    input: OnlineGameStoreTimeoutInput
  ): Promise<OnlineGameStoreTimeoutResult>;
  checkReady(): Promise<boolean>;
  close(): Promise<void>;
}

export interface OnlineGameStoreActionInput {
  gameId: string;
  token: string;
  action: OnlineActionDTO;
  now?: () => number;
}

export type OnlineGameStoreActionResult =
  | {
      ok: true;
      event: Extract<OnlineGameEvent, { type: "action_accepted" }>;
      playerColor: Extract<OnlineGameEvent, { type: "action_accepted" }>["playerColor"];
      room: OnlineGameRoomRecord;
      snapshot: OnlineGameSnapshotDTO;
    }
  | {
      ok: false;
      error: OnlineReject;
      event?: Extract<OnlineGameEvent, { type: "timeout_adjudicated" }>;
      room?: OnlineGameRoomRecord;
      snapshot?: OnlineGameSnapshotDTO;
    };

export interface OnlineGameStoreTimeoutInput {
  gameId: string;
  now?: () => number;
}

export type OnlineGameStoreTimeoutResult =
  | {
      ok: true;
      event?: Extract<OnlineGameEvent, { type: "timeout_adjudicated" }>;
      room?: OnlineGameRoomRecord;
      snapshot?: OnlineGameSnapshotDTO;
    }
  | {
      ok: false;
      error: OnlineReject;
      snapshot?: OnlineGameSnapshotDTO;
    };
