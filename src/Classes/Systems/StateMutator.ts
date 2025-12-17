import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { GameState } from "../Core/GameEngine";
import { NotationService } from "./NotationService";
import { TurnManager } from "../Core/TurnManager";
import { RuleEngine } from "./RuleEngine";
import { CombatSystem } from "./CombatSystem";
import { Board } from "../Core/Board";
import { createPieceMap } from "../../utils/PieceMap";
import {
  MoveRecord,
  PieceType,
  PHASE_CYCLE_LENGTH
} from "../../Constants";

export class StateMutator {

  public static applyMove(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const notation = NotationService.getMoveNotation(piece, targetHex);

    const record: MoveRecord = {
        notation,
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
        color: TurnManager.getCurrentPlayer(state.turnCounter),
        phase: TurnManager.getTurnPhase(state.turnCounter)
    };

    const newMoveHistory = [...(state.moveHistory || []), record];

    const newPieces = state.pieces.map(p => {
        if (p === piece) {
            // Use immutable update via 'with'
            return p.with({ hex: targetHex, canMove: false });
        }
        return p;
    });

    const newPieceMap = createPieceMap(newPieces);
    const newTurnCounter = state.turnCounter + RuleEngine.getTurnCounterIncrement(newPieces, state.castles, state.turnCounter, board);
    
    let nextState: GameState = {
        ...state,
        pieces: newPieces,
        pieceMap: newPieceMap,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    };
    
    if (state.turnCounter % PHASE_CYCLE_LENGTH === 1) {
       nextState = StateMutator.resetTurnFlags(nextState);
    }

    return StateMutator.checkTurnTransitions(nextState);
  }

  public static applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const castle = state.castles.find(c => c.hex.equals(targetHex));
    const notation = castle 
        ? NotationService.getCastleCaptureNotation(piece, castle)
        : NotationService.getMoveNotation(piece, targetHex);
    
    const record: MoveRecord = {
        notation,
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
        color: TurnManager.getCurrentPlayer(state.turnCounter),
        phase: TurnManager.getTurnPhase(state.turnCounter)
    };

    const newMoveHistory = [...(state.moveHistory || []), record];
    const capturer = TurnManager.getCurrentPlayer(state.turnCounter);
    
    // Move the piece onto the castle AND consume attack
    const newPieces = state.pieces.map(p => {
        if (p === piece) {
            return p.with({ hex: targetHex, canAttack: false });
        }
        return p;
    });

    // Transfer castle ownership
    const newCastles = state.castles.map(c => {
        if (c.hex.equals(targetHex)) {
            return c.with({ owner: capturer });
        }
        return c;
    });

    const newPieceMap = createPieceMap(newPieces);
    const newTurnCounter = state.turnCounter + RuleEngine.getTurnCounterIncrement(newPieces, newCastles, state.turnCounter, board);
    
    return StateMutator.checkTurnTransitions({
        ...state,
        pieces: newPieces,
        pieceMap: newPieceMap,
        castles: newCastles,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    });
  }

  public static applyAttack(state: GameState, attacker: Piece, targetHex: Hex, board: Board): GameState {
     const notation = NotationService.getAttackNotation(attacker, targetHex);
     
     const record: MoveRecord = {
        notation,
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
        color: TurnManager.getCurrentPlayer(state.turnCounter),
        phase: TurnManager.getTurnPhase(state.turnCounter)
    };

     const newMoveHistory = [...(state.moveHistory || []), record];

     // Use CombatSystem to resolve the logic
     const result = CombatSystem.resolveAttack(state.pieces, attacker, targetHex, state.pieceMap);

     const newPieceMap = createPieceMap(result.pieces);
     const increment = RuleEngine.getTurnCounterIncrement(result.pieces, state.castles, state.turnCounter, board);
      
     return StateMutator.checkTurnTransitions({
          ...state,
          pieces: result.pieces,
          pieceMap: newPieceMap,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory
     });
  }

  public static passTurn(state: GameState, board: Board): GameState {
      // User requested NO history for Pass - but we MUST record it for PGN consistency!
      // The UI can filter it out if needed.
      const record: MoveRecord = {
          notation: NotationService.getPassNotation(),
          turnNumber: Math.floor(state.turnCounter / 10) + 1,
          color: TurnManager.getCurrentPlayer(state.turnCounter),
          phase: TurnManager.getTurnPhase(state.turnCounter)
      };

      const newMoveHistory = [...(state.moveHistory || []), record];
      const increment = RuleEngine.getTurnCounterIncrement(state.pieces, state.castles, state.turnCounter, board, true);
      
      return StateMutator.checkTurnTransitions({
          ...state,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory
      });
  }

  public static recruitPiece(state: GameState, castle: Castle, hex: Hex, board: Board): GameState {
      const pieceTypes = Object.values(PieceType);
      const pieceType = pieceTypes[castle.turns_controlled % pieceTypes.length];
      
      const notation = NotationService.getRecruitNotation(castle, pieceType, hex);
      
      const record: MoveRecord = {
        notation,
        turnNumber: Math.floor(state.turnCounter / 10) + 1,
        color: TurnManager.getCurrentPlayer(state.turnCounter),
        phase: TurnManager.getTurnPhase(state.turnCounter)
    };

      const newMoveHistory = [...(state.moveHistory || []), record];
      
      const newPiece = new Piece(hex, TurnManager.getCurrentPlayer(state.turnCounter), pieceType);
      
      const newPieces = [...state.pieces, newPiece];
      
      // Update Castle
      const newCastles = state.castles.map(c => {
          if (c === castle) {
              return c.with({ 
                  turns_controlled: c.turns_controlled + 1,
                  used_this_turn: true
              });
          }
          return c;
      });

      const newPieceMap = createPieceMap(newPieces);
      const increment = RuleEngine.getTurnCounterIncrement(newPieces, newCastles, state.turnCounter, board);

      return StateMutator.checkTurnTransitions({
          ...state,
          pieces: newPieces,
          pieceMap: newPieceMap,
          castles: newCastles,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory
      });
  }

  /**
   * Checks if we need to reset turn flags based on phase transitions.
   * - Resets at start of new Player Turn (turnCounter % 5 === 0)
   * - Helper to centralize this logic
   */
  private static checkTurnTransitions(state: GameState): GameState {
      // If we just entered a new player's turn (Turn 0, 5, 10...)
      if (state.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          return StateMutator.resetTurnFlags(state);
      }
      return state;
  }

  public static resetTurnFlags(state: GameState): GameState {
      const newPieces = state.pieces.map(p => {
          return p.with({ 
              canMove: true, 
              canAttack: true, 
              damage: 0 
          });
      });
      const newCastles = state.castles.map(c => {
          return c.with({ used_this_turn: false });
      });
      
      const newPieceMap = createPieceMap(newPieces);

      return {
          ...state,
          pieces: newPieces,
          pieceMap: newPieceMap,
          castles: newCastles
      };
  }
}
