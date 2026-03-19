/**
 * @file MovementMutator.ts
 * @description Handles piece movement mutations, including promotion detection.
 */
import { ActionOrchestrator } from "./ActionOrchestrator";
import { GameState } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { TurnManager } from "../../Core/TurnManager";
import { PieceType } from "../../../Constants";

export class MovementMutator {

  public static applyMove(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const notation = NotationService.getMoveNotation(piece, targetHex);

    const movedPiece = piece.with({ hex: targetHex, canMove: false });

    const newPieces = state.pieces.map(p => {
        if (p.hex.equals(piece.hex)) {
            return movedPiece;
        }
        return p;
    });

    // Check if we're moving onto a castle - if so, capture it
    const targetCastle = state.castles.find(c => c.hex.equals(targetHex));
    const mover = TurnManager.getCurrentPlayer(state.turnCounter);
    const newCastles = targetCastle && targetCastle.owner !== mover
      ? state.castles.map(c => c.hex.equals(targetHex) ? c.with({ owner: mover }) : c)
      : state.castles;

    // Check for Swordsman promotion (reaching opponent's back row)
    const promotionPending = (piece.type === PieceType.Swordsman && board.isPromotionHex(targetHex, piece.color))
      ? movedPiece
      : null;

    return ActionOrchestrator.finalizeAction(
        state,
        { pieces: newPieces, castles: newCastles, promotionPending },
        notation,
        board
    );
  }
}
