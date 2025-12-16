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
 * GameEngine: Central state machine for the Castles game.
 * 
 * Responsibilities:
 * - Validates logical state transitions (Move, Attack, Recruit).
 * - Enforces phase cycle (Movement -> Attack -> Castles) and turn order.
 * - Computes legal actions based on piece capabilities and board topology.
 * - Determines victory conditions (Monarch Capture, Castle Control).
 * 
 * Architecture:
 * Purely functional core. Takes current `GameState` and action parameters,
 * returns a new `GameState` without mutation.
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
    // We pass the Set of ALL board hexes because they threaten everything around them
    return enemyMeleePieces
      .flatMap((piece) => piece.legalAttacks(this.board.hexSet));
  }

  // This method calculates legal moves for a specific piece
  public getLegalMoves(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    const phase = this.getTurnPhase(turnCounter);
    if (piece && phase === "Movement" && piece.canMove) {
        const blockedSet = this.getBlockedHexSet(pieces, castles);
        return piece.legalmoves(blockedSet, piece.color);
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
                .legalAttacks(attackableSet)
                .filter(
                  (hex) =>
                    !defended.some((defendedHex) => defendedHex.equals(hex))
                );
          }
          return piece.legalAttacks(attackableSet);
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
    
    // Calculate defended hexes ONCE (fixes O(n²) issue)
    const defended = this.getDefendedHexes(pieces, currentPlayer);
    const defendedSet = new Set(defended.map(h => h.getKey()));
    
    return pieces
      .filter((piece) => piece.color === currentPlayer && piece.canAttack)
      .flatMap((piece) => {
        const attacks = piece.legalAttacks(attackableSet);
        
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
    
    if (state.turnCounter % PHASE_CYCLE_LENGTH === 1) {
       nextState = this.resetTurnFlags(nextState);
    }

    return nextState;
  }

  public applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex): GameState {
    const capturer = this.getCurrentPlayer(state.turnCounter);
    
    // Move the piece onto the castle
    const newPieces = state.pieces.map(p => {
        if (p === piece) {
            const newPiece = p.clone();
            newPiece.hex = targetHex;
            newPiece.canAttack = false; // Consumes Attack action
            return newPiece;
        }
        return p;
    });

    // Transfer castle ownership to the capturing player
    const newCastles = state.Castles.map(c => {
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
        Castles: newCastles,
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

     // Check Death
     if (
        defenderClone.damage >= defenderClone.Strength ||
        (defenderClone.type === PieceType.Monarch && attackerClone.type === PieceType.Assassin)
      ) {
        // Defender dies
        newPieces = newPieces.filter((p) => p !== defenderClone);
        
        // Melee attackers move onto the captured hex
        if (
          attackerClone.AttackType === AttackType.Melee ||
          attackerClone.AttackType === AttackType.Swordsman
        ) {
          attackerClone.hex = defenderClone.hex;
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

  // =========== WIN CONDITION LOGIC ===========

  /**
   * Checks if the game has been won.
   * 
   * Victory conditions:
   * 1. Monarch Capture: Opponent's Monarch (king) has been captured
   * 2. Castle Control: Player controls all 6 castles on the board
   * 
   * @returns The winning player's color, or null if game is ongoing
   */
  public getWinner(pieces: Piece[], castles: Castle[]): Color | null {
    // Check for Monarch capture
    const monarchCaptureWinner = this.checkMonarchCapture(pieces);
    if (monarchCaptureWinner) return monarchCaptureWinner;

    // Check for castle control
    const castleControlWinner = this.checkCastleControl(pieces, castles);
    if (castleControlWinner) return castleControlWinner;

    return null;
  }

  /**
   * Checks if either player has lost their Monarch.
   * @returns The winning player (opponent of the player who lost their Monarch), or null
   */
  private checkMonarchCapture(pieces: Piece[]): Color | null {
    const whiteMonarch = pieces.find(p => p.type === PieceType.Monarch && p.color === 'w');
    const blackMonarch = pieces.find(p => p.type === PieceType.Monarch && p.color === 'b');

    // If white's monarch is gone, black wins
    if (!whiteMonarch) return 'b';
    
    // If black's monarch is gone, white wins
    if (!blackMonarch) return 'w';
    
    return null;
  }

  /**
   * Checks if either player controls all castles.
   * 
   * Control rules:
   * - A player controls their OWN castles by default (castle.color === player)
   * - A player controls an ENEMY castle if they have a piece ON it (captured)
   * 
   * @returns The winning player who controls all castles, or null
   */
  private checkCastleControl(pieces: Piece[], castles: Castle[]): Color | null {
    const controlledByWhite = castles.filter(castle => 
      this.playerControlsCastle(castle, pieces, 'w')
    ).length;

    const controlledByBlack = castles.filter(castle => 
      this.playerControlsCastle(castle, pieces, 'b')
    ).length;

    const totalCastles = castles.length;

    // Player must control ALL castles to win
    if (controlledByWhite === totalCastles) return 'w';
    if (controlledByBlack === totalCastles) return 'b';

    return null;
  }

  /**
   * Checks if a specific player controls a castle.
   * Uses the castle's `owner` property which tracks persistent ownership.
   * 
   * @param castle - The castle to check
   * @param _pieces - Unused (kept for signature compatibility)
   * @param player - The player to check control for
   * @returns true if player controls this castle
   */
  private playerControlsCastle(castle: Castle, _pieces: Piece[], player: Color): boolean {
    return castle.owner === player;
  }

  /**
   * Returns a human-readable description of the victory.
   */
  public getVictoryMessage(pieces: Piece[], castles: Castle[]): string | null {
    const winner = this.getWinner(pieces, castles);
    if (!winner) return null;

    const winnerName = winner === 'w' ? 'White' : 'Black';
    
    // Determine victory type
    if (this.checkMonarchCapture(pieces)) {
      return `${winnerName} wins by capturing the Monarch!`;
    }
    
    if (this.checkCastleControl(pieces, castles)) {
      return `${winnerName} wins by controlling all castles!`;
    }

    return `${winnerName} wins!`;
  }
}
