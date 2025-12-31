/**
 * @file StateMutator.ts
 * @description Pure functions for immutable game state transitions.
 *
 * Each method takes a GameState and returns a **new** GameState.
 * No side effects - all mutations are immutable copies.
 *
 * Handles:
 * - Movement (applyMove)
 * - Combat (applyAttack, applyCastleAttack)
 * - Turn management (passTurn, resetTurnFlags)
 * - Abilities (activateAbility - Fireball, Teleport, RaiseDead)
 * - Recruitment (recruitPiece)
 *
 * @usage Called exclusively by GameEngine to mutate game state.
 * @see GameEngine - Facade that validates before calling StateMutator
 * @see RuleEngine - Validates legality before mutations occur
 * @see DeathSystem - Handles piece death and respawn logic
 */
import { Piece } from "../Entities/Piece";
import { PieceFactory } from "../Entities/PieceFactory";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { MoveTree } from "../Core/MoveTree";
import { GameState } from "../Core/GameEngine";
import { NotationService } from "./NotationService";
import { TurnManager } from "../Core/TurnManager";
import { RuleEngine } from "./RuleEngine";
import { CombatSystem } from "./CombatSystem";
import { DeathSystem } from "./DeathSystem";
import { Board } from "../Core/Board";
import { createPieceMap } from "../../utils/PieceMap";
import { createHistorySnapshot } from "../../utils/GameStateUtils";
import {
  MoveRecord,
  PieceType,
  PHASE_CYCLE_LENGTH,
  PHASES_PER_TURN,
  AbilityType,
  AttackType,
} from "../../Constants";

export class StateMutator {

  // ================= PRIVATE HELPERS =================

  /**
   * Creates a MoveRecord for the history log.
   * Centralizes the turn number and phase calculation.
   */
  private static createMoveRecord(notation: string, state: GameState): MoveRecord {
    return {
      notation,
      turnNumber: Math.floor(state.turnCounter / 10) + 1,
      color: TurnManager.getCurrentPlayer(state.turnCounter),
      phase: TurnManager.getTurnPhase(state.turnCounter)
    };
  }

  /**
   * Appends a move record to the history.
   * Handles undefined moveHistory gracefully.
   */
  private static appendHistory(state: GameState, record: MoveRecord): MoveRecord[] {
    return [...(state.moveHistory || []), record];
  }

  /**
   * Updates the MoveTree with a new move and a snapshot of the resulting state.
   * Returns a NEW MoveTree instance (cloned).
   */
  private static recordMoveInTree(state: GameState, record: MoveRecord): MoveTree {
      const newTree = state.moveTree.clone();
      newTree.addMove(record, createHistorySnapshot(state));
      return newTree;
  }

  // ================= PUBLIC MUTATIONS =================

  public static applyMove(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const notation = NotationService.getMoveNotation(piece, targetHex);
    const record = this.createMoveRecord(notation, state);
    const newMoveHistory = this.appendHistory(state, record);

    const newPieces = state.pieces.map(p => {
        if (p.hex.equals(piece.hex)) {
            // Use immutable update via 'with'
            return p.with({ 
                hex: targetHex, 
                canMove: false
            });
        }
        return p;
    });

    const newPieceMap = createPieceMap(newPieces);
    
    // Check if we're moving onto a castle - if so, capture it
    const targetCastle = state.castles.find(c => c.hex.equals(targetHex));
    const mover = TurnManager.getCurrentPlayer(state.turnCounter);
    const newCastles = targetCastle && targetCastle.owner !== mover
      ? state.castles.map(c => c.hex.equals(targetHex) ? c.with({ owner: mover }) : c)
      : state.castles;
    
    // Create temp state for rule check
    const tempState: GameState = { ...state, pieces: newPieces, pieceMap: newPieceMap, castles: newCastles };
    const newTurnCounter = state.turnCounter + RuleEngine.getTurnCounterIncrement(tempState, board);
    
    let nextState: GameState = {
        ...state,
        pieces: newPieces,
        pieceMap: newPieceMap,
        castles: newCastles,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    };
    
    if (state.turnCounter % PHASE_CYCLE_LENGTH === 1) {
       nextState = StateMutator.resetTurnFlags(nextState);
    }

    const result = StateMutator.checkTurnTransitions(nextState);
    return {
        ...result,
        moveTree: this.recordMoveInTree(result, record)
    };
  }

  public static applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const castle = state.castles.find(c => c.hex.equals(targetHex));
    const notation = castle 
        ? NotationService.getCastleCaptureNotation(piece, castle)
        : NotationService.getMoveNotation(piece, targetHex);
    
    const record = this.createMoveRecord(notation, state);
    const newMoveHistory = this.appendHistory(state, record);
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
    
    const result = StateMutator.checkTurnTransitions({
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
        moveTree: this.recordMoveInTree(result, record)
    };
  }

  public static applyAttack(state: GameState, attacker: Piece, targetHex: Hex, board: Board): GameState {
     const notation = NotationService.getAttackNotation(attacker, targetHex);
     const record = this.createMoveRecord(notation, state);
     const newMoveHistory = this.appendHistory(state, record);

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
      
     const resultState = StateMutator.checkTurnTransitions({
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
         moveTree: this.recordMoveInTree(resultState, record)
     };
  }

  public static passTurn(state: GameState, board: Board): GameState {
      const notation = NotationService.getPassNotation();
      const record = this.createMoveRecord(notation, state);
      const newMoveHistory = this.appendHistory(state, record);
      
      const increment = RuleEngine.getTurnCounterIncrement(state, board, true);
      
      const result = StateMutator.checkTurnTransitions({
          ...state,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory
      });

      return {
          ...result,
          moveTree: this.recordMoveInTree(result, record)
      };
  }

  public static activateAbility(state: GameState, source: Piece, targetHex: Hex, ability: AbilityType, board: Board): GameState {
       let newPieces = [...state.pieces];
       let newGraveyard = state.graveyard || [];
       let notation = "";
       let sourceUpdated = source;

       if (source.type === PieceType.Wizard) {
            sourceUpdated = source.with({ abilityUsed: true, canAttack: false, canMove: false });
       } else if (source.type === PieceType.Necromancer) {
            sourceUpdated = source.with({ canAttack: false, canMove: false }); 
       }

       newPieces = newPieces.map(p => p.hex.equals(source.hex) ? sourceUpdated : p);

       let newPhoenixRecords = state.phoenixRecords || [];

       if (ability === AbilityType.Fireball) {
           notation = `Fireball -> ${targetHex.toString()}`;
           const impactedHexes = [targetHex, ...targetHex.cubeRing(1)];
           const impactedKeys = new Set(impactedHexes.map(h => h.getKey()));
           
           // Apply damage
           const piecesBeforeDeath = newPieces.map(p => {
               if (impactedKeys.has(p.hex.getKey())) {
                   return p.with({ damage: p.damage + 1 });
               }
               return p;
           });

           // Filter dead pieces and update graveyard
           const deadPieces = piecesBeforeDeath.filter(p => p.damage >= p.Strength);
           
           // Use DeathSystem for each fireball victim
           // Iterate dead pieces and accumulate side effects (graveyard + phoenix records)
           
           let pendingGraveyard = [...newGraveyard];
           let pendingPhoenixRecords = [...newPhoenixRecords];

           deadPieces.forEach(p => {
               if (!p.isRevived) {
                   // processDeath handles Phoenix respawn scheduling
                   const updates = DeathSystem.processDeath({ ...state, graveyard: pendingGraveyard, phoenixRecords: pendingPhoenixRecords }, p);
                   if (updates.graveyard) pendingGraveyard = updates.graveyard;
                   if (updates.phoenixRecords) pendingPhoenixRecords = updates.phoenixRecords;
               }
           });
           
           newGraveyard = pendingGraveyard;
           newPhoenixRecords = pendingPhoenixRecords;
           
           newPieces = piecesBeforeDeath.filter(p => p.damage < p.Strength);

       } else if (ability === AbilityType.Teleport) {
           notation = `Teleport -> ${targetHex.toString()}`;
           if (state.pieceMap.has(targetHex)) throw new Error("Teleport target blocked");
           
           newPieces = newPieces.map(p => p.hex.getKey() === source.hex.getKey() 
                ? p.with({ hex: targetHex })
                : p
           );
       } else if (ability === AbilityType.RaiseDead) {
           notation = `RaiseDead -> ${targetHex.toString()}`;
           
           // Validation
           if (source.souls < 1) throw new Error("Not enough souls");
           if (state.pieceMap.has(targetHex)) throw new Error("Target hex occupied");

           const friendliesInGraveyard = newGraveyard.filter(p => p.color === source.color);
           if (friendliesInGraveyard.length === 0) throw new Error("No friendly bodies to raise");

           const bodyToRaise = friendliesInGraveyard[friendliesInGraveyard.length - 1];

           const indexInMain = newGraveyard.indexOf(bodyToRaise);
           if (indexInMain > -1) {
               newGraveyard = newGraveyard.filter((_, i) => i !== indexInMain);
           }

           // Spawn Revived Piece
           const revivedPiece = bodyToRaise.with({
               hex: targetHex,
               damage: 0,
               canMove: false,
               canAttack: false,
               isRevived: true, 
               souls: 0 
           });
           
           newPieces.push(revivedPiece);
           // Deduct soul
           newPieces = newPieces.map(p => p.hex.equals(source.hex) ? p.with({ souls: p.souls - 1 }) : p);
       }

       const newPieceMap = createPieceMap(newPieces);
       
       const tempState: GameState = { ...state, pieces: newPieces, pieceMap: newPieceMap };
       const increment = RuleEngine.getTurnCounterIncrement(tempState, board); 

       const abilityNotation = `${source.type} ${notation}`;
       const record = this.createMoveRecord(abilityNotation, state);
       const newMoveHistory = this.appendHistory(state, record);

        const result = StateMutator.checkTurnTransitions({
           ...state,
           pieces: newPieces,
           pieceMap: newPieceMap,
           movingPiece: null,
           turnCounter: state.turnCounter + increment,
           moveHistory: newMoveHistory,
           graveyard: newGraveyard,
           phoenixRecords: newPhoenixRecords
      });

       return {
           ...result,
           moveTree: this.recordMoveInTree(result, record)
       };
  }

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
      
      const record = this.createMoveRecord(notation, state);
      const newMoveHistory = this.appendHistory(state, record);
      
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

        const result = StateMutator.checkTurnTransitions({
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
            moveTree: this.recordMoveInTree(result, record)
        };
  }

  /**
   * Checks if we need to reset turn flags based on phase transitions.
   * - Resets at start of new Player Turn (turnCounter % 5 === 0)
   * - Auto-skips Movement phase if current player has no moveable pieces
   * - Helper to centralize this logic
   */
  private static checkTurnTransitions(state: GameState): GameState {
      let newState = state;

      // Delegate Phoenix Respawns to DeathSystem
      if (newState.phoenixRecords && newState.phoenixRecords.length > 0) {
          newState = DeathSystem.processPhoenixRespawns(newState);
      }

      // 1. Decrement sanctuary cooldowns at the start of EACH player's turn (faster feedback)
      // PHASES_PER_TURN = 10, PHASE_CYCLE_LENGTH = 5
      // Runs at 0 (White start) and 5 (Black start)
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          // Identify whose turn just started
          const currentPhaseStartPlayer = (newState.turnCounter % 10) < 5 ? 'w' : 'b';

          if (newState.sanctuaries && newState.sanctuaries.length > 0) {
              
              // Count "Invaders" for cooldown reduction bonus
              // An invader is a NON-SWORDSMAN piece on the enemy side of the river
              let whiteInvaders = 0;
              let blackInvaders = 0;
              
              newState.pieces.forEach(p => {
                  if (p.type === PieceType.Swordsman) return;
                  
                  // White piece (starts bottom, r>0) invading Top (r<0)
                  if (p.color === 'w' && p.hex.r < 0) {
                      whiteInvaders++;
                  }
                  // Black piece (starts top, r<0) invading Bottom (r>0)
                  if (p.color === 'b' && p.hex.r > 0) {
                      blackInvaders++;
                  }
              });

              const updatedSanctuaries = newState.sanctuaries.map(s => {
                  // Only update cooldowns for the player whose turn it is
                  if (s.territorySide !== currentPhaseStartPlayer) return s;

                  if (s.cooldown <= 0) return s;
                  
                  // Standard reduction is 1
                  let reduction = 1;
                  
                  // Add bonus for invaders
                  if (s.territorySide === 'w') {
                      reduction += whiteInvaders;
                  } else if (s.territorySide === 'b') {
                      reduction += blackInvaders;
                  }
                  
                  const newCooldown = Math.max(0, s.cooldown - reduction);
                  return s.with({ cooldown: newCooldown });
              });
              newState = { ...newState, sanctuaries: updatedSanctuaries };
          }
      }

      // 2. Global Reset (canMove, canAttack, damage) at the start of EACH player's turn
      // PHASE_CYCLE_LENGTH = 5 (indices 0 and 5)
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          newState = StateMutator.resetTurnFlags(newState);
      }
      
      // 3. Auto-skip Movement phase if current player has no moveable pieces
      // This handles the case where a player has only 1 piece and it already moved
      const currentPhase = TurnManager.getTurnPhase(newState.turnCounter);
      if (currentPhase === "Movement") {
          const currentPlayer = TurnManager.getCurrentPlayer(newState.turnCounter);
          const moveablePieces = newState.pieces.filter(
              p => p.color === currentPlayer && p.canMove
          );
          
          if (moveablePieces.length === 0) {
              // Skip remaining movement actions by advancing to Attack phase
              // Movement phase uses indices 0-1, so we need to get to index 2
              const phaseIndex = newState.turnCounter % PHASE_CYCLE_LENGTH;
              if (phaseIndex < 2) {
                  // Jump to Attack phase (index 2)
                  const skipAmount = 2 - phaseIndex;
                  newState = { ...newState, turnCounter: newState.turnCounter + skipAmount };
              }
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
}
