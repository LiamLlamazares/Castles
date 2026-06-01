import type { OnlineGameRoomRecord } from "../OnlineGameRoom";
import type {
  AuthenticatedOnlineIdentity,
  OnlineChallengeEvent,
  OnlineChallengeSummary,
} from "../challenges";
import type { OnlineGameCredentials, OnlineGameEvent } from "../events";
import type { OnlineGameSummary, OnlineIdentity } from "../readModel";
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
  appendChallengeCreated(
    event: Extract<OnlineChallengeEvent, { type: "challenge_created" }>,
    credentials: OnlineChallengeCredentials
  ): Promise<OnlineChallengeSummary>;
  resolveChallengeCredential(
    challengeId: string,
    token: string
  ): Promise<ResolvedOnlineChallengeCredential | null>;
  acceptChallengeAndCreateGame(
    input: OnlineChallengeAcceptInput
  ): Promise<OnlineChallengeAcceptResult>;
  /**
   * Low-level lifecycle append for decline, cancel, and expiry only.
   * `challenge_created` must go through appendChallengeCreated so credentials
   * are stored atomically. `challenge_accepted` must go through
   * acceptChallengeAndCreateGame so game creation is atomic.
   */
  appendChallengeEvent(
    event: Exclude<
      OnlineChallengeEvent,
      { type: "challenge_created" } | { type: "challenge_accepted" }
    >
  ): Promise<OnlineChallengeSummary>;
  applyGameAction(input: OnlineGameStoreActionInput): Promise<OnlineGameStoreActionResult>;
  adjudicateGameTimeout(
    input: OnlineGameStoreTimeoutInput
  ): Promise<OnlineGameStoreTimeoutResult>;
  checkReady(): Promise<boolean>;
  close(): Promise<void>;
}

export type OnlineChallengeRole = "challenger" | "challenged";

export interface OnlineChallengeCredentials {
  challengerCredential: string;
  challengedCredential: string;
  challengerIdentity: OnlineIdentity;
  challengedIdentity: OnlineIdentity;
}

export interface ResolvedOnlineChallengeCredential {
  challengeId: string;
  role: OnlineChallengeRole;
  identity: AuthenticatedOnlineIdentity;
}

export interface OnlineChallengeGameInvite {
  gameId: string;
  seat: "w" | "b";
  token: string;
  url: string;
}

export interface OnlineChallengeAcceptInput {
  challengeId: string;
  acceptedBy: ResolvedOnlineChallengeCredential;
  acceptedAt: string;
  gameCreatedEvent: Extract<OnlineGameEvent, { type: "game_created" }>;
  whiteIdentity: OnlineIdentity;
  blackIdentity: OnlineIdentity;
}

export interface OnlineChallengeAcceptResult {
  challengeEvent: Extract<OnlineChallengeEvent, { type: "challenge_accepted" }>;
  challengeSummary: OnlineChallengeSummary;
  gameSummary: OnlineGameSummary;
  gameCredentials: OnlineGameCredentials;
  gameRecord: OnlineGameRoomRecord;
  gameSeats: {
    challenger: "w" | "b";
    challenged: "w" | "b";
  };
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
