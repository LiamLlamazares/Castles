import { GameState } from "../../Core/GameState";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { DeathSystem } from "../DeathSystem";
import { PieceType, PHASE_CYCLE_LENGTH } from "../../../Constants";
import { createPieceMap } from "../../../utils/PieceMap";
import { ActionOrchestrator } from "./ActionOrchestrator";

export class TurnMutator {

  public static passTurn(state: GameState, board: Board): GameState {
      const notation = NotationService.getPassNotation();
      return ActionOrchestrator.finalizeAction(
          state,
          {},
          notation,
          board,
          true // isPassing
      );
  }

  /**
   * Checks if we need to reset turn flags based on phase transitions.
   * Called by ActionOrchestrator during every action finalization.
   */
  public static checkTurnTransitions(state: GameState): GameState {
      let newState = state;

      // Delegate Phoenix Respawns to DeathSystem
      if (newState.phoenixRecords && newState.phoenixRecords.length > 0) {
          newState = DeathSystem.processPhoenixRespawns(newState);
      }

      // 1. Decrement sanctuary cooldowns at the start of EACH player's turn
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          const currentPhaseStartPlayer = (newState.turnCounter % 10) < 5 ? 'w' : 'b';

          if (newState.sanctuaries && newState.sanctuaries.length > 0) {
              
              let whiteInvaders = 0;
              let blackInvaders = 0;
              
              newState.pieces.forEach(p => {
                  if (p.type === PieceType.Swordsman) return;
                  if (p.color === 'w' && p.hex.r < 0) whiteInvaders++;
                  if (p.color === 'b' && p.hex.r > 0) blackInvaders++;
              });

              const updatedSanctuaries = newState.sanctuaries.map(s => {
                  if (s.territorySide !== currentPhaseStartPlayer) return s;
                  if (s.cooldown <= 0) return s;
                  
                  let reduction = 1;
                  if (s.territorySide === 'w') reduction += whiteInvaders;
                  else if (s.territorySide === 'b') reduction += blackInvaders;
                  
                  const newCooldown = Math.max(0, s.cooldown - reduction);
                  return s.with({ cooldown: newCooldown });
              });
              newState = { ...newState, sanctuaries: updatedSanctuaries };
          }
      }

      // 2. Global Reset at the start of EACH player's turn (Reset piece/castle action flags)
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          newState = TurnMutator.resetTurnFlags(newState);
      }
      
      return newState;
  }

  public static resetTurnFlags(state: GameState): GameState {
      const newPieces = state.pieces.map(p => {
          return p.with({ 
              canMove: true, 
              canAttack: true, 
              damage: 0
          });
      });
      const newCastles = state.castles.map(c => {
          return c.with({ used_this_turn: false });
      });
      
      const newPieceMap = createPieceMap(newPieces);

      return {
          ...state,
          pieces: newPieces,
          pieceMap: newPieceMap,
          castles: newCastles
      };
  }
}
