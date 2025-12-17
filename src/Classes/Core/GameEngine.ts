import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { Board } from "./Board";
import { TurnManager } from "./TurnManager";
import { WinCondition } from "../Systems/WinCondition";
import { PieceMap } from "../../utils/PieceMap";
import { RuleEngine } from "../Systems/RuleEngine";
import { StateMutator } from "../Systems/StateMutator";
import {
  Color,
  TurnPhase,
  MoveRecord,
  HistoryEntry,
} from "../../Constants";

/**
 * Represents the complete state of a game at any point.
 * Used for state transitions and history tracking.
 */
export interface GameState {
  pieces: Piece[];
  pieceMap: PieceMap; // O(1) lookup
  castles: Castle[];
  turnCounter: number;
  movingPiece: Piece | null;
  history: HistoryEntry[];
  moveHistory: MoveRecord[];
}

/**
 * GameEngine: Central state machine for the Castles game.
 * 
 * Responsibilities:
 * - Facade for RuleEngine (Query) and StateMutator (Action).
 * - Maintains dependency on Board.
 */
export class GameEngine {
  constructor(public board: Board) {}

  // ================= DELEGATED METHODS =================

  public getTurnPhase(turnCounter: number): TurnPhase {
    return TurnManager.getTurnPhase(turnCounter);
  }

  public getCurrentPlayer(turnCounter: number): Color {
    return TurnManager.getCurrentPlayer(turnCounter);
  }

  public getWinner(pieces: Piece[], castles: Castle[]): Color | null {
    return WinCondition.getWinner(pieces, castles);
  }

  public getVictoryMessage(pieces: Piece[], castles: Castle[]): string | null {
    return WinCondition.getVictoryMessage(pieces, castles);
  }

  // ================= BOARD QUERIES (Delegated to RuleEngine) =================

  public getOccupiedHexes(pieces: Piece[]): Hex[] {
    return RuleEngine.getOccupiedHexes(pieces);
  }

  public getBlockedHexes(pieces: Piece[], castles: Castle[]): Hex[] {
    return RuleEngine.getBlockedHexes(pieces, castles, this.board);
  }

  public getBlockedHexSet(pieces: Piece[], castles: Castle[]): Set<string> {
    return RuleEngine.getBlockedHexSet(pieces, castles, this.board);
  }
  
  public getEnemyHexes(pieces: Piece[], currentPlayer: Color): Hex[] {
    return RuleEngine.getEnemyHexes(pieces, currentPlayer);
  }

  public getEnemyCastleHexes(castles: Castle[], pieces: Piece[], currentPlayer: Color): Hex[] {
    return RuleEngine.getEnemyCastleHexes(castles, pieces, currentPlayer);
  }

  public getAttackableHexes(pieces: Piece[], castles: Castle[], currentPlayer: Color): Hex[] {
    return RuleEngine.getAttackableHexes(pieces, castles, currentPlayer);
  }

  public getDefendedHexes(pieces: Piece[], currentPlayer: Color): Hex[] {
    return RuleEngine.getDefendedHexes(pieces, currentPlayer, this.board);
  }

  // ================= LEGAL ACTIONS (Delegated to RuleEngine) =================

  public getLegalMoves(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    return RuleEngine.getLegalMoves(piece, pieces, castles, turnCounter, this.board);
  }

  public getLegalAttacks(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    return RuleEngine.getLegalAttacks(piece, pieces, castles, turnCounter, this.board);
  }

  public getFutureLegalAttacks(pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    return RuleEngine.getFutureLegalAttacks(pieces, castles, turnCounter, this.board);
  }

  public hasAnyFutureLegalAttacks(pieces: Piece[], castles: Castle[], turnCounter: number): boolean {
    return RuleEngine.hasAnyFutureLegalAttacks(pieces, castles, turnCounter, this.board);
  }

  public castleIsControlledByActivePlayer(castle: Castle, pieces: Piece[], currentPlayer: Color): boolean {
    return RuleEngine.castleIsControlledByActivePlayer(castle, pieces, currentPlayer);
  }

  public getControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    return RuleEngine.getControlledCastlesActivePlayer(castles, pieces, turnCounter);
  }

  public hasAnyFutureControlledCastles(castles: Castle[], pieces: Piece[], turnCounter: number): boolean {
    return RuleEngine.hasAnyFutureControlledCastles(castles, pieces, turnCounter);
  }

  public getFutureControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    return RuleEngine.getFutureControlledCastlesActivePlayer(castles, pieces, turnCounter);
  }

  public getRecruitmentHexes(pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    return RuleEngine.getRecruitmentHexes(pieces, castles, turnCounter, this.board);
  }

  // ================= TURN MANAGEMENT HELPER =================

  public getTurnCounterIncrement(pieces: Piece[], castles: Castle[], turnCounter: number): number {
    return RuleEngine.getTurnCounterIncrement(pieces, castles, turnCounter, this.board);
  }

  // ================= STATE TRANSITIONS (Delegated to StateMutator) =================

  public applyMove(state: GameState, piece: Piece, targetHex: Hex): GameState {
    return StateMutator.applyMove(state, piece, targetHex, this.board);
  }

  public applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex): GameState {
    return StateMutator.applyCastleAttack(state, piece, targetHex, this.board);
  }

  public applyAttack(state: GameState, attacker: Piece, targetHex: Hex): GameState {
    return StateMutator.applyAttack(state, attacker, targetHex, this.board);
  }

  public passTurn(state: GameState): GameState {
    return StateMutator.passTurn(state, this.board);
  }

  public recruitPiece(state: GameState, castle: Castle, hex: Hex): GameState {
    return StateMutator.recruitPiece(state, castle, hex, this.board);
  }

  public resetTurnFlags(state: GameState): GameState {
    return StateMutator.resetTurnFlags(state);
  }
}
