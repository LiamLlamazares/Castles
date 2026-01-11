/**
 * @file MovementMutator.ts
 * @description Handles piece movement mutations.
 */
import { GameState } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { MutatorUtils } from "./MutatorUtils";
import { TurnManager } from "../../Core/TurnManager";
import { RuleEngine } from "../RuleEngine";
import { createPieceMap } from "../../../utils/PieceMap";
import { PHASE_CYCLE_LENGTH } from "../../../Constants";
import { TurnMutator } from "./TurnMutator";

export class MovementMutator {

  public static applyMove(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const notation = NotationService.getMoveNotation(piece, targetHex);
    const record = MutatorUtils.createMoveRecord(notation, state);
    const newMoveHistory = MutatorUtils.appendHistory(state, record);

    const newPieces = state.pieces.map(p => {
        if (p.hex.equals(piece.hex)) {
            return p.with({ 
                hex: targetHex, 
                canMove: false
            });
        }
        return p;
    });

    const newPieceMap = createPieceMap(newPieces);
    
    // Check if we're moving onto a castle - if so, capture it
    const targetCastle = state.castles.find(c => c.hex.equals(targetHex));
    const mover = TurnManager.getCurrentPlayer(state.turnCounter);
    const newCastles = targetCastle && targetCastle.owner !== mover
      ? state.castles.map(c => c.hex.equals(targetHex) ? c.with({ owner: mover }) : c)
      : state.castles;
    
    // Create temp state for rule check
    const tempState: GameState = { ...state, pieces: newPieces, pieceMap: newPieceMap, castles: newCastles };
    const newTurnCounter = state.turnCounter + RuleEngine.getTurnCounterIncrement(tempState, board);
    
    let nextState: GameState = {
        ...state,
        pieces: newPieces,
        pieceMap: newPieceMap,
        castles: newCastles,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    };
    
    if (state.turnCounter % PHASE_CYCLE_LENGTH === 1) {
       nextState = TurnMutator.resetTurnFlags(nextState);
    }

    const result = TurnMutator.checkTurnTransitions(nextState);
    return {
        ...result,
        moveTree: MutatorUtils.recordMoveInTree(result, record)
    };
  }
}
