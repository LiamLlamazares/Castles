import {
  AbilityCommand,
  AttackCommand,
  CastleAttackCommand,
  MoveCommand,
  PassCommand,
  PledgeCommand,
  RecruitCommand,
} from "../Classes/Commands";
import type { CommandContext, GameCommand } from "../Classes/Commands";
import { GameState } from "../Classes/Core/GameState";
import { Hex } from "../Classes/Entities/Hex";
import { VP_VICTORY_THRESHOLD } from "../Classes/Systems/WinCondition";
import { PieceType, Color } from "../Constants";
import {
  createInitialStateFromSetupDTO,
  hydrateHexDTO,
  serializeGameState,
} from "./serialization";
import { isValidClientActionId, sameOnlineAction } from "./actionIdempotency";
import {
  OnlineActionDTO,
  OnlineActionResult,
  OnlineClockStateDTO,
  OnlineGameResultDTO,
  OnlineGameSetupDTO,
  OnlineGameSnapshotDTO,
  OnlineReplayClockPointDTO,
  OnlineReject,
} from "./types";

export interface OnlineGameRoomCreateInput {
  setup: OnlineGameSetupDTO;
  gameId: string;
  whiteCredential: string;
  blackCredential: string;
  additionalWhiteCredentials?: string[];
  additionalBlackCredentials?: string[];
  verifyToken?: OnlineTokenVerifier;
  clock?: OnlineClockRecord;
  acceptedActions?: AcceptedOnlineActionRecord[];
  timeout?: AcceptedOnlineTimeoutRecord;
  result?: OnlineGameResultDTO;
  now?: () => number;
}

export interface OnlineClockRecord {
  remainingMs: { w: number; b: number };
  activeColor: Color | null;
  runningSince: number | null;
  flag?: { color: Color; at: number };
}

export interface AcceptedOnlineActionRecord {
  playerColor: Color;
  clientActionId: string;
  action: OnlineActionDTO;
  version?: number;
  playedAt: number;
  clock?: OnlineClockRecord;
}

export interface AcceptedOnlineTimeoutRecord {
  playerColor: Color;
  version: number;
  adjudicatedAt: number;
  result: OnlineGameResultDTO;
  clock: OnlineClockRecord;
}

export interface OnlineGameRoomRecord {
  gameId: string;
  whiteCredential: string;
  blackCredential: string;
  additionalWhiteCredentials?: string[];
  additionalBlackCredentials?: string[];
  setup: OnlineGameSetupDTO;
  clock?: OnlineClockRecord;
  acceptedActions: AcceptedOnlineActionRecord[];
  timeout?: AcceptedOnlineTimeoutRecord;
  result?: OnlineGameResultDTO;
}

export type OnlineTokenVerifier = (token: string, credential: string) => boolean;

export const ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS = 5;

const defaultTokenVerifier: OnlineTokenVerifier = (token, credential) => token === credential;

function normalizeCredentials(primary: string, additional: string[] | undefined): string[] {
  const additionalCredentials = Array.from(
    new Set((additional ?? []).filter((credential) => credential && credential !== primary))
  ).slice(-ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS);
  return [primary, ...additionalCredentials].filter(Boolean);
}

function reject(
  snapshot: OnlineGameSnapshotDTO,
  code: OnlineReject["code"],
  message: string
): OnlineActionResult {
  return {
    ok: false,
    error: { code, message },
    snapshot,
  };
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function sameHex(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

export class OnlineGameRoom {
  private state: GameState;
  private readonly context: CommandContext;
  private acceptedActions: AcceptedOnlineActionRecord[];
  private timeout?: AcceptedOnlineTimeoutRecord;
  private result?: OnlineGameResultDTO;
  private stateVersion = 0;
  private initialClockState?: OnlineClockRecord;
  private clockState?: OnlineClockRecord;

  private constructor(
    private readonly setup: OnlineGameSetupDTO,
    private readonly gameId: string,
    private readonly whiteCredentials: string[],
    private readonly blackCredentials: string[],
    private readonly verifyToken: OnlineTokenVerifier,
    private readonly now: () => number
  ) {
    const hydrated = createInitialStateFromSetupDTO(setup);
    this.state = hydrated.state;
    this.context = {
      gameEngine: hydrated.gameEngine,
      board: hydrated.board,
    };
    this.acceptedActions = [];
    this.initialClockState = this.createInitialClockState();
    this.clockState = this.cloneClockRecord(this.initialClockState);
  }

  static create(input: OnlineGameRoomCreateInput): OnlineGameRoom {
    const room = new OnlineGameRoom(
      input.setup,
      input.gameId,
      normalizeCredentials(input.whiteCredential, input.additionalWhiteCredentials),
      normalizeCredentials(input.blackCredential, input.additionalBlackCredentials),
      input.verifyToken ?? defaultTokenVerifier,
      input.now ?? Date.now
    );
    room.initialClockState = room.cloneClockRecord(input.clock) ?? room.initialClockState;
    room.clockState = room.cloneClockRecord(room.initialClockState) ?? room.clockState;

    for (const entry of input.acceptedActions ?? []) {
      room.replayAcceptedAction(entry);
    }

    if (input.timeout) {
      room.applyTimeoutRecord(input.timeout);
    }

    if (input.result) {
      room.result = input.result;
    } else if (!input.timeout) {
      room.latchTerminalResult();
    }
    return room;
  }

  authenticate(token: string): Color | null {
    if (!token) return null;
    if (this.whiteCredentials.some((credential) => this.verifyToken(token, credential))) return "w";
    if (this.blackCredentials.some((credential) => this.verifyToken(token, credential))) return "b";
    return null;
  }

  addSeatCredential(seat: Color, credential: string): void {
    if (!credential) return;
    const credentials = seat === "w" ? this.whiteCredentials : this.blackCredentials;
    if (!credentials.includes(credential)) {
      credentials.push(credential);
    }
    const primary = credentials[0];
    const additional = credentials
      .slice(1)
      .filter((candidate, index, candidates) => candidate !== primary && candidates.indexOf(candidate) === index)
      .slice(-ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS);
    credentials.splice(0, credentials.length, ...(primary ? [primary, ...additional] : additional));
  }

  get version(): number {
    return this.stateVersion;
  }

  getSnapshot(now = this.now()): OnlineGameSnapshotDTO {
    const result = this.result ?? this.detectTerminalResult();

    return {
      gameId: this.gameId,
      version: this.version,
      setup: this.setup,
      state: serializeGameState(this.state),
      moveHistory: this.state.moveTree.getHistoryLine(),
      playerToMove: this.context.gameEngine.getCurrentPlayer(this.state.turnCounter),
      turnPhase: this.context.gameEngine.getTurnPhase(this.state.turnCounter),
      result,
      clock: this.snapshotClock(now),
      clockHistory: this.snapshotClockHistory(now),
    };
  }

  submitAction(
    token: string,
    action: OnlineActionDTO,
    clientActionId: string
  ): OnlineActionResult {
    const acceptedAt = this.now();
    const snapshot = this.getSnapshot(acceptedAt);
    const color = this.authenticate(token);
    if (!color) {
      return reject(snapshot, "unauthorized", "This player token is not valid.");
    }
    if (!isValidClientActionId(clientActionId)) {
      return reject(snapshot, "bad_request", "A valid client action id is required.");
    }

    const existingAction = this.getAcceptedActionByClientId(color, clientActionId);
    if (existingAction) {
      if (!sameOnlineAction(existingAction.action, action)) {
        return reject(
          this.getSnapshot(acceptedAt),
          "duplicate_action",
          "This client action id has already been used for a different action."
        );
      }
      return { ok: true, snapshot: this.getSnapshot(acceptedAt) };
    }

    const terminalResult = this.latchTerminalResult();
    if (terminalResult) {
      return reject(this.getSnapshot(), "game_over", "This game is already over.");
    }

    if (action.baseVersion !== this.version) {
      return reject(snapshot, "stale_action", "This action was made against an old game version.");
    }

    const activePlayer = this.context.gameEngine.getCurrentPlayer(this.state.turnCounter);
    if (action.type !== "RESIGN" && color !== activePlayer) {
      return reject(snapshot, "wrong_player", "It is not this player's turn.");
    }

    if (action.type === "RESIGN") {
      this.settleClockAt(acceptedAt);
      this.result = { winner: opposite(color), reason: "resignation" };
      this.stopClock();
      this.accept(color, clientActionId, action, acceptedAt);
      return { ok: true, snapshot: this.getSnapshot(acceptedAt) };
    }

    if (action.type === "PROMOTE") {
      return this.submitPromotion(color, clientActionId, action, acceptedAt);
    }

    const command = this.commandFromAction(action, color);
    if (!command.ok) {
      return reject(snapshot, "illegal_action", command.error);
    }

    const result = command.command.execute(this.state);
    if (!result.success) {
      return reject(
        snapshot,
        "illegal_action",
        result.error ?? "The action is not legal in this position."
      );
    }

    const activeColorBeforeAction = this.context.gameEngine.getCurrentPlayer(this.state.turnCounter);
    this.settleClockAt(acceptedAt);
    this.state = result.newState;
    this.latchTerminalResult();
    this.advanceClockAfterAction(activeColorBeforeAction, acceptedAt);
    this.accept(color, clientActionId, action, acceptedAt);
    return { ok: true, snapshot: this.getSnapshot(acceptedAt) };
  }

  toRecord(): OnlineGameRoomRecord {
    return {
      gameId: this.gameId,
      whiteCredential: this.whiteCredentials[0] ?? "",
      blackCredential: this.blackCredentials[0] ?? "",
      ...(this.whiteCredentials.length > 1
        ? { additionalWhiteCredentials: this.whiteCredentials.slice(1) }
        : {}),
      ...(this.blackCredentials.length > 1
        ? { additionalBlackCredentials: this.blackCredentials.slice(1) }
        : {}),
      setup: this.setup,
      clock: this.cloneClockRecord(this.initialClockState),
      acceptedActions: [...this.acceptedActions],
      timeout: this.timeout,
      result: this.result,
    };
  }

  adjudicateTimeout(adjudicatedAt = this.now()): AcceptedOnlineTimeoutRecord | null {
    if (!this.timeControlMs() || !this.clockState || this.result) return null;

    this.settleClockAt(adjudicatedAt);
    const timedOutColor = this.clockState.activeColor;
    if (!timedOutColor || this.clockState.remainingMs[timedOutColor] > 0) {
      return null;
    }

    const version = this.version + 1;
    this.clockState = {
      ...this.clockState,
      remainingMs: {
        ...this.clockState.remainingMs,
        [timedOutColor]: 0,
      },
      activeColor: null,
      runningSince: null,
      flag: { color: timedOutColor, at: adjudicatedAt },
    };
    this.result = { winner: opposite(timedOutColor), reason: "timeout" };
    this.timeout = {
      playerColor: timedOutColor,
      version,
      adjudicatedAt,
      result: this.result,
      clock: this.cloneClockRecord(this.clockState)!,
    };
    this.stateVersion = version;
    return this.timeout;
  }

  getAcceptedActionByClientId(
    playerColor: Color,
    clientActionId: string
  ): AcceptedOnlineActionRecord | undefined {
    return this.acceptedActions.find(
      (acceptedAction) =>
        acceptedAction.playerColor === playerColor &&
        acceptedAction.clientActionId === clientActionId
    );
  }

  private replayAcceptedAction(entry: AcceptedOnlineActionRecord): void {
    if (entry.action.type === "RESIGN") {
      this.result = { winner: opposite(entry.playerColor), reason: "resignation" };
    } else if (entry.action.type === "PROMOTE") {
      const nextState = this.context.gameEngine.applyPromotion(this.state, entry.action.pieceType);
      if (nextState === this.state || nextState.promotionPending) {
        throw new Error("Could not replay online promotion.");
      }
      this.state = nextState;
    } else {
      const command = this.commandFromAction(entry.action, entry.playerColor);
      if (!command.ok) {
        throw new Error(`Could not replay online action: ${command.error}`);
      }
      const result = command.command.execute(this.state);
      if (!result.success) {
        throw new Error(
          `Could not replay online action: ${
            result.error ?? "The action is not legal in this position."
          }`
        );
      }
      this.state = result.newState;
      this.latchTerminalResult();
    }

    this.acceptedActions.push({
      ...entry,
      action: { ...entry.action },
      clock: this.cloneClockRecord(entry.clock),
    });
    this.clockState = this.cloneClockRecord(entry.clock) ?? this.clockState;
    this.stateVersion = entry.version ?? this.stateVersion + 1;
  }

  private applyTimeoutRecord(timeout: AcceptedOnlineTimeoutRecord): void {
    this.timeout = {
      ...timeout,
      result: { ...timeout.result },
      clock: this.cloneClockRecord(timeout.clock)!,
    };
    this.result = this.timeout.result;
    this.clockState = this.cloneClockRecord(timeout.clock);
    this.stateVersion = timeout.version;
  }

  private createInitialClockState(): OnlineClockRecord | undefined {
    const timeControl = this.timeControlMs();
    if (!timeControl) return undefined;
    return {
      remainingMs: {
        w: timeControl.initialMs,
        b: timeControl.initialMs,
      },
      activeColor: this.context.gameEngine.getCurrentPlayer(this.state.turnCounter),
      runningSince: this.now(),
    };
  }

  private timeControlMs(): OnlineClockStateDTO["timeControl"] | undefined {
    if (!this.setup.timeControl) return undefined;
    return {
      initialMs: this.setup.timeControl.initial * 60_000,
      incrementMs: this.setup.timeControl.increment * 1_000,
    };
  }

  private snapshotClockRecord(clock: OnlineClockRecord, serverNow: number): OnlineClockStateDTO | undefined {
    const timeControl = this.timeControlMs();
    if (!timeControl) return undefined;
    return {
      timeControl,
      remainingMs: { ...clock.remainingMs },
      activeColor: clock.activeColor,
      runningSince: clock.runningSince,
      serverNow,
      flag: clock.flag ? { ...clock.flag } : undefined,
    };
  }

  private snapshotClock(now: number): OnlineClockStateDTO | undefined {
    if (!this.clockState) return undefined;
    return this.snapshotClockRecord(this.clockState, now);
  }

  private snapshotClockHistory(now: number): OnlineReplayClockPointDTO[] | undefined {
    const points: OnlineReplayClockPointDTO[] = [];
    if (this.initialClockState) {
      const initialClock = this.snapshotClockRecord(
        this.initialClockState,
        this.initialClockState.runningSince ?? now
      );
      if (initialClock) {
        points.push({ moveIndex: 0, clock: initialClock });
      }
    }

    this.acceptedActions.forEach((entry, index) => {
      if (!entry.clock) return;
      const clock = this.snapshotClockRecord(entry.clock, entry.playedAt);
      if (clock) {
        points.push({ moveIndex: index + 1, clock });
      }
    });

    if (this.timeout?.clock) {
      const clock = this.snapshotClockRecord(this.timeout.clock, this.timeout.adjudicatedAt);
      if (clock) {
        points.push({ moveIndex: this.acceptedActions.length, clock });
      }
    }

    return points.length > 0 ? points : undefined;
  }

  private settleClockAt(now: number): void {
    if (!this.clockState || !this.clockState.activeColor || this.clockState.runningSince === null) {
      return;
    }

    const activeColor = this.clockState.activeColor;
    const elapsedMs = Math.max(0, now - this.clockState.runningSince);
    this.clockState = {
      ...this.clockState,
      remainingMs: {
        ...this.clockState.remainingMs,
        [activeColor]: Math.max(0, this.clockState.remainingMs[activeColor] - elapsedMs),
      },
      runningSince: now,
    };
  }

  private advanceClockAfterAction(previousActiveColor: Color, now: number): void {
    if (!this.clockState) return;
    if (this.result) {
      this.stopClock();
      return;
    }

    const nextActiveColor = this.context.gameEngine.getCurrentPlayer(this.state.turnCounter);
    const timeControl = this.timeControlMs();
    const remainingMs = { ...this.clockState.remainingMs };
    if (nextActiveColor !== previousActiveColor && timeControl) {
      remainingMs[previousActiveColor] += timeControl.incrementMs;
    }

    this.clockState = {
      ...this.clockState,
      remainingMs,
      activeColor: nextActiveColor,
      runningSince: now,
    };
  }

  private stopClock(): void {
    if (!this.clockState) return;
    this.clockState = {
      ...this.clockState,
      activeColor: null,
      runningSince: null,
    };
  }

  private cloneClockRecord(clock: OnlineClockRecord | undefined): OnlineClockRecord | undefined {
    if (!clock) return undefined;
    return {
      remainingMs: { ...clock.remainingMs },
      activeColor: clock.activeColor,
      runningSince: clock.runningSince,
      flag: clock.flag ? { ...clock.flag } : undefined,
    };
  }

  private accept(
    playerColor: Color,
    clientActionId: string,
    action: OnlineActionDTO,
    playedAt: number
  ): AcceptedOnlineActionRecord {
    const version = this.version + 1;
    const accepted = {
      playerColor,
      clientActionId,
      action: { ...action, baseVersion: this.version },
      version,
      playedAt,
      clock: this.cloneClockRecord(this.clockState),
    };
    this.acceptedActions.push({
      ...accepted,
    });
    this.stateVersion = version;
    return accepted;
  }

  private submitPromotion(
    color: Color,
    clientActionId: string,
    action: Extract<OnlineActionDTO, { type: "PROMOTE" }>,
    acceptedAt: number
  ): OnlineActionResult {
    const snapshot = this.getSnapshot(acceptedAt);
    const pending = this.state.promotionPending;
    if (!pending || pending.color !== color) {
      return reject(snapshot, "illegal_action", "There is no promotion pending for this player.");
    }

    if (action.pieceType === PieceType.Swordsman || action.pieceType === PieceType.Monarch) {
      return reject(snapshot, "illegal_action", "That piece type cannot be selected for promotion.");
    }

    const nextState = this.context.gameEngine.applyPromotion(this.state, action.pieceType);
    if (nextState === this.state || nextState.promotionPending) {
      return reject(snapshot, "illegal_action", "The promotion could not be applied.");
    }

    const activeColorBeforeAction = this.context.gameEngine.getCurrentPlayer(this.state.turnCounter);
    this.settleClockAt(acceptedAt);
    this.state = nextState;
    this.latchTerminalResult();
    this.advanceClockAfterAction(activeColorBeforeAction, acceptedAt);
    this.accept(color, clientActionId, action, acceptedAt);
    return { ok: true, snapshot: this.getSnapshot(acceptedAt) };
  }

  private detectTerminalResult(): OnlineGameResultDTO | undefined {
    const engineWinner = this.context.gameEngine.getWinner(
      this.state.pieces,
      this.state.castles,
      this.state.victoryPoints
    );
    if (!engineWinner) return undefined;

    const monarchExists = this.state.pieces.some(
      (piece) => piece.type === PieceType.Monarch && piece.color === opposite(engineWinner)
    );
    if (!monarchExists) {
      return { winner: engineWinner, reason: "monarch_captured" };
    }

    if (
      this.state.castles.length > 0 &&
      this.state.castles.every((castle) => castle.owner === engineWinner)
    ) {
      return { winner: engineWinner, reason: "castle_control" };
    }

    if ((this.state.victoryPoints?.[engineWinner] ?? 0) >= VP_VICTORY_THRESHOLD) {
      return { winner: engineWinner, reason: "victory_points" };
    }

    return { winner: engineWinner, reason: "monarch_captured" };
  }

  private latchTerminalResult(): OnlineGameResultDTO | undefined {
    if (!this.result) {
      this.result = this.detectTerminalResult();
    }
    return this.result;
  }

  private commandFromAction(
    action: Exclude<OnlineActionDTO, { type: "PROMOTE" | "RESIGN" }>,
    color: Color
  ): { ok: true; command: GameCommand } | { ok: false; error: string } {
    switch (action.type) {
      case "MOVE": {
        const piece = this.getOwnedPieceAt(action.from, color);
        if (!piece) return { ok: false, error: "No active-player piece exists at the source hex." };
        return {
          ok: true,
          command: new MoveCommand(piece, hydrateHexDTO(action.to), this.context),
        };
      }
      case "ATTACK": {
        const piece = this.getOwnedPieceAt(action.from, color);
        if (!piece) return { ok: false, error: "No active-player piece exists at the source hex." };
        return {
          ok: true,
          command: new AttackCommand(piece, hydrateHexDTO(action.target), this.context),
        };
      }
      case "CASTLE_ATTACK": {
        const piece = this.getOwnedPieceAt(action.from, color);
        if (!piece) return { ok: false, error: "No active-player piece exists at the source hex." };
        return {
          ok: true,
          command: new CastleAttackCommand(piece, hydrateHexDTO(action.castle), this.context),
        };
      }
      case "RECRUIT": {
        const castleHex = hydrateHexDTO(action.castle);
        const castle = this.state.castles.find((candidate) => sameHex(candidate.hex, castleHex));
        if (!castle) return { ok: false, error: "No castle exists at that hex." };
        return {
          ok: true,
          command: new RecruitCommand(castle, hydrateHexDTO(action.spawn), this.context),
        };
      }
      case "PLEDGE": {
        const sanctuaryHex = hydrateHexDTO(action.sanctuary);
        const sanctuary = this.state.sanctuaries.find((candidate) =>
          sameHex(candidate.hex, sanctuaryHex)
        );
        if (!sanctuary) return { ok: false, error: "No sanctuary exists at that hex." };
        return {
          ok: true,
          command: new PledgeCommand(sanctuary, hydrateHexDTO(action.spawn), this.context),
        };
      }
      case "ABILITY": {
        const piece = this.getOwnedPieceAt(action.from, color);
        if (!piece) return { ok: false, error: "No active-player piece exists at the source hex." };
        return {
          ok: true,
          command: new AbilityCommand(
            piece,
            hydrateHexDTO(action.target),
            action.ability,
            this.context
          ),
        };
      }
      case "PASS":
        return { ok: true, command: new PassCommand(this.context) };
      default:
        return { ok: false, error: "Unknown online action type." };
    }
  }

  private getOwnedPieceAt(hexDTO: { q: number; r: number; s: number }, color: Color) {
    const piece = this.state.pieceMap.getByKey(`${hexDTO.q},${hexDTO.r},${hexDTO.s}`);
    return piece?.color === color ? piece : null;
  }
}
