/**
 * @file CombatMutator.ts
 * @description Handles combat and castle attack mutations.
 */
import { GameState } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { MutatorUtils } from "./MutatorUtils";
import { TurnManager } from "../../Core/TurnManager";
import { RuleEngine } from "../RuleEngine";
import { CombatSystem } from "../CombatSystem";
import { DeathSystem } from "../DeathSystem";
import { createPieceMap } from "../../../utils/PieceMap";
import { TurnMutator } from "./TurnMutator";

export class CombatMutator {

  public static applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const castle = state.castles.find(c => c.hex.equals(targetHex));
    const notation = castle 
        ? NotationService.getCastleCaptureNotation(piece, castle)
        : NotationService.getMoveNotation(piece, targetHex);
    
    const record = MutatorUtils.createMoveRecord(notation, state);
    const newMoveHistory = MutatorUtils.appendHistory(state, record);
    const capturer = TurnManager.getCurrentPlayer(state.turnCounter);
    
    // Move the piece onto the castle AND consume attack
    const newPieces = state.pieces.map(p => {
        if (p.hex.equals(piece.hex)) {
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
    
    const tempState: GameState = { ...state, pieces: newPieces, pieceMap: newPieceMap, castles: newCastles };
    const newTurnCounter = state.turnCounter + RuleEngine.getTurnCounterIncrement(tempState, board);
    
    const result = TurnMutator.checkTurnTransitions({
        ...state,
        pieces: newPieces,
        pieceMap: newPieceMap,
        castles: newCastles,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    });

    return {
        ...result,
        moveTree: MutatorUtils.recordMoveInTree(result, record)
    };
  }

  public static applyAttack(state: GameState, attacker: Piece, targetHex: Hex, board: Board): GameState {
     const notation = NotationService.getAttackNotation(attacker, targetHex);
     const record = MutatorUtils.createMoveRecord(notation, state);
     const newMoveHistory = MutatorUtils.appendHistory(state, record);

     // Use CombatSystem to resolve the logic
     const result = CombatSystem.resolveAttack(state.pieces, attacker, targetHex, state.pieceMap);

     const newPieceMap = createPieceMap(result.pieces);
     
     // Check if attacker captured the target AND target was on a castle
     // If so, transfer castle ownership to the attacker's owner
     const targetCastle = state.castles.find(c => c.hex.equals(targetHex));
     const attackerColor = TurnManager.getCurrentPlayer(state.turnCounter);
     const capturedPiece = result.deadPiece && result.deadPiece.color !== attackerColor;
     
     const newCastles = (capturedPiece && targetCastle && targetCastle.owner !== attackerColor)
       ? state.castles.map(c => c.hex.equals(targetHex) ? c.with({ owner: attackerColor }) : c)
       : state.castles;
     
     const tempState: GameState = { ...state, pieces: result.pieces, pieceMap: newPieceMap, castles: newCastles };
     const increment = RuleEngine.getTurnCounterIncrement(tempState, board);
     
     // Delegate Death Processing to DeathSystem
     let newGraveyard = state.graveyard || [];
     let newPhoenixRecords = state.phoenixRecords || [];

     if (result.deadPiece) {
         const updates = DeathSystem.processDeath(state, result.deadPiece);
         if (updates.graveyard) newGraveyard = updates.graveyard;
         if (updates.phoenixRecords) newPhoenixRecords = updates.phoenixRecords;
     }
      
     const resultState = TurnMutator.checkTurnTransitions({
          ...state,
          pieces: result.pieces,
          pieceMap: newPieceMap,
          castles: newCastles,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory,
          graveyard: newGraveyard,
          phoenixRecords: newPhoenixRecords
     });

     return {
         ...resultState,
         moveTree: MutatorUtils.recordMoveInTree(resultState, record)
     };
  }
}
