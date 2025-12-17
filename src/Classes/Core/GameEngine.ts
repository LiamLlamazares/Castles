/**
 * @file GameEngine.ts
 * @description Central game state machine for the Castles game.
 *
 * This is the **Facade** pattern implementation that provides a unified
 * interface to the game logic subsystems:
 * - **RuleEngine** (Queries): Legal moves, attacks, blocked hexes, etc.
 * - **StateMutator** (Mutations): Apply moves, attacks, recruitment, etc.
 *
 * GameEngine owns the Board dependency and passes it to subsystems as needed.
 *
 * @usage Instantiated by `useGameLogic` hook with a Board instance.
 * @see RuleEngine - Pure query functions for game rules
 * @see StateMutator - Pure state transition functions
 * @see useGameLogic - React hook that manages GameEngine and game state
 */
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Sanctuary } from "../Entities/Sanctuary";
import { Hex } from "../Entities/Hex";
import { Board } from "./Board";
import { TurnManager } from "./TurnManager";
import { WinCondition } from "../Systems/WinCondition";
import { PieceMap } from "../../utils/PieceMap";
import { RuleEngine } from "../Systems/RuleEngine";
import { StateMutator } from "../Systems/StateMutator";
import { SanctuaryService } from "../Services/SanctuaryService";
import {
  Color,
  TurnPhase,
  MoveRecord,
  HistoryEntry,
  PieceType,
} from "../../Constants";

// Phoenix Rebirth Record
export interface PhoenixRecord {
    respawnTurn: number;
    owner: Color;
}

/**
 * Represents the complete state of a game at any point.
 * Used for state transitions and history tracking.
 */
export interface GameState {
  pieces: Piece[];
  pieceMap: PieceMap; // O(1) lookup
  castles: Castle[];
  sanctuaries: Sanctuary[]; // Special piece sanctuaries
  turnCounter: number;
  movingPiece: Piece | null;
  history: HistoryEntry[];
  moveHistory: MoveRecord[];
  graveyard: Piece[]; // Captured pieces eligible for revival
  phoenixRecords: PhoenixRecord[]; // Active rebirth timers
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

  // ================= SANCTUARY (Delegated to SanctuaryService) =================

  public canPledge(gameState: GameState, sanctuaryHex: Hex): boolean {
    return SanctuaryService.canPledge(gameState, sanctuaryHex);
  }

  public pledge(gameState: GameState, sanctuaryHex: Hex, spawnHex: Hex): GameState {
    return SanctuaryService.pledge(gameState, sanctuaryHex, spawnHex);
  }

  public activateAbility(gameState: GameState, sourceHex: Hex, targetHex: Hex, ability: "Fireball" | "Teleport" | "RaiseDead"): GameState {
      // Validation delegated to RuleEngine? Or keep simple for now.
      // 1. Source existence
      const source = gameState.pieceMap.getByKey(sourceHex.getKey());
      if (!source || source.type !== PieceType.Wizard && source.type !== PieceType.Necromancer) throw new Error("Invalid source for ability");
      
      // 2. Cooldown check
      if (source.abilityUsed) throw new Error("Ability already used");

      return StateMutator.activateAbility(gameState, source, targetHex, ability, this.board);
  }



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
