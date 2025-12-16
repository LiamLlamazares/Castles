import { Piece } from "./Piece";
import { Castle } from "./Castle";
import { NotationService } from "./NotationService";
import { Hex } from "./Hex";
import { Board } from "./Board";
import { TurnManager } from "./TurnManager";
import { CombatSystem } from "./CombatSystem";
import { WinCondition } from "./WinCondition";
import {
  Color,
  AttackType,
  TurnPhase,
  DEFENDED_PIECE_IS_PROTECTED_RANGED,
  PieceType,
  PHASE_CYCLE_LENGTH,
  MoveRecord,
  HistoryEntry,
} from "../Constants";

/**
 * Represents the complete state of a game at any point.
 * Used for state transitions and history tracking.
 */
export interface GameState {
  pieces: Piece[];
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
 * - Validates logical state transitions (Move, Attack, Recruit).
 * - Enforces phase cycle using TurnManager.
 * - Computes legal actions based on piece capabilities and board topology.
 * - delegated victory conditions to WinCondition.
 * 
 * Architecture:
 * Purely functional core. Takes current `GameState` and action parameters,
 * returns a new `GameState` without mutation.
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

  // ================= BOARD QUERIES =================

  /** Returns all hexes currently occupied by pieces */
  public getOccupiedHexes(pieces: Piece[]): Hex[] {
    return pieces.map((piece) => piece.hex);
  }

  /**
   * Returns all hexes that block ground movement.
   * Includes: rivers, castles, and occupied hexes.
   */
  public getBlockedHexes(pieces: Piece[], castles: Castle[]): Hex[] {
    const occupied = this.getOccupiedHexes(pieces);
    return [
        ...this.board.riverHexes, 
        ...this.board.castleHexes, 
        ...occupied
    ];
  }

  /** Returns a Set of hex keys for O(1) blocked hex lookups */
  public getBlockedHexSet(pieces: Piece[], castles: Castle[]): Set<string> {
    const blockedHexes = this.getBlockedHexes(pieces, castles);
    return new Set(blockedHexes.map(hex => hex.getKey()));
  }
  
  public getEnemyHexes(pieces: Piece[], currentPlayer: Color): Hex[] {
    return pieces
      .filter((piece) => piece.color !== currentPlayer)
      .map((piece) => piece.hex);
  }

  public getEnemyCastleHexes(castles: Castle[], currentPlayer: Color): Hex[] {
    return castles.filter(
      (castle) => castle.color !== currentPlayer
    ).map((castle) => castle.hex);
  }

  public getAttackableHexes(pieces: Piece[], castles: Castle[], currentPlayer: Color): Hex[] {
    return [...this.getEnemyHexes(pieces, currentPlayer), ...this.getEnemyCastleHexes(castles, currentPlayer)];
  }

  /**
   * Returns hexes that are protected from ranged attacks.
   * These are hexes adjacent to enemy melee pieces.
   */
  public getDefendedHexes(pieces: Piece[], currentPlayer: Color): Hex[] {
    if (!DEFENDED_PIECE_IS_PROTECTED_RANGED) return [];
    
    const enemyMeleePieces = pieces.filter(
      (piece) =>
        piece.color !== currentPlayer &&
        piece.AttackType === AttackType.Melee
    );
    
    // Enemy melee pieces "defend" all hexes they can attack
    return enemyMeleePieces
      .flatMap((piece) => piece.legalAttacks(this.board.hexSet, this.board.highGroundHexSet));
  }

  // ================= LEGAL ACTIONS =================

  // This method calculates legal moves for a specific piece
  public getLegalMoves(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    const phase = this.getTurnPhase(turnCounter);
    if (piece && phase === "Movement" && piece.canMove) {
        const blockedSet = this.getBlockedHexSet(pieces, castles);
        return piece.legalmoves(blockedSet, piece.color, this.board.hexSet);
    }
    return [];
  }

  public getLegalAttacks(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
      const phase = this.getTurnPhase(turnCounter);
      const currentPlayer = this.getCurrentPlayer(turnCounter);

      if (piece && phase === "Attack" && piece.canAttack) {
          const attackable = this.getAttackableHexes(pieces, castles, currentPlayer);
          const attackableSet = new Set(attackable.map(h => h.getKey()));
          
          if (piece.AttackType === AttackType.Ranged) {
              const defended = this.getDefendedHexes(pieces, currentPlayer);
              return piece
                .legalAttacks(attackableSet, this.board.highGroundHexSet)
                .filter(
                  (hex) =>
                    !defended.some((defendedHex) => defendedHex.equals(hex))
                );
          }
          return piece.legalAttacks(attackableSet, this.board.highGroundHexSet);
      }
      return [];
  }

  /**
   * Returns all hexes that the current player could attack with any of their pieces.
   * Used for turn skip logic (skip attack phase if no legal attacks exist).
   */
  public getFutureLegalAttacks(pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    const attackable = this.getAttackableHexes(pieces, castles, currentPlayer);
    const attackableSet = new Set(attackable.map(h => h.getKey()));
    
    // Calculate defended hexes ONCE
    const defended = this.getDefendedHexes(pieces, currentPlayer);
    const defendedSet = new Set(defended.map(h => h.getKey()));
    
    return pieces
      .filter((piece) => piece.color === currentPlayer && piece.canAttack)
      .flatMap((piece) => {
        const attacks = piece.legalAttacks(attackableSet, this.board.highGroundHexSet);
        
        // Ranged pieces can't attack defended hexes
        if (piece.AttackType === AttackType.Ranged || piece.AttackType === AttackType.LongRanged) {
          return attacks.filter(hex => !defendedSet.has(hex.getKey()));
        }
        return attacks;
      });
  }

  public castleIsControlledByActivePlayer(castle: Castle, _pieces: Piece[], currentPlayer: Color): boolean {
    return castle.owner === currentPlayer;
  }

  public getControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    const phase = this.getTurnPhase(turnCounter);
    return castles.filter((castle) => {
      if (phase !== "Castles") return false;
      return (
        this.castleIsControlledByActivePlayer(castle, pieces, currentPlayer) &&
        castle.color !== currentPlayer
      );
    });
  }

  public getFutureControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    return castles.filter((castle) => {
      // Logic from Game.tsx: similar to above but without phase check?
      return (
        this.castleIsControlledByActivePlayer(castle, pieces, currentPlayer) &&
        castle.color !== currentPlayer
      );
    });
  }

  /**
   * Returns all hexes where a new piece can be recruited.
   * Logic: Adjacent to a controlled, unused castle, and not occupied.
   */
  public getRecruitmentHexes(pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
     const occupiedSet = new Set(this.getOccupiedHexes(pieces).map(h => h.getKey()));
     const controlledCastles = this.getControlledCastlesActivePlayer(castles, pieces, turnCounter);
     
     const recruitmentHexes: Hex[] = [];
     const processedHexKeys = new Set<string>();

     for (const castle of controlledCastles) {
        if (castle.used_this_turn) continue;

        const adjacentHexes = castle.hex.cubeRing(1);
        for (const hex of adjacentHexes) {
           const key = hex.getKey();
           // Must be a valid board hex, not occupied, and not already added
           if (this.board.hexSet.has(key) && !occupiedSet.has(key) && !processedHexKeys.has(key)) {
              recruitmentHexes.push(hex);
              processedHexKeys.add(key);
           }
        }
     }
     return recruitmentHexes;
  }

  // ================= TURN MANAGEMENT HELPER =================

  /**
   * Delegates the complex turn increment logic to TurnManager,
   * passing in the necessary calculated booleans.
   */
  public getTurnCounterIncrement(pieces: Piece[], castles: Castle[], turnCounter: number): number {
    const futureAttacks = this.getFutureLegalAttacks(pieces, castles, turnCounter);
    const hasFutureAttacks = futureAttacks.length > 0;
    
    const futureControlledCastles = this.getFutureControlledCastlesActivePlayer(castles, pieces, turnCounter);
    const hasFutureControlledCastles = futureControlledCastles.length > 0;

    const currentPlayer = this.getCurrentPlayer(turnCounter);
    
    // Check if castles are usable in the current Castles phase
    const unusedControlledCastles = castles.filter(
        (castle) =>
          this.castleIsControlledByActivePlayer(castle, pieces, currentPlayer) &&
          !castle.used_this_turn
    );
    const hasUsableCastles = unusedControlledCastles.length > 0;

    return TurnManager.getTurnCounterIncrement(
        turnCounter,
        hasFutureAttacks,
        hasFutureControlledCastles,
        hasUsableCastles
    );
  }

  // ================= STATE TRANSITIONS =================

  public applyMove(state: GameState, piece: Piece, targetHex: Hex): GameState {
    const notation = NotationService.getMoveNotation(piece, targetHex);

    const record: MoveRecord = {
        notation,
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
        color: this.getCurrentPlayer(state.turnCounter),
        phase: this.getTurnPhase(state.turnCounter)
    };

    const newMoveHistory = [...(state.moveHistory || []), record];

    const newPieces = state.pieces.map(p => {
        if (p === piece) {
            const newPiece = p.clone(); // Clone to avoid mutation
            newPiece.hex = targetHex;
            newPiece.canMove = false;
            return newPiece;
        }
        return p;
    });

    const newTurnCounter = state.turnCounter + this.getTurnCounterIncrement(newPieces, state.castles, state.turnCounter);
    
    let nextState: GameState = {
        ...state,
        pieces: newPieces,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    };
    
    if (state.turnCounter % PHASE_CYCLE_LENGTH === 1) {
       nextState = this.resetTurnFlags(nextState);
    }

    return nextState;
  }

  public applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex): GameState {
    const castle = state.castles.find(c => c.hex.equals(targetHex));
    const notation = castle 
        ? NotationService.getCastleCaptureNotation(piece, castle)
        : NotationService.getMoveNotation(piece, targetHex);
    
    const record: MoveRecord = {
        notation,
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
        color: this.getCurrentPlayer(state.turnCounter),
        phase: this.getTurnPhase(state.turnCounter)
    };

    const newMoveHistory = [...(state.moveHistory || []), record];
    const capturer = this.getCurrentPlayer(state.turnCounter);
    
    // Move the piece onto the castle AND consume attack
    const newPieces = state.pieces.map(p => {
        if (p === piece) {
            const newPiece = p.clone();
            newPiece.hex = targetHex;
            newPiece.canAttack = false; // Consumes Attack action
            // Note: Does it consume Move too? Original only said canAttack = false.
            return newPiece;
        }
        return p;
    });

    // Transfer castle ownership
    const newCastles = state.castles.map(c => {
        if (c.hex.equals(targetHex)) {
            const newCastle = c.clone();
            newCastle.owner = capturer;
            return newCastle;
        }
        return c;
    });

    const newTurnCounter = state.turnCounter + this.getTurnCounterIncrement(newPieces, newCastles, state.turnCounter);
    
    return {
        ...state,
        pieces: newPieces,
        castles: newCastles,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    };
  }

  public applyAttack(state: GameState, attacker: Piece, targetHex: Hex): GameState {
     const notation = NotationService.getAttackNotation(attacker, targetHex);
     
     const record: MoveRecord = {
        notation,
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
        color: this.getCurrentPlayer(state.turnCounter),
        phase: this.getTurnPhase(state.turnCounter)
    };

     const newMoveHistory = [...(state.moveHistory || []), record];

     // Use CombatSystem to resolve the logic
     const result = CombatSystem.resolveAttack(state.pieces, attacker, targetHex);

     const increment = this.getTurnCounterIncrement(result.pieces, state.castles, state.turnCounter);
      
     return {
          ...state,
          pieces: result.pieces,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory
     };
  }

  public passTurn(state: GameState): GameState {
      // User requested NO history for Pass
      const increment = this.getTurnCounterIncrement(state.pieces, state.castles, state.turnCounter);
      return {
          ...state,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
      };
  }

  public recruitPiece(state: GameState, castle: Castle, hex: Hex): GameState {
      const pieceTypes = Object.values(PieceType);
      const pieceType = pieceTypes[castle.turns_controlled % pieceTypes.length];
      
      const notation = NotationService.getRecruitNotation(castle, pieceType, hex);
      
      const record: MoveRecord = {
        notation,
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
        color: this.getCurrentPlayer(state.turnCounter),
        phase: this.getTurnPhase(state.turnCounter)
      };

      const newMoveHistory = [...(state.moveHistory || []), record];
      
      const newPiece = new Piece(hex, this.getCurrentPlayer(state.turnCounter), pieceType);
      
      const newPieces = [...state.pieces, newPiece];
      
      // Update Castle
      const newCastles = state.castles.map(c => {
          if (c === castle) {
              const newCastle = c.clone();
              newCastle.turns_controlled += 1;
              newCastle.used_this_turn = true;
              return newCastle;
          }
          return c;
      });

      const increment = this.getTurnCounterIncrement(newPieces, newCastles, state.turnCounter);

      return {
          ...state,
          pieces: newPieces,
          castles: newCastles,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory
      };
  }

  private resetTurnFlags(state: GameState): GameState {
      const newPieces = state.pieces.map(p => {
          const pc = p.clone();
          pc.canMove = true;
          pc.canAttack = true;
          pc.damage = 0;
          return pc;
      });
      const newCastles = state.castles.map(c => {
          const cc = c.clone();
          cc.used_this_turn = false;
          return cc;
      });
      return {
          ...state,
          pieces: newPieces,
          castles: newCastles
      };
  }
}
