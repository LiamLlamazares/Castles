/**
 * @file DeathSystem.ts
 * @description Pure system for handling piece death lifecycles.
 *
 * Responsibilities:
 * - Managing Graveyard additions
 * - Handling Phoenix Rebirth timers and spawning
 * - Necromancer Soul Collection (future calculation)
 * - Validation for Raise Dead
 *
 * @usage Used by StateMutator to process death results from CombatSystem.
 */
import { Piece } from "../Entities/Piece";
import { PieceFactory } from "../Entities/PieceFactory";
import { Castle } from "../Entities/Castle";
import { GameState } from "../Core/GameEngine";
import { createPieceMap } from "../../utils/PieceMap";
import {
  PieceType,
  PLAYER_CYCLE_LENGTH
} from "../../Constants";

export class DeathSystem {

  /**
   * Processes a dead piece, adding it to graveyard or creating a Phoenix Record.
   */
  public static processDeath(state: GameState, deadPiece: Piece): Partial<GameState> {
      if (deadPiece.isRevived) {
          // Exile: Revived pieces disappear forever when killed again
          return {};
      }

      if (deadPiece.type === PieceType.Phoenix) {
          // Phoenix Rebirth
          const newRecord = {
              respawnTurn: state.turnCounter + (PLAYER_CYCLE_LENGTH * 3),
              owner: deadPiece.color
          };
          return {
              phoenixRecords: [...state.phoenixRecords, newRecord]
          };
      }

      // Standard Death
      return {
          graveyard: [...state.graveyard, deadPiece]
      };
  }

  /**
   * Checked at the specific phase or turn start to respawn Phoenixes.
   */
  public static processPhoenixRespawns(state: GameState): GameState {
      // Find records due for respawn
      const dueRecords = state.phoenixRecords.filter(r => r.respawnTurn <= state.turnCounter);
      if (dueRecords.length === 0) return state;

      // Keep records NOT due
      const remainingRecords = state.phoenixRecords.filter(r => r.respawnTurn > state.turnCounter);
      
      let newPieces = [...state.pieces];

      dueRecords.forEach(record => {
          const friendlyCastles = state.castles.filter(c => c.owner === record.owner);
          
          if (friendlyCastles.length > 0) {
              // Try to find a spawn spot at a castle
              for (const castle of friendlyCastles) {
                  const candidates = [castle.hex, ...castle.hex.cubeRing(1)];
                  
                  for (const spot of candidates) {
                       const isOccupied = newPieces.some(p => p.hex.equals(spot));
                       if (!isOccupied) {
                           // Spawn!
                           const phoenix = PieceFactory.createPhoenix(spot, record.owner);
                           newPieces.push(phoenix);
                           return; // Done for this record
                       }
                  }
              }
              // If blocked, lost.
          }
      });

      return {
          ...state,
          pieces: newPieces,
          pieceMap: createPieceMap(newPieces),
          phoenixRecords: remainingRecords
      };
  }
}
