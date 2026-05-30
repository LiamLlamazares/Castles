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
import { PieceType, Color } from "../Constants";
import {
  createInitialStateFromSetupDTO,
  hydrateHexDTO,
  serializeGameState,
} from "./serialization";
import {
  OnlineActionDTO,
  OnlineActionResult,
  OnlineGameResultDTO,
  OnlineGameSetupDTO,
  OnlineGameSnapshotDTO,
  OnlineReject,
} from "./types";

export interface OnlineGameRoomCreateInput {
  setup: OnlineGameSetupDTO;
  gameId: string;
  whiteToken: string;
  blackToken: string;
  acceptedActions?: OnlineActionDTO[];
  result?: OnlineGameResultDTO;
}

export interface OnlineGameRoomRecord {
  gameId: string;
  whiteToken: string;
  blackToken: string;
  setup: OnlineGameSetupDTO;
  acceptedActions: OnlineActionDTO[];
  result?: OnlineGameResultDTO;
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
  private acceptedActions: OnlineActionDTO[];
  private result?: OnlineGameResultDTO;

  private constructor(
    private readonly setup: OnlineGameSetupDTO,
    private readonly gameId: string,
    private readonly whiteToken: string,
    private readonly blackToken: string
  ) {
    const hydrated = createInitialStateFromSetupDTO(setup);
    this.state = hydrated.state;
    this.context = {
      gameEngine: hydrated.gameEngine,
      board: hydrated.board,
    };
    this.acceptedActions = [];
  }

  static create(input: OnlineGameRoomCreateInput): OnlineGameRoom {
    const room = new OnlineGameRoom(
      input.setup,
      input.gameId,
      input.whiteToken,
      input.blackToken
    );

    for (const action of input.acceptedActions ?? []) {
      const token = room.tokenForColor(
        room.context.gameEngine.getCurrentPlayer(room.state.turnCounter)
      );
      const result = room.submitAction(token, action, { replaying: true });
      if (!result.ok) {
        throw new Error(`Could not replay online action: ${result.error.message}`);
      }
    }

    room.result = input.result;
    return room;
  }

  authenticate(token: string): Color | null {
    if (token === this.whiteToken) return "w";
    if (token === this.blackToken) return "b";
    return null;
  }

  get version(): number {
    return this.acceptedActions.length;
  }

  getSnapshot(): OnlineGameSnapshotDTO {
    const engineWinner = this.context.gameEngine.getWinner(
      this.state.pieces,
      this.state.castles,
      this.state.victoryPoints
    );
    const result =
      this.result ??
      (engineWinner
        ? ({ winner: engineWinner, reason: "monarch_captured" } as const)
        : undefined);

    return {
      gameId: this.gameId,
      version: this.version,
      setup: this.setup,
      state: serializeGameState(this.state),
      moveHistory: this.state.moveTree.getHistoryLine(),
      playerToMove: this.context.gameEngine.getCurrentPlayer(this.state.turnCounter),
      turnPhase: this.context.gameEngine.getTurnPhase(this.state.turnCounter),
      result,
    };
  }

  submitAction(
    token: string,
    action: OnlineActionDTO,
    options: { replaying?: boolean } = {}
  ): OnlineActionResult {
    const snapshot = this.getSnapshot();
    const color = this.authenticate(token);
    if (!color) {
      return reject(snapshot, "unauthorized", "This player token is not valid.");
    }

    if (this.result) {
      return reject(snapshot, "game_over", "This game is already over.");
    }

    if (action.baseVersion !== this.version) {
      return reject(snapshot, "stale_action", "This action was made against an old game version.");
    }

    const activePlayer = this.context.gameEngine.getCurrentPlayer(this.state.turnCounter);
    if (action.type !== "RESIGN" && color !== activePlayer) {
      return reject(snapshot, "wrong_player", "It is not this player's turn.");
    }

    if (action.type === "RESIGN") {
      this.result = { winner: opposite(color), reason: "resignation" };
      this.accept(action, options);
      return { ok: true, snapshot: this.getSnapshot() };
    }

    if (action.type === "PROMOTE") {
      return this.submitPromotion(color, action, options);
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

    this.state = result.newState;
    this.accept(action, options);
    return { ok: true, snapshot: this.getSnapshot() };
  }

  toRecord(): OnlineGameRoomRecord {
    return {
      gameId: this.gameId,
      whiteToken: this.whiteToken,
      blackToken: this.blackToken,
      setup: this.setup,
      acceptedActions: [...this.acceptedActions],
      result: this.result,
    };
  }

  private tokenForColor(color: Color): string {
    return color === "w" ? this.whiteToken : this.blackToken;
  }

  private accept(action: OnlineActionDTO, options: { replaying?: boolean }): void {
    this.acceptedActions.push({ ...action, baseVersion: this.version });
    if (!options.replaying) return;
  }

  private submitPromotion(
    color: Color,
    action: Extract<OnlineActionDTO, { type: "PROMOTE" }>,
    options: { replaying?: boolean }
  ): OnlineActionResult {
    const snapshot = this.getSnapshot();
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

    this.state = nextState;
    this.accept(action, options);
    return { ok: true, snapshot: this.getSnapshot() };
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
