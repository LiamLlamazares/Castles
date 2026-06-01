import {
  AbilityType,
  Color,
  PieceTheme,
  PieceType,
  SanctuaryType,
  TurnPhase,
} from "../Constants";
import { BoardConfig } from "../Classes/Core/Board";
import { MoveRecord } from "../Constants";

export type OnlineRejectCode =
  | "unauthorized"
  | "stale_action"
  | "wrong_player"
  | "illegal_action"
  | "duplicate_action"
  | "game_over"
  | "not_found"
  | "bad_request"
  | "bad_json"
  | "not_joined"
  | "unknown_message"
  | "rate_limited"
  | "persistence_failed";

export interface OnlineReject {
  code: OnlineRejectCode;
  message: string;
}

export interface HexDTO {
  q: number;
  r: number;
  s: number;
  colorIndex?: number;
}

export interface PieceDTO {
  hex: HexDTO;
  color: Color;
  type: PieceType;
  canMove: boolean;
  canAttack: boolean;
  damage: number;
  abilityUsed: boolean;
  souls: number;
  isRevived: boolean;
}

export interface CastleDTO {
  hex: HexDTO;
  color: Color;
  turnsControlled: number;
  usedThisTurn: boolean;
  owner: Color;
}

export interface SanctuaryDTO {
  hex: HexDTO;
  type: SanctuaryType;
  territorySide: Color;
  controller: Color | null;
  cooldown: number;
  hasPledgedThisGame: boolean;
}

export interface BoardDTO {
  config: BoardConfig;
  castles: CastleDTO[];
}

export interface PhoenixRecordDTO {
  respawnTurn: number;
  owner: Color;
}

export interface GameStateDTO {
  pieces: PieceDTO[];
  castles: CastleDTO[];
  sanctuaries: SanctuaryDTO[];
  turnCounter: number;
  sanctuaryPool: SanctuaryType[];
  graveyard: PieceDTO[];
  phoenixRecords: PhoenixRecordDTO[];
  promotionPending: PieceDTO | null;
  victoryPoints?: { w: number; b: number };
}

export interface OnlineGameSetupDTO {
  board: BoardDTO;
  pieces: PieceDTO[];
  sanctuaries: SanctuaryDTO[];
  sanctuarySettings?: { unlockTurn: number; cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  initialPoolTypes?: SanctuaryType[];
  pieceTheme?: PieceTheme;
  timeControl?: { initial: number; increment: number };
}

export interface OnlineGameResultDTO {
  winner: Color;
  reason: "monarch_captured" | "castle_control" | "victory_points" | "resignation" | "timeout";
}

export interface OnlineClockStateDTO {
  timeControl: { initialMs: number; incrementMs: number };
  remainingMs: { w: number; b: number };
  activeColor: Color | null;
  runningSince: number | null;
  serverNow: number;
  flag?: { color: Color; at: number };
}

interface VersionedAction {
  baseVersion: number;
}

export type OnlineActionDTO =
  | (VersionedAction & { type: "MOVE"; from: HexDTO; to: HexDTO })
  | (VersionedAction & { type: "ATTACK"; from: HexDTO; target: HexDTO })
  | (VersionedAction & { type: "CASTLE_ATTACK"; from: HexDTO; castle: HexDTO })
  | (VersionedAction & { type: "RECRUIT"; castle: HexDTO; spawn: HexDTO })
  | (VersionedAction & { type: "PLEDGE"; sanctuary: HexDTO; spawn: HexDTO })
  | (VersionedAction & {
      type: "ABILITY";
      from: HexDTO;
      ability: AbilityType;
      target: HexDTO;
    })
  | (VersionedAction & { type: "PROMOTE"; pieceType: PieceType })
  | (VersionedAction & { type: "PASS" })
  | (VersionedAction & { type: "RESIGN" });

export interface OnlineGameSnapshotDTO {
  gameId: string;
  version: number;
  setup: OnlineGameSetupDTO;
  state: GameStateDTO;
  moveHistory: MoveRecord[];
  playerToMove: Color;
  turnPhase: TurnPhase;
  result?: OnlineGameResultDTO;
  clock?: OnlineClockStateDTO;
}

export type OnlineConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "resyncing"
  | "access-denied"
  | "protocol-error"
  | "server-error"
  | "terminal";

interface BaseOnlineClientSession {
  gameId: string;
  role: "player" | "spectator";
  version: number;
  status: OnlineConnectionStatus;
  lastError?: string;
  clock?: OnlineClockStateDTO;
  result?: OnlineGameResultDTO;
  spectatorUrl?: string;
}

export interface OnlinePlayerClientSession extends BaseOnlineClientSession {
  role: "player";
  playerColor: Color;
  opponentInviteUrl?: string;
  submitAction: (action: OnlineActionDTO) => void;
}

export interface OnlineSpectatorClientSession extends BaseOnlineClientSession {
  role: "spectator";
  spectatorUrl: string;
}

export type OnlineClientSession = OnlinePlayerClientSession | OnlineSpectatorClientSession;

export type OnlineActionResult =
  | { ok: true; snapshot: OnlineGameSnapshotDTO }
  | { ok: false; error: OnlineReject; snapshot: OnlineGameSnapshotDTO };
