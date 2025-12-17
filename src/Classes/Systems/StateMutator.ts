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
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { GameState } from "../Core/GameEngine";
import { NotationService } from "./NotationService";
import { TurnManager } from "../Core/TurnManager";
import { RuleEngine } from "./RuleEngine";
import { CombatSystem } from "./CombatSystem";
import { DeathSystem } from "./DeathSystem";
import { Board } from "../Core/Board";
import { createPieceMap } from "../../utils/PieceMap";
import {
  MoveRecord,
  PieceType,
  PHASE_CYCLE_LENGTH,
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
   * Appends a move record to the history and updates the MoveTree.
   * Handles undefined moveHistory gracefully.
   */
  private static appendHistory(state: GameState, record: MoveRecord): MoveRecord[] {
    if (state.moveTree) {
        state.moveTree.addMove(record);
    }
    return [...(state.moveHistory || []), record];
  }

  // ================= PUBLIC MUTATIONS =================

  public static applyMove(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    const notation = NotationService.getMoveNotation(piece, targetHex);
    const record = this.createMoveRecord(notation, state);
    const newMoveHistory = this.appendHistory(state, record);

    const newPieces = state.pieces.map(p => {
        if (p === piece) {
            // Use immutable update via 'with'
            return p.with({ hex: targetHex, canMove: false });
        }
        return p;
    });

    const newPieceMap = createPieceMap(newPieces);
    
    // Create temp state for rule check
    const tempState: GameState = { ...state, pieces: newPieces, pieceMap: newPieceMap };
    const newTurnCounter = state.turnCounter + RuleEngine.getTurnCounterIncrement(tempState, board);
    
    let nextState: GameState = {
        ...state,
        pieces: newPieces,
        pieceMap: newPieceMap,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    };
    
    if (state.turnCounter % PHASE_CYCLE_LENGTH === 1) {
       nextState = StateMutator.resetTurnFlags(nextState);
    }

    return StateMutator.checkTurnTransitions(nextState);
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
        if (p === piece) {
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
    
    return StateMutator.checkTurnTransitions({
        ...state,
        pieces: newPieces,
        pieceMap: newPieceMap,
        castles: newCastles,
        movingPiece: null,
        turnCounter: newTurnCounter,
        moveHistory: newMoveHistory
    });
  }

  public static applyAttack(state: GameState, attacker: Piece, targetHex: Hex, board: Board): GameState {
     const notation = NotationService.getAttackNotation(attacker, targetHex);
     const record = this.createMoveRecord(notation, state);
     const newMoveHistory = this.appendHistory(state, record);

     // Use CombatSystem to resolve the logic
     const result = CombatSystem.resolveAttack(state.pieces, attacker, targetHex, state.pieceMap);

     const newPieceMap = createPieceMap(result.pieces);
     
     const tempState: GameState = { ...state, pieces: result.pieces, pieceMap: newPieceMap };
     const increment = RuleEngine.getTurnCounterIncrement(tempState, board);
     
     // Delegate Death Processing to DeathSystem
     let newGraveyard = state.graveyard || [];
     let newPhoenixRecords = state.phoenixRecords || [];

     if (result.deadPiece) {
         const updates = DeathSystem.processDeath(state, result.deadPiece);
         if (updates.graveyard) newGraveyard = updates.graveyard;
         if (updates.phoenixRecords) newPhoenixRecords = updates.phoenixRecords;
     }
      
     return StateMutator.checkTurnTransitions({
          ...state,
          pieces: result.pieces,
          pieceMap: newPieceMap,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory,
          graveyard: newGraveyard,
          phoenixRecords: newPhoenixRecords
     });
  }

  public static passTurn(state: GameState, board: Board): GameState {
      // Healer Logic: Restoration
      const currentPlayerColor = TurnManager.getCurrentPlayer(state.turnCounter);
      const pieceMap = state.pieceMap; 
      
      let healers = state.pieces.filter(p => 
          p.color === currentPlayerColor && 
          p.type === PieceType.Healer
      );

      let healingUpdates = new Map<string, number>();

      for (const healer of healers) {
          const neighbors = healer.hex.cubeRing(1);
          for (const n of neighbors) {
              const friendly = pieceMap.get(n);
              if (friendly && friendly.color === currentPlayerColor && friendly.damage > 0) {
                  const key = friendly.hex.getKey();
                  const currentDamage = healingUpdates.get(key) ?? friendly.damage;
                  const newDamage = Math.max(0, currentDamage - 1);
                  healingUpdates.set(key, newDamage);
              }
          }
      }

      let piecesAfterHealing = state.pieces;
      if (healingUpdates.size > 0) {
          piecesAfterHealing = state.pieces.map(p => {
              if (healingUpdates.has(p.hex.getKey())) {
                  return p.with({ damage: healingUpdates.get(p.hex.getKey()) });
              }
              return p;
          });
      }

      const notation = NotationService.getPassNotation();
      const record = this.createMoveRecord(notation, state);
      const newMoveHistory = this.appendHistory(state, record);
      
      const tempState: GameState = { ...state, pieces: piecesAfterHealing, pieceMap: createPieceMap(piecesAfterHealing) };
      const increment = RuleEngine.getTurnCounterIncrement(tempState, board, true);
      
      return StateMutator.checkTurnTransitions({
          ...state,
          pieces: piecesAfterHealing, // Updated with healing
          pieceMap: createPieceMap(piecesAfterHealing), // Rebuild map
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory
      });
  }

  public static activateAbility(state: GameState, source: Piece, targetHex: Hex, ability: "Fireball" | "Teleport" | "RaiseDead", board: Board): GameState {
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

       if (ability === "Fireball") {
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

       } else if (ability === "Teleport") {
           notation = `Teleport -> ${targetHex.toString()}`;
           if (state.pieceMap.has(targetHex)) throw new Error("Teleport target blocked");
           
           newPieces = newPieces.map(p => p.hex.getKey() === source.hex.getKey() 
                ? p.with({ hex: targetHex })
                : p
           );
       } else if (ability === "RaiseDead") {
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

       return StateMutator.checkTurnTransitions({
          ...state,
          pieces: newPieces,
          pieceMap: newPieceMap,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory,
          graveyard: newGraveyard,
          phoenixRecords: newPhoenixRecords
     });
  }



  public static recruitPiece(state: GameState, castle: Castle, hex: Hex, board: Board): GameState {
      const pieceTypes = Object.values(PieceType);
      const pieceType = pieceTypes[castle.turns_controlled % pieceTypes.length];
      
      const notation = NotationService.getRecruitNotation(castle, pieceType, hex);
      
      const record = this.createMoveRecord(notation, state);
      const newMoveHistory = this.appendHistory(state, record);
      
      const newPiece = new Piece(hex, TurnManager.getCurrentPlayer(state.turnCounter), pieceType);
      
      const newPieces = [...state.pieces, newPiece];
      
      const newCastles = state.castles.map(c => {
          if (c === castle) {
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

      return StateMutator.checkTurnTransitions({
          ...state,
          pieces: newPieces,
          pieceMap: newPieceMap,
          castles: newCastles,
          movingPiece: null,
          turnCounter: state.turnCounter + increment,
          moveHistory: newMoveHistory
      });
  }

  /**
   * Checks if we need to reset turn flags based on phase transitions.
   * - Resets at start of new Player Turn (turnCounter % 5 === 0)
   * - Helper to centralize this logic
   */
  private static checkTurnTransitions(state: GameState): GameState {
      let newState = state;

      // Delegate Phoenix Respawns to DeathSystem
      if (newState.phoenixRecords && newState.phoenixRecords.length > 0) {
          newState = DeathSystem.processPhoenixRespawns(newState);
      }

      // If we just entered a new player's turn (Turn 0, 5, 10...)
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          return StateMutator.resetTurnFlags(newState);
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
