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
import { MutatorUtils } from "./MutatorUtils";
import { TurnManager } from "../../Core/TurnManager";
import { RuleEngine } from "../RuleEngine";
import { createPieceMap } from "../../../utils/PieceMap";
import { TurnMutator } from "./TurnMutator";
import { PieceType } from "../../../Constants";

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
      
      const record = MutatorUtils.createMoveRecord(notation, state);
      const newMoveHistory = MutatorUtils.appendHistory(state, record);
      
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

      const newPieceMap = createPieceMap(newPieces);
      const tempState: GameState = { ...state, pieces: newPieces, pieceMap: newPieceMap, castles: newCastles };
      const increment = RuleEngine.getTurnCounterIncrement(tempState, board);

        const result = TurnMutator.checkTurnTransitions({
            ...state,
            pieces: newPieces,
            pieceMap: newPieceMap,
            castles: newCastles,
            movingPiece: null,
            turnCounter: state.turnCounter + increment,
            moveHistory: newMoveHistory
        });

        return {
            ...result,
            moveTree: MutatorUtils.recordMoveInTree(result, record)
        };
  }
}
