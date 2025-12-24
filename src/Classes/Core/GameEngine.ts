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
import { MoveTree } from "./MoveTree";
import {
  Color,
  TurnPhase,
  MoveRecord,
  HistoryEntry,
  PieceType,
  AbilityType,
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
  moveTree: MoveTree; // Mandatory for history and variation tracking
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

  public activateAbility(gameState: GameState, sourceHex: Hex, targetHex: Hex, ability: AbilityType): GameState {
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

  public getOccupiedHexes(gameState: GameState): Hex[] {
    return RuleEngine.getOccupiedHexes(gameState);
  }

  public getBlockedHexes(gameState: GameState): Hex[] {
    return RuleEngine.getBlockedHexes(gameState, this.board);
  }

  public getBlockedHexSet(gameState: GameState): Set<string> {
    return RuleEngine.getBlockedHexSet(gameState, this.board);
  }
  
  public getEnemyHexes(gameState: GameState, currentPlayer: Color): Hex[] {
    return RuleEngine.getEnemyHexes(gameState, currentPlayer);
  }

  public getEnemyCastleHexes(gameState: GameState, currentPlayer: Color): Hex[] {
    return RuleEngine.getEnemyCastleHexes(gameState, currentPlayer);
  }

  public getAttackableHexes(gameState: GameState, currentPlayer: Color): Hex[] {
    return RuleEngine.getAttackableHexes(gameState, currentPlayer);
  }

  public getDefendedHexes(gameState: GameState, currentPlayer: Color): Hex[] {
    return RuleEngine.getDefendedHexes(gameState, currentPlayer, this.board);
  }

  // ================= LEGAL ACTIONS (Delegated to RuleEngine) =================

  public getLegalMoves(gameState: GameState, piece: Piece | null): Hex[] {
    return RuleEngine.getLegalMoves(piece, gameState, this.board);
  }

  public getLegalAttacks(gameState: GameState, piece: Piece | null): Hex[] {
    return RuleEngine.getLegalAttacks(piece, gameState, this.board);
  }

  public getFutureLegalAttacks(gameState: GameState): Hex[] {
    return RuleEngine.getFutureLegalAttacks(gameState, this.board);
  }

  public hasAnyFutureLegalAttacks(gameState: GameState): boolean {
    return RuleEngine.hasAnyFutureLegalAttacks(gameState, this.board);
  }

  public castleIsControlledByActivePlayer(castle: Castle, gameState: GameState): boolean {
      const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    return RuleEngine.castleIsControlledByActivePlayer(castle, currentPlayer);
  }

  public getControlledCastlesActivePlayer(gameState: GameState): Castle[] {
    return RuleEngine.getControlledCastlesActivePlayer(gameState);
  }

  public hasAnyFutureControlledCastles(gameState: GameState): boolean {
    return RuleEngine.hasAnyFutureControlledCastles(gameState);
  }

  public getFutureControlledCastlesActivePlayer(gameState: GameState): Castle[] {
    return RuleEngine.getFutureControlledCastlesActivePlayer(gameState);
  }

  public getRecruitmentHexes(gameState: GameState): Hex[] {
    return RuleEngine.getRecruitmentHexes(gameState, this.board);
  }

  // ================= TURN MANAGEMENT HELPER =================

  public getTurnCounterIncrement(gameState: GameState): number {
    return RuleEngine.getTurnCounterIncrement(gameState, this.board);
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
