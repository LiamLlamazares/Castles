/**
 * @file RecruitmentMutator.ts
 * @description Handles piece recruitment logic.
 */
import { GameState } from "../../Core/GameState";
import { PieceFactory } from "../../Entities/PieceFactory";
import { Castle } from "../../Entities/Castle";
import { Hex } from "../../Entities/Hex";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { TurnManager } from "../../Core/TurnManager";
import { PieceType } from "../../../Constants";
import { ActionOrchestrator } from "./ActionOrchestrator";

export class RecruitmentMutator {

  public static recruitPiece(state: GameState, castle: Castle, hex: Hex, board: Board): GameState {
      // Official recruitment cycle from rules.md
      const RECRUITMENT_CYCLE = [
        PieceType.Swordsman,
        PieceType.Archer,
        PieceType.Knight,
        PieceType.Eagle,
        PieceType.Giant,
        PieceType.Trebuchet,
        PieceType.Assassin,
        PieceType.Dragon,
        PieceType.Monarch
      ];
      
      const pieceType = RECRUITMENT_CYCLE[castle.turns_controlled % RECRUITMENT_CYCLE.length];
      
      const notation = NotationService.getRecruitNotation(castle, pieceType, hex);
      const newPiece = PieceFactory.create(pieceType, hex, TurnManager.getCurrentPlayer(state.turnCounter));
      const newPieces = [...state.pieces, newPiece];
      
      const newCastles = state.castles.map(c => {
          if (c.hex.equals(castle.hex)) {
              return c.with({ 
                  turns_controlled: c.turns_controlled + 1,
                  used_this_turn: true
              });
          }
          return c;
      });

      return ActionOrchestrator.finalizeAction(
          state,
          { pieces: newPieces, castles: newCastles },
          notation,
          board
      );
  }
}
