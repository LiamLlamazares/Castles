/**
 * @file CombatMutator.ts
 * @description Handles combat and castle attack mutations.
 */
import { GameState } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { TurnManager } from "../../Core/TurnManager";
import { CombatSystem } from "../CombatSystem";
import { DeathSystem } from "../DeathSystem";
import { ActionOrchestrator } from "./ActionOrchestrator";

export class CombatMutator {

  public static applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const castle = state.castles.find(c => c.hex.equals(targetHex));
    const notation = castle 
        ? NotationService.getCastleCaptureNotation(piece, castle)
        : NotationService.getMoveNotation(piece, targetHex);
    
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

    return ActionOrchestrator.finalizeAction(
        state,
        { pieces: newPieces, castles: newCastles },
        notation,
        board
    );
  }

  public static applyAttack(state: GameState, attacker: Piece, targetHex: Hex, board: Board): GameState {
     const notation = NotationService.getAttackNotation(attacker, targetHex);

     // Use CombatSystem to resolve the logic
     const result = CombatSystem.resolveAttack(state.pieces, attacker, targetHex, state.pieceMap);
     
     // Check if attacker captured the target AND target was on a castle
     // If so, transfer castle ownership to the attacker's owner
     const targetCastle = state.castles.find(c => c.hex.equals(targetHex));
     const attackerColor = TurnManager.getCurrentPlayer(state.turnCounter);
     const capturedPiece = result.deadPiece && result.deadPiece.color !== attackerColor;
     
     const newCastles = (capturedPiece && targetCastle && targetCastle.owner !== attackerColor)
       ? state.castles.map(c => c.hex.equals(targetHex) ? c.with({ owner: attackerColor }) : c)
       : state.castles;
     
     // Delegate Death Processing to DeathSystem
     let newGraveyard = state.graveyard || [];
     let newPhoenixRecords = state.phoenixRecords || [];

     if (result.deadPiece) {
         const updates = DeathSystem.processDeath(state, result.deadPiece);
         if (updates.graveyard) newGraveyard = updates.graveyard;
         if (updates.phoenixRecords) newPhoenixRecords = updates.phoenixRecords;
     }
      
     return ActionOrchestrator.finalizeAction(
        state,
        { 
            pieces: result.pieces, 
            castles: newCastles, 
            graveyard: newGraveyard, 
            phoenixRecords: newPhoenixRecords 
        },
        notation,
        board
     );
  }
}
