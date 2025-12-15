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

export interface GameState {
  pieces: Piece[];
  Castles: Castle[];
  turnCounter: number;
  movingPiece: Piece | null;
  history: HistoryEntry[];
}
// Rulebook for game: Can I move here? Is this a legal attack?...
export class GameEngine {
  constructor(public board: Board) {}

  public getTurnPhase(turnCounter: number): TurnPhase {
    const phaseIndex = turnCounter % PHASE_CYCLE_LENGTH;
    if (phaseIndex < MOVEMENT_PHASE_END) return "Movement";
    if (phaseIndex < ATTACK_PHASE_END) return "Attack";
    return "Castles";
  }

  public getCurrentPlayer(turnCounter: number): Color {
    return turnCounter % PLAYER_CYCLE_LENGTH < PHASE_CYCLE_LENGTH ? "w" : "b";
  }

  public getOccupiedHexes(pieces: Piece[]): Hex[] {
    return pieces.map((piece) => piece.hex);
  }

  public getBlockedHexes(pieces: Piece[], castles: Castle[]): Hex[] {
    // Assuming board logic is used here, logic from Game.tsx:
    // blockedHexes = [...riverHexes, ...castleHexes, ...occupiedHexes]
    // The river/castle hexes are static on the board.
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

  // ... Transferring more logic
  
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

  public getDefendedHexes(pieces: Piece[], currentPlayer: Color): Hex[] {
    if (DEFENDED_PIECE_IS_PROTECTED_RANGED) {
      let enemyMeleePieces = pieces.filter(
        (piece) =>
          piece.color !== currentPlayer &&
          piece.AttackType === AttackType.Melee
      );
      //Gets squares attacked by enemy pieces
      // Note: legalAttacks logic in Piece depends on enemyHexes.
      // Enemy melee pieces attack YOUR hexes.
      // So enemyHexes for THEM is YOUR pieces.
      // Wait, Piece.legalAttacks takes 'enemyHexes'.
      // If we want to know what squares are defended by ENEMY melee pieces (so ranged can't attack them),
      // we need to see where enemy melee pieces can attack.
      // They can attack anything adjacent (usually).
      // Piece.legalAttacks checks if the target is in 'enemyHexes'.
      // If we pass ALL hexes as 'enemyHexes', we get all VALID attacks.
      // But 'defendedHexes' in Game.tsx implies "squares attacked by enemy pieces".
      // Game.tsx:136: `piece.legalAttacks(this.hexagons)`
      // It passes ALL hexagons. So it checks if any hexagon is attackable.
      // Piece code: `isValidAttack` checks if `newHex` is in `enemyHexes`.
      // So passing `this.hexagons` (all hexes) means it returns all adjacent hexes (since all are "valid" targets if we consider space).
      return enemyMeleePieces
        .map((piece) => piece.legalAttacks(this.board.hexes)) 
        .flat(1);
    }
    return [];
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

  public getFutureLegalAttacks(pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    const attackable = this.getAttackableHexes(pieces, castles, currentPlayer);
    
    // Adapted from Game.tsx logic
    return pieces
      .filter((piece) => piece.color === currentPlayer && piece.canAttack)
      .flatMap((piece) => {
        if (piece.AttackType === AttackType.Ranged) {
            const defended = this.getDefendedHexes(pieces, currentPlayer);
            return piece
              .legalAttacks(attackable)
              .filter(
                (hex) =>
                  !defended.some((defendedHex) =>
                    defendedHex.equals(hex)
                  )
              );
        }
        return piece.legalAttacks(attackable);
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

  public getTurnCounterIncrement(pieces: Piece[], castles: Castle[], turnCounter: number): number {
      const futureAttacks = this.getFutureLegalAttacks(pieces, castles, turnCounter);
      const hasFutureAttacks = futureAttacks.length > 0;
      
      const futureControlledCastles = this.getFutureControlledCastlesActivePlayer(castles, pieces, turnCounter);
      const hasFutureControlledCastles = futureControlledCastles.length > 0;
      
      const phase = this.getTurnPhase(turnCounter);
      const mod5 = turnCounter % 5;

    if (!hasFutureAttacks && !hasFutureControlledCastles && mod5 === 1) {
      return 4;
    } else if (!hasFutureAttacks && hasFutureControlledCastles && mod5 === 1) {
      return 3;
    } else if (!hasFutureAttacks && !hasFutureControlledCastles && mod5 === 2) {
      return 3;
    } else if (!hasFutureAttacks && hasFutureControlledCastles && mod5 === 2) {
      return 2;
    } else if (!hasFutureControlledCastles && mod5 === 3) {
      // Logic check: Game.tsx line 236
      return 2;
    } else if (
      phase === "Castles" &&
      castles.filter(
        (castle) =>
          this.castleIsControlledByActivePlayer(castle, pieces, this.getCurrentPlayer(turnCounter)) &&
          !castle.used_this_turn
      ).length === 0
    ) {
      return 1;
    } else if (phase === "Castles") {
      // all castles are not used
      return 0;
    } else {
      return 1;
    }
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
     
     let attackerMoved = false;

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
          attackerMoved = true;
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
