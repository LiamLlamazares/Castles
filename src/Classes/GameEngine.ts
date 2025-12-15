import { Piece } from "./Piece";
import { Castle } from "./Castle";
import { Hex } from "./Hex";
import { Board } from "./Board";
import {
  Color,
  AttackType,
  TurnPhase,
  DEFENDED_PIECE_IS_PROTECTED_RANGED,
  PieceType,
  PHASE_CYCLE_LENGTH,
  PLAYER_CYCLE_LENGTH,
  MOVEMENT_PHASE_END,
  ATTACK_PHASE_END,
  HistoryEntry,
} from "../Constants";

/**
 * Represents the complete state of a game at any point.
 * Used for state transitions and history tracking.
 */
export interface GameState {
  pieces: Piece[];
  Castles: Castle[];
  turnCounter: number;
  movingPiece: Piece | null;
  history: HistoryEntry[];
}

/**
 * GameEngine: The "rulebook" for the Castles game.
 * 
 * Handles all game logic including:
 * - Turn phase determination (Movement → Attack → Castles)
 * - Legal move/attack calculation
 * - State transitions (applying moves, attacks, recruits)
 * - Win condition checking (future: not yet implemented)
 * 
 * The engine is stateless - it takes game state as input and returns
 * new state as output, making it easy to test and reason about.
 */
export class GameEngine {
  constructor(public board: Board) {}

  /**
   * Determines the current turn phase based on the turn counter.
   * Each player's turn consists of 5 sub-turns: Movement(0,1), Attack(2,3), Castles(4)
   */
  public getTurnPhase(turnCounter: number): TurnPhase {
    const phaseIndex = turnCounter % PHASE_CYCLE_LENGTH;
    if (phaseIndex < MOVEMENT_PHASE_END) return "Movement";
    if (phaseIndex < ATTACK_PHASE_END) return "Attack";
    return "Castles";
  }

  /**
   * Determines which player's turn it is based on the turn counter.
   * White plays turns 0-4, Black plays turns 5-9, then cycles.
   */
  public getCurrentPlayer(turnCounter: number): Color {
    return turnCounter % PLAYER_CYCLE_LENGTH < PHASE_CYCLE_LENGTH ? "w" : "b";
  }

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
      .flatMap((piece) => piece.legalAttacks(this.board.hexes));
  }

  // This method calculates legal moves for a specific piece
  public getLegalMoves(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    const phase = this.getTurnPhase(turnCounter);
    if (piece && phase === "Movement" && piece.canMove) {
        const blocked = this.getBlockedHexes(pieces, castles);
        return piece.legalmoves(blocked, piece.color);
    }
    return [];
  }

  public getLegalAttacks(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
      const phase = this.getTurnPhase(turnCounter);
      const currentPlayer = this.getCurrentPlayer(turnCounter);

      if (piece && phase === "Attack" && piece.canAttack) {
          const attackable = this.getAttackableHexes(pieces, castles, currentPlayer);
          
          if (piece.AttackType === AttackType.Ranged) {
              const defended = this.getDefendedHexes(pieces, currentPlayer);
              return piece
                .legalAttacks(attackable)
                .filter(
                  (hex) =>
                    !defended.some((defendedHex) => defendedHex.equals(hex))
                );
          }
          return piece.legalAttacks(attackable);
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
    
    // Calculate defended hexes ONCE (fixes O(n²) issue)
    const defended = this.getDefendedHexes(pieces, currentPlayer);
    const defendedSet = new Set(defended.map(h => h.getKey()));
    
    return pieces
      .filter((piece) => piece.color === currentPlayer && piece.canAttack)
      .flatMap((piece) => {
        const attacks = piece.legalAttacks(attackable);
        
        // Ranged pieces can't attack defended hexes
        if (piece.AttackType === AttackType.Ranged || piece.AttackType === AttackType.LongRanged) {
          return attacks.filter(hex => !defendedSet.has(hex.getKey()));
        }
        return attacks;
      });
  }

  public castleIsControlledByActivePlayer(castle: Castle, pieces: Piece[], currentPlayer: Color): boolean {
    const piece = pieces.find((piece) =>
      piece.hex.equals(castle.hex)
    );
    return (
      !!piece &&
      piece.color !== castle.color &&
      castle.color !== currentPlayer
    );
  }

  public getControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    const phase = this.getTurnPhase(turnCounter);
    return castles.filter((castle) => {
      if (phase !== "Castles") return false;
      return this.castleIsControlledByActivePlayer(castle, pieces, currentPlayer);
    });
  }

  public getFutureControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    return castles.filter((castle) => {
      // Logic from Game.tsx: similar to above but without phase check?
      // Game.tsx:191 uses same condition without phase check.
      return this.castleIsControlledByActivePlayer(castle, pieces, currentPlayer);
    });
  }

  /**
   * Calculates how many turn counter steps to advance based on available actions.
   * 
   * The turn counter cycles through phases (0-4 per player):
   * - 0,1 = Movement (two sub-turns)
   * - 2,3 = Attack (two sub-turns)  
   * - 4   = Castles (one sub-turn)
   * 
   * When a player has no legal actions remaining in future phases,
   * we skip ahead to avoid pointless empty turns.
   * 
   * @returns Number of turn counter steps to advance (0-4)
   */
  public getTurnCounterIncrement(pieces: Piece[], castles: Castle[], turnCounter: number): number {
    const futureAttacks = this.getFutureLegalAttacks(pieces, castles, turnCounter);
    const hasFutureAttacks = futureAttacks.length > 0;
    
    const futureControlledCastles = this.getFutureControlledCastlesActivePlayer(castles, pieces, turnCounter);
    const hasFutureControlledCastles = futureControlledCastles.length > 0;
    
    const phase = this.getTurnPhase(turnCounter);
    const phasePosition = turnCounter % PHASE_CYCLE_LENGTH; // 0-4 within current player's turn

    // MOVEMENT PHASE: After first movement turn (position 1)
    if (phasePosition === 1) {
      if (!hasFutureAttacks && !hasFutureControlledCastles) {
        // Skip Attack (2 turns) + Castles (1 turn) = +4 to next player
        return 4;
      }
      if (!hasFutureAttacks && hasFutureControlledCastles) {
        // Skip Attack phase only = +3 to Castles
        return 3;
      }
    }

    // ATTACK PHASE: After first attack turn (position 2)
    if (phasePosition === 2) {
      if (!hasFutureAttacks && !hasFutureControlledCastles) {
        // Skip second attack + Castles = +3 to next player
        return 3;
      }
      if (!hasFutureAttacks && hasFutureControlledCastles) {
        // Skip second attack only = +2 to Castles
        return 2;
      }
    }

    // ATTACK PHASE: After second attack turn (position 3)
    if (phasePosition === 3 && !hasFutureControlledCastles) {
      // Skip Castles phase = +2 to next player
      return 2;
    }

    // CASTLES PHASE: Check if any controlled castles remain usable
    if (phase === "Castles") {
      const currentPlayer = this.getCurrentPlayer(turnCounter);
      const unusedControlledCastles = castles.filter(
        (castle) =>
          this.castleIsControlledByActivePlayer(castle, pieces, currentPlayer) &&
          !castle.used_this_turn
      );
      
      if (unusedControlledCastles.length === 0) {
        // All castles used or none controlled - advance to next player
        return 1;
      }
      // Still have castles to use - stay in Castles phase
      return 0;
    }

    // Default: advance one turn counter step
    return 1;
  }

  // State Transition Methods
  public applyMove(state: GameState, piece: Piece, targetHex: Hex): GameState {
    const newPieces = state.pieces.map(p => {
        if (p === piece) {
            const newPiece = p.clone(); // Clone to avoid mutation
            newPiece.hex = targetHex;
            newPiece.canMove = false;
            return newPiece;
        }
        return p;
    });

    const newTurnCounter = state.turnCounter + this.getTurnCounterIncrement(newPieces, state.Castles, state.turnCounter);
    
    let nextState: GameState = {
        ...state,
        pieces: newPieces,
        movingPiece: null,
        turnCounter: newTurnCounter
    };
    
    if (state.turnCounter % 5 === 1) {
       nextState = this.resetTurnFlags(nextState);
    }

    return nextState;
  }

  public applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex): GameState {
    const newPieces = state.pieces.map(p => {
        if (p === piece) {
            const newPiece = p.clone();
            newPiece.hex = targetHex;
            newPiece.canAttack = false; // Consumes Attack action
            // Note: We do NOT set canMove=false (it might already be), but this is Attack phase.
            return newPiece;
        }
        return p;
    });

    const newTurnCounter = state.turnCounter + this.getTurnCounterIncrement(newPieces, state.Castles, state.turnCounter);
    
    return {
        ...state,
        pieces: newPieces,
        movingPiece: null,
        turnCounter: newTurnCounter
    };
  }

  public applyAttack(state: GameState, attacker: Piece, targetHex: Hex): GameState {
     const defender = state.pieces.find(p => p.hex.equals(targetHex));
     if (!defender) return state; // Should not happen if legal

     // Combat Logic
     // We need new copies of pieces involved
     let newPieces = state.pieces.map(p => p.clone());
     const attackerClone = newPieces.find(p => p.hex.equals(attacker.hex))!;
     const defenderClone = newPieces.find(p => p.hex.equals(defender.hex))!;

     defenderClone.damage += attackerClone.Strength;
     
      let _attackerMoved = false;

     // Check Death
     if (
        defenderClone.damage >= defenderClone.Strength ||
        (defenderClone.type === PieceType.Monarch && attackerClone.type === PieceType.Assassin)
      ) {
        // Defender dies
        newPieces = newPieces.filter((p) => p !== defenderClone);
        
        if (
          attackerClone.AttackType === AttackType.Melee ||
          attackerClone.AttackType === AttackType.Swordsman
        ) {
          // Move attacker to defender hex
          attackerClone.hex = defenderClone.hex;
          _attackerMoved = true;
        }
      }

      attackerClone.canAttack = false;

      const increment = this.getTurnCounterIncrement(newPieces, state.Castles, state.turnCounter);
      
      const nextState: GameState = {
          ...state,
          pieces: newPieces,
          movingPiece: null,
          turnCounter: state.turnCounter + increment
      };
      
      return nextState;
  }

  public passTurn(state: GameState): GameState {
      // Logic from Game.tsx:178
      // It calls getTurnCounterIncrement.
      const increment = this.getTurnCounterIncrement(state.pieces, state.Castles, state.turnCounter);
      return {
          ...state,
          movingPiece: null,
          turnCounter: state.turnCounter + increment
      };
  }

  public recruitPiece(state: GameState, castle: Castle, hex: Hex): GameState {
      // Logic from Game.tsx:342
      const pieceTypes = Object.values(PieceType);
      const pieceType = pieceTypes[castle.turns_controlled % pieceTypes.length];
      const newPiece = new Piece(hex, this.getCurrentPlayer(state.turnCounter), pieceType);
      
      const newPieces = [...state.pieces, newPiece]; // Shallow copy of array, but new piece
      
      // Update Castle
      const newCastles = state.Castles.map(c => {
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
          Castles: newCastles,
          movingPiece: null,
          turnCounter: state.turnCounter + increment
      };
  }

  // Helper to reset flags (originally in Game.tsx:292)
  private resetTurnFlags(state: GameState): GameState {
      const newPieces = state.pieces.map(p => {
          const pc = p.clone();
          pc.canMove = true;
          pc.canAttack = true;
          pc.damage = 0;
          return pc;
      });
      const newCastles = state.Castles.map(c => {
          const cc = c.clone();
          cc.used_this_turn = false;
          return cc;
      });
      return {
          ...state,
          pieces: newPieces,
          Castles: newCastles
      };
  }
}
