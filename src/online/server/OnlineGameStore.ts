import type { OnlineGameRoomRecord } from "../OnlineGameRoom";
import type {
  AuthenticatedOnlineIdentity,
  OnlineChallengeEvent,
  OnlineChallengeSummary,
} from "../challenges";
import type {
  OpenSeekDirectoryListOptions,
  OpenSeekDirectoryResponse,
  OpenSeekEvent,
  OpenSeekSummary,
} from "../seeks";
import type { OnlineGameCredentials, OnlineGameEvent } from "../events";
import type { OnlineRating } from "../ratings";
import type {
  OnlineGameDirectoryListOptions,
  OnlineGameDirectoryResponse,
  OnlineGameSummary,
  OnlinePersonalGameDirectoryListOptions,
  OnlineIdentity,
} from "../readModel";
import type {
  OnlineActionDTO,
  OnlineGameResultDTO,
  OnlineGameSnapshotDTO,
  OnlineReject,
} from "../types";

export type AppendableOnlineGameEvent = Exclude<
  OnlineGameEvent,
  { type: "game_created" } | { type: "visibility_changed" }
>;

export class OnlineGameSeatCredentialTerminalError extends Error {
  constructor(gameId: string) {
    super(`Online game ${gameId} is already terminal.`);
  }
}

export interface OnlineGameStoreLoadOptions {
  onEventError?: (line: number, error: unknown) => void;
}

export interface OnlineGameStore {
  load(options?: OnlineGameStoreLoadOptions): Promise<OnlineGameRoomRecord[]>;
  loadGameRoomRecord(gameId: string): Promise<OnlineGameRoomRecord | null>;
  loadSummaries(): Promise<OnlineGameSummary[]>;
  listGameSummaries(options: OnlineGameDirectoryListOptions): Promise<OnlineGameDirectoryResponse>;
  listPersonalGameSummaries(
    options: OnlinePersonalGameDirectoryListOptions
  ): Promise<OnlineGameDirectoryResponse>;
  loadGameSummary(gameId: string): Promise<OnlineGameSummary | null>;
  loadChallengeSummaries(): Promise<OnlineChallengeSummary[]>;
  loadOpenSeekSummaries(): Promise<OpenSeekSummary[]>;
  listOpenSeekSummaries(options: OpenSeekDirectoryListOptions): Promise<OpenSeekDirectoryResponse>;
  rebuildSummaries(options?: OnlineGameStoreLoadOptions): Promise<OnlineGameSummary[]>;
  rebuildChallengeSummaries(options?: OnlineGameStoreLoadOptions): Promise<OnlineChallengeSummary[]>;
  rebuildOpenSeekSummaries(options?: OnlineGameStoreLoadOptions): Promise<OpenSeekSummary[]>;
  appendGameCreated(
    event: Extract<OnlineGameEvent, { type: "game_created" }>,
    credentials: OnlineGameCredentials
  ): Promise<void>;
  appendGameSeatCredential(
    gameId: string,
    seat: "w" | "b",
    credential: string
  ): Promise<OnlineGameRoomRecord>;
  appendEvent(event: AppendableOnlineGameEvent): Promise<void>;
  appendGameVisibilityChanged(
    event: Extract<OnlineGameEvent, { type: "visibility_changed" }>
  ): Promise<OnlineGameSummary>;
  appendChallengeCreated(
    event: Extract<OnlineChallengeEvent, { type: "challenge_created" }>,
    credentials: OnlineChallengeCredentials
  ): Promise<OnlineChallengeSummary>;
  appendOpenSeekCreated(
    event: Extract<OpenSeekEvent, { type: "seek_created" }>,
    credentials: OpenSeekCredentials
  ): Promise<OpenSeekSummary>;
  resolveChallengeCredential(
    challengeId: string,
    token: string
  ): Promise<ResolvedOnlineChallengeCredential | null>;
  resolveOpenSeekCredential(
    seekId: string,
    token: string
  ): Promise<ResolvedOpenSeekCredential | null>;
  acceptChallengeAndCreateGame(
    input: OnlineChallengeAcceptInput
  ): Promise<OnlineChallengeAcceptResult>;
  acceptOpenSeekAndCreateGame(
    input: OpenSeekAcceptInput
  ): Promise<OpenSeekAcceptResult>;
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
  appendOpenSeekEvent(
    event: Exclude<OpenSeekEvent, { type: "seek_created" } | { type: "seek_accepted" }>
  ): Promise<OpenSeekSummary>;
  applyGameAction(input: OnlineGameStoreActionInput): Promise<OnlineGameStoreActionResult>;
  adjudicateGameTimeout(
    input: OnlineGameStoreTimeoutInput
  ): Promise<OnlineGameStoreTimeoutResult>;
  loadAccountRating(accountId: string): Promise<OnlineRating | null>;
  loadRatedGameResult(gameId: string): Promise<OnlineRatedGameResultRecord | null>;
  checkReady(): Promise<boolean>;
  close(): Promise<void>;
}

export interface OnlineRatedGameResultRecord {
  gameId: string;
  whiteAccountId: string;
  blackAccountId: string;
  winner: "w" | "b";
  reason: OnlineGameResultDTO["reason"];
  engineId: string;
  appliedAt: string;
  whiteBefore: OnlineRating;
  whiteAfter: OnlineRating;
  blackBefore: OnlineRating;
  blackAfter: OnlineRating;
}

export type OnlineChallengeRole = "challenger" | "challenged";

export interface OnlineChallengeCredentials {
  challengerCredential: string;
  challengedCredential: string;
  challengerIdentity: OnlineIdentity;
  challengedIdentity: OnlineIdentity;
}

export interface OpenSeekCredentials {
  creatorCredential: string;
  creatorIdentity: OnlineIdentity;
}

export interface ResolvedOnlineChallengeCredential {
  challengeId: string;
  role: OnlineChallengeRole;
  identity: AuthenticatedOnlineIdentity;
}

export interface ResolvedOpenSeekCredential {
  seekId: string;
  role: "creator";
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

export interface OpenSeekAcceptInput {
  seekId: string;
  acceptedBy: OnlineIdentity;
  acceptedAt: string;
  gameCreatedEvent: Extract<OnlineGameEvent, { type: "game_created" }>;
  whiteIdentity: OnlineIdentity;
  blackIdentity: OnlineIdentity;
  acceptorCredential: string;
}

export interface OpenSeekAcceptResult {
  seekEvent: Extract<OpenSeekEvent, { type: "seek_accepted" }>;
  seekSummary: OpenSeekSummary;
  gameSummary: OnlineGameSummary;
  gameCredentials: OnlineGameCredentials;
  gameRecord: OnlineGameRoomRecord;
  gameSeats: {
    creator: "w" | "b";
    acceptor: "w" | "b";
  };
}

export interface OnlineGameStoreActionInput {
  gameId: string;
  token: string;
  clientActionId: string;
  action: OnlineActionDTO;
  now?: () => number;
}

export type OnlineGameStoreSnapshotChangeEvent = Extract<
  OnlineGameEvent,
  { type: "action_accepted" | "timeout_adjudicated" }
>;

export type OnlineGameStoreActionResult =
  | {
      ok: true;
      event: Extract<OnlineGameEvent, { type: "action_accepted" }>;
      snapshotChange: OnlineGameStoreSnapshotChangeEvent | null;
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
