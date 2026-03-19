/**
 * @file PromotionMutator.ts
 * @description Handles Swordsman promotion (Coronation).
 *
 * When a Swordsman reaches the opponent's back row, the game pauses with
 * `promotionPending` set. This mutator applies the player's choice,
 * replacing the Swordsman's type with the selected piece type.
 *
 * @see MovementMutator - Sets promotionPending when back row is reached
 * @see GameState.promotionPending - The pending promotion state
 */
import { GameState } from "../../Core/GameState";
import { PieceType } from "../../../Constants";
import { createPieceMap } from "../../../utils/PieceMap";
import { GameError, GameErrorCode } from "../../Core/GameError";

export class PromotionMutator {
  /**
   * Applies a promotion choice, transforming the Swordsman into the selected type.
   * Clears `promotionPending` so the game can continue.
   *
   * @param state - Current game state (must have promotionPending set)
   * @param selectedType - The piece type chosen by the player
   * @returns New game state with the promoted piece and promotionPending cleared
   */
  public static applyPromotion(state: GameState, selectedType: PieceType): GameState {
    if (!state.promotionPending) {
      throw new GameError(
        "No promotion pending",
        GameErrorCode.STATE_ERROR
      );
    }

    const { pieceHex } = state.promotionPending;

    // Find the Swordsman at the promotion hex
    const swordsman = state.pieces.find(
      p => p.hex.equals(pieceHex) && p.type === PieceType.Swordsman
    );

    if (!swordsman) {
      throw new GameError(
        `No Swordsman found at ${pieceHex.getKey()} for promotion`,
        GameErrorCode.STATE_ERROR
      );
    }

    // Validate the selected type is in the allowed options
    if (!state.promotionPending.options.includes(selectedType)) {
      throw new GameError(
        `Invalid promotion type: ${selectedType}`,
        GameErrorCode.STATE_ERROR
      );
    }

    // Replace the Swordsman with the promoted piece (same hex, color, fresh state)
    const newPieces = state.pieces.map(p => {
      if (p.hex.equals(pieceHex) && p.type === PieceType.Swordsman) {
        return p.with({ type: selectedType });
      }
      return p;
    });

    return {
      ...state,
      pieces: newPieces,
      pieceMap: createPieceMap(newPieces),
      promotionPending: null,
    };
  }
}
