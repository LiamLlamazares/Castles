/**
 * @file MovementMutator.ts
 * @description Handles piece movement mutations.
 *
 * Includes Swordsman promotion detection: when a Swordsman reaches the
 * opponent's back row (r = ±N), the game sets `promotionPending` and pauses
 * turn advancement until the player selects a piece type.
 */
import { ActionOrchestrator } from "./ActionOrchestrator";
import { GameState } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { TurnManager } from "../../Core/TurnManager";
import { PieceType } from "../../../Constants";

/** Piece types a Swordsman can promote to (excludes Monarch per rules.md) */
const PROMOTION_OPTIONS: PieceType[] = [
  PieceType.Archer,
  PieceType.Knight,
  PieceType.Eagle,
  PieceType.Giant,
  PieceType.Trebuchet,
  PieceType.Assassin,
  PieceType.Dragon,
];

export class MovementMutator {

  public static applyMove(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const notation = NotationService.getMoveNotation(piece, targetHex);

    const newPieces = state.pieces.map(p => {
        if (p.hex.equals(piece.hex)) {
            return p.with({
                hex: targetHex,
                canMove: false
            });
        }
        return p;
    });

    // Check if we're moving onto a castle - if so, capture it
    const targetCastle = state.castles.find(c => c.hex.equals(targetHex));
    const mover = TurnManager.getCurrentPlayer(state.turnCounter);
    const newCastles = targetCastle && targetCastle.owner !== mover
      ? state.castles.map(c => c.hex.equals(targetHex) ? c.with({ owner: mover }) : c)
      : state.castles;

    // Check for Swordsman promotion (Coronation)
    const isPromotion = piece.type === PieceType.Swordsman && board.isBackRow(targetHex, piece.color);

    if (isPromotion) {
      // Set promotionPending — turn advancement pauses until player selects a type.
      // We still finalize the move (piece moves, castle captured, etc.) but the
      // promotion choice will be resolved before the turn counter advances.
      const result = ActionOrchestrator.finalizeAction(
          state,
          { pieces: newPieces, castles: newCastles },
          notation,
          board
      );
      return {
          ...result,
          promotionPending: {
              pieceHex: targetHex,
              options: PROMOTION_OPTIONS,
          },
      };
    }

    return ActionOrchestrator.finalizeAction(
        state,
        { pieces: newPieces, castles: newCastles },
        notation,
        board
    );
  }
}
