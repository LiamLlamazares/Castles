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
import { RuleEngine } from "../RuleEngine";
import { TurnManager } from "../../Core/TurnManager";
import { CASTLE_RECRUITMENT_COOLDOWN_TURNS, PieceType } from "../../../Constants";
import { ActionOrchestrator } from "./ActionOrchestrator";

export class RecruitmentMutator {

  public static recruitPiece(state: GameState, castle: Castle, hex: Hex, board: Board): GameState {
      const liveCastle = state.castles.find(c => c.hex.equals(castle.hex));
      if (!liveCastle) {
          throw new Error("Castle not found");
      }

      const currentPlayer = TurnManager.getCurrentPlayer(state.turnCounter);
      if (TurnManager.getTurnPhase(state.turnCounter) !== "Recruitment") {
          throw new Error("Recruitment is only available during Recruitment phase");
      }
      if (liveCastle.owner !== currentPlayer) {
          throw new Error("Castle is not controlled by the active player");
      }
      if (!RuleEngine.castleGrantsRecruitmentToActivePlayer(liveCastle, currentPlayer)) {
          throw new Error("Castle does not grant recruitment to its original owner");
      }
      if (liveCastle.used_this_turn) {
          throw new Error("Castle has already recruited this turn");
      }
      if (liveCastle.recruitment_cooldown > 0) {
          throw new Error("Castle is cooling down");
      }
      if (!liveCastle.isAdjacent(hex)) {
          throw new Error("Recruitment hex is not adjacent to castle");
      }
      if (!RuleEngine.getRecruitmentHexes(state, board).some(recruitHex => recruitHex.equals(hex))) {
          throw new Error("Invalid recruitment hex");
      }

      // Official recruitment cycle from the in-app rules reference.
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
      
      const pieceType = RECRUITMENT_CYCLE[liveCastle.turns_controlled % RECRUITMENT_CYCLE.length];
      
      const notation = NotationService.getRecruitNotation(liveCastle, pieceType, hex);
      const newPiece = PieceFactory.create(pieceType, hex, TurnManager.getCurrentPlayer(state.turnCounter));
      const newPieces = [...state.pieces, newPiece];
      
      const newCastles = state.castles.map(c => {
          if (c.hex.equals(liveCastle.hex)) {
              return c.with({ 
                  turns_controlled: c.turns_controlled + 1,
                  used_this_turn: true,
                  recruitment_cooldown: CASTLE_RECRUITMENT_COOLDOWN_TURNS
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
