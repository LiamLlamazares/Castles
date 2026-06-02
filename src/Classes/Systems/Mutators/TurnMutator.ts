import { GameState } from "../../Core/GameState";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { DeathSystem } from "../DeathSystem";
import { Color, PieceType, PHASE_CYCLE_LENGTH, PLAYER_CYCLE_LENGTH } from "../../../Constants";
import { createPieceMap } from "../../../utils/PieceMap";
import { ActionOrchestrator } from "./ActionOrchestrator";
import { RuleEngine } from "../RuleEngine";

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
  public static checkTurnTransitions(state: GameState, skipCooldownTickHexKeys: Set<string> = new Set()): GameState {
      let newState = state;

      // Delegate Phoenix Respawns to DeathSystem
      if (newState.phoenixRecords && newState.phoenixRecords.length > 0) {
          newState = DeathSystem.processPhoenixRespawns(newState);
      }

      // 1. Decrement sanctuary cooldowns at the start of their controller's turn
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          const currentPhaseStartPlayer = TurnMutator.getTurnStartPlayer(newState.turnCounter);

          if (newState.sanctuaries && newState.sanctuaries.length > 0) {
              
              let whiteInvaders = 0;
              let blackInvaders = 0;
              
              newState.pieces.forEach(p => {
                  if (p.type === PieceType.Swordsman) return;
                  if (p.color === 'w' && p.hex.r < 0) whiteInvaders++;
                  if (p.color === 'b' && p.hex.r > 0) blackInvaders++;
              });

              const updatedSanctuaries = newState.sanctuaries.map(s => {
                  if (skipCooldownTickHexKeys.has(s.hex.getKey())) return s;
                  if (s.cooldown <= 0) return s;
                  const cooldownSide = s.controller ?? s.territorySide;
                  if (cooldownSide !== currentPhaseStartPlayer) return s;
                  
                  let reduction = 1;
                  if (cooldownSide === 'w') reduction += whiteInvaders;
                  else if (cooldownSide === 'b') reduction += blackInvaders;
                  
                  const newCooldown = Math.max(0, s.cooldown - reduction);
                  return s.with({ cooldown: newCooldown });
              });
              newState = { ...newState, sanctuaries: updatedSanctuaries };
          }
      }

      // 2. Castle recruitment cooldowns tick once at the start of that castle owner's turn.
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          const currentPhaseStartPlayer = TurnMutator.getTurnStartPlayer(newState.turnCounter);
          newState = TurnMutator.tickCastleCooldowns(newState, currentPhaseStartPlayer);
      }

      // 3. Global Reset at the start of EACH player's turn (Reset piece/castle action flags)
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          newState = TurnMutator.resetTurnFlags(newState);
      }
      
      return newState;
  }

  public static normalizeForcedTurns(
      state: GameState,
      board: Board,
      skipCooldownTickHexKeys: Set<string> = new Set()
  ): GameState {
      let newState = state;
      const startTurnCounter = state.turnCounter;

      for (let i = 0; i < PLAYER_CYCLE_LENGTH; i++) {
          if (newState.promotionPending) return newState;

          const increment = RuleEngine.getForcedTurnCounterIncrement(newState, board);
          if (increment <= 0) return newState;

          newState = {
              ...newState,
              movingPiece: null,
              turnCounter: newState.turnCounter + increment
          };

          newState = TurnMutator.checkTurnTransitions(newState, skipCooldownTickHexKeys);

          if (newState.turnCounter - startTurnCounter >= PLAYER_CYCLE_LENGTH) {
              return newState;
          }
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

  private static getTurnStartPlayer(turnCounter: number): Color {
      return turnCounter % PLAYER_CYCLE_LENGTH < PHASE_CYCLE_LENGTH ? 'w' : 'b';
  }

  private static tickCastleCooldowns(state: GameState, owner: Color): GameState {
      const newCastles = state.castles.map(castle => {
          if (castle.owner !== owner || castle.recruitment_cooldown <= 0) return castle;
          return castle.with({
              recruitment_cooldown: Math.max(0, castle.recruitment_cooldown - 1)
          });
      });

      return {
          ...state,
          castles: newCastles
      };
  }
}
