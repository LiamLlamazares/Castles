import type { OnlineGameRoomRecord } from "../OnlineGameRoom";
import type { OnlineChallengeEvent, OnlineChallengeSummary } from "../challenges";
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
  loadChallengeSummaries(): Promise<OnlineChallengeSummary[]>;
  rebuildSummaries(options?: OnlineGameStoreLoadOptions): Promise<OnlineGameSummary[]>;
  rebuildChallengeSummaries(options?: OnlineGameStoreLoadOptions): Promise<OnlineChallengeSummary[]>;
  appendGameCreated(
    event: Extract<OnlineGameEvent, { type: "game_created" }>,
    credentials: OnlineGameCredentials
  ): Promise<void>;
  appendEvent(event: OnlineGameEvent): Promise<void>;
  /**
   * Low-level lifecycle append for challenge creation, decline, cancel, and
   * expiry. `challenge_accepted` is intentionally excluded until it can be
   * persisted atomically with online game creation and game credentials.
   */
  appendChallengeEvent(
    event: Exclude<OnlineChallengeEvent, { type: "challenge_accepted" }>
  ): Promise<OnlineChallengeSummary>;
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
  clientActionId: string;
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
