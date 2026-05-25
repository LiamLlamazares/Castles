/**
 * @file PromotionMutator.ts
 * @description Handles Swordsman promotion when reaching the opponent's back row.
 *
 * Promotion is a "free action" — the move that brought the Swordsman to the
 * back row already consumed a move action. This mutator just swaps the piece type
 * and clears the promotionPending flag without advancing the turn counter.
 */
import { GameState } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { PieceFactory } from "../../Entities/PieceFactory";
import { PieceType, PROMOTABLE_TYPES } from "../../../Constants";
import { createPieceMap } from "../../../utils/PieceMap";

export class PromotionMutator {

  /**
   * Promotes a swordsman to the chosen piece type.
   * Does NOT advance the turn counter — the move already did that.
   */
  /** Convenience alias used by GameEngine */
  public static applyPromotion(state: GameState, selectedType: PieceType): GameState {
    if (!state.promotionPending) return state;
    return PromotionMutator.promote(state, state.promotionPending, selectedType);
  }

  public static promote(state: GameState, swordsman: Piece, newType: PieceType): GameState {
    const pending = state.promotionPending;
    if (
      !pending ||
      !pending.hex.equals(swordsman.hex) ||
      pending.color !== swordsman.color ||
      pending.type !== swordsman.type
    ) {
      return state;
    }

    if (swordsman.type !== PieceType.Swordsman) {
      console.warn("PromotionMutator: piece is not a Swordsman");
      return state;
    }

    if (!PROMOTABLE_TYPES.includes(newType)) {
      console.warn(`PromotionMutator: ${newType} is not a valid promotion target`);
      return state;
    }

    const currentSwordsman = state.pieces.find(p =>
      p.hex.equals(swordsman.hex) &&
      p.color === swordsman.color &&
      p.type === PieceType.Swordsman
    );
    if (!currentSwordsman) {
      return state;
    }

    // Create the promoted piece at the same hex with the same color
    const promotedPiece = PieceFactory.create(newType, currentSwordsman.hex, currentSwordsman.color);
    // Preserve canMove/canAttack flags from the swordsman (already used move this turn)
    const finalPiece = promotedPiece.with({
      canMove: currentSwordsman.canMove,
      canAttack: currentSwordsman.canAttack,
    });

    // Replace the swordsman in the pieces array
    const newPieces = state.pieces.map(p =>
      p === currentSwordsman ? finalPiece : p
    );

    // Update the last move's notation to include promotion suffix
    const newTree = state.moveTree.clone();
    const currentNode = newTree.current;
    if (currentNode.move) {
      const shortType = newType.substring(0, 2); // "Ar", "Kn", etc.
      currentNode.move = {
        ...currentNode.move,
        notation: `${currentNode.move.notation}=${shortType}`,
      };
    }

    return {
      ...state,
      pieces: newPieces,
      pieceMap: createPieceMap(newPieces),
      promotionPending: null,
      moveTree: newTree,
    };
  }
}
