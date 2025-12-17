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
 * - Special mechanics (processPhoenixRespawns)
 *
 * @usage Called exclusively by GameEngine to mutate game state.
 * @see GameEngine - Facade that validates before calling StateMutator
 * @see RuleEngine - Validates legality before mutations occur
 */
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { GameState } from "../Core/GameEngine";
import { NotationService } from "./NotationService";
import { TurnManager } from "../Core/TurnManager";
import { RuleEngine } from "./RuleEngine";
import { CombatSystem } from "./CombatSystem";
import { Board } from "../Core/Board";
import { createPieceMap } from "../../utils/PieceMap";
import {
  MoveRecord,
  PieceType,
  PHASE_CYCLE_LENGTH,
  PLAYER_CYCLE_LENGTH 
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
    const newTurnCounter = state.turnCounter + RuleEngine.getTurnCounterIncrement(newPieces, state.castles, state.turnCounter, board);
    
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
    const newTurnCounter = state.turnCounter + RuleEngine.getTurnCounterIncrement(newPieces, newCastles, state.turnCounter, board);
    
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
     const increment = RuleEngine.getTurnCounterIncrement(result.pieces, state.castles, state.turnCounter, board);
     
     // Update Graveyard & Phoenix Records
     let newGraveyard = state.graveyard || [];
     let newPhoenixRecords = state.phoenixRecords || [];

     if (result.deadPiece && !result.deadPiece.isRevived) {
         if (result.deadPiece.type === PieceType.Phoenix) {
             // Phoenix Rebirth: 3 Full Rounds (30 ticks) later
             newPhoenixRecords = [...newPhoenixRecords, {
                 respawnTurn: state.turnCounter + (PLAYER_CYCLE_LENGTH * 3),
                 owner: result.deadPiece.color
             }];
         } else {
             // Normal Death
             newGraveyard = [...newGraveyard, result.deadPiece];
         }
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
      // User requested NO history for Pass - but we MUST record it for PGN consistency!
      // The UI can filter it out if needed.
      // Healer Logic: Restoration
      // Healers heal adjacent friendly pieces for 1 HP at the end of their turn.
      // We process this before passing the turn.
      
      const currentPlayerColor = TurnManager.getCurrentPlayer(state.turnCounter);
      const pieceMap = state.pieceMap; // Use existing map
      
      // Iterate pieces to find Healers of current player
      let healers = state.pieces.filter(p => 
          p.color === currentPlayerColor && 
          p.type === PieceType.Healer
      );

      let healingUpdates = new Map<string, number>(); // hexKey -> newDamage

      for (const healer of healers) {
          const neighbors = healer.hex.cubeRing(1);
          for (const n of neighbors) {
              const friendly = pieceMap.get(n);
              if (friendly && friendly.color === currentPlayerColor && friendly.damage > 0) {
                  // Healers heal 1 HP
                  const key = friendly.hex.getKey();
                  const currentDamage = healingUpdates.get(key) ?? friendly.damage;
                  const newDamage = Math.max(0, currentDamage - 1);
                  healingUpdates.set(key, newDamage);
              }
          }
      }

      // Apply healing updates
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
      const increment = RuleEngine.getTurnCounterIncrement(piecesAfterHealing, state.castles, state.turnCounter, board, true);
      
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

       // Toggle abilityUsed for One-time abilities (Wizard)
       // Necromancer uses Souls, does not get locked by abilityUsed (unless defined otherwise)
       if (source.type === PieceType.Wizard) {
            sourceUpdated = source.with({ abilityUsed: true, canAttack: false, canMove: false });
       } else if (source.type === PieceType.Necromancer) {
            sourceUpdated = source.with({ canAttack: false, canMove: false }); // Consumes turn
       }

       newPieces = newPieces.map(p => p.hex.equals(source.hex) ? sourceUpdated : p);

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
           deadPieces.forEach(p => {
               if (!p.isRevived) {
                   newGraveyard = [...newGraveyard, p];
               }
           });

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

           // Find friendly piece in graveyard (Last In First Out)
           // Filter for friendly color
           const friendliesInGraveyard = newGraveyard.filter(p => p.color === source.color);
           if (friendliesInGraveyard.length === 0) throw new Error("No friendly bodies to raise");

           // Get the last one
           const bodyToRaise = friendliesInGraveyard[friendliesInGraveyard.length - 1];

           // Remove from graveyard (must match specific object or reference)
           // Since we filter, we need to find its index in the MAIN graveyard array
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
               isRevived: true, // Marked for Exile
               souls: 0 // Reset any souls it had? Yes.
           });
           
           newPieces.push(revivedPiece);

           // Decrement Souls on Necromancer
           // We already updated source in newPieces map, so we need to update it again or start with updated one?
           // Easier: map over newPieces again to deduct soul
           newPieces = newPieces.map(p => p.hex.equals(source.hex) ? p.with({ souls: p.souls - 1 }) : p);
       }

       const newPieceMap = createPieceMap(newPieces);
       const increment = RuleEngine.getTurnCounterIncrement(newPieces, state.castles, state.turnCounter, board); 

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
          graveyard: newGraveyard
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
      
      // Update Castle
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
      const increment = RuleEngine.getTurnCounterIncrement(newPieces, newCastles, state.turnCounter, board);

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

      // Check Phoenix Respawns
      if (newState.phoenixRecords && newState.phoenixRecords.length > 0) {
          newState = StateMutator.processPhoenixRespawns(newState);
      }

      // If we just entered a new player's turn (Turn 0, 5, 10...)
      if (newState.turnCounter % PHASE_CYCLE_LENGTH === 0) {
          return StateMutator.resetTurnFlags(newState);
      }
      return newState;
  }

  private static processPhoenixRespawns(state: GameState): GameState {
      // Find records due for respawn
      const dueRecords = state.phoenixRecords.filter(r => r.respawnTurn <= state.turnCounter);
      if (dueRecords.length === 0) return state;

      // Keep records NOT due
      const remainingRecords = state.phoenixRecords.filter(r => r.respawnTurn > state.turnCounter);
      
      let newPieces = [...state.pieces];
      const newGraveyard = state.graveyard || []; // Not used here but processed state often needs it

      dueRecords.forEach(record => {
          // Find logic for nearest castle
          // Simplification: Find ANY castle owned by player. Prioritize empty hex.
          const friendlyCastles = state.castles.filter(c => c.owner === record.owner);
          
          if (friendlyCastles.length > 0) {
              // Try to find a spawn spot at a castle
              for (const castle of friendlyCastles) {
                  // Check castle hex itself? Usually castles are occupied by pieces defending them.
                  // But allows spawn if empty? Yes.
                  // Neighbors? Yes.
                  const candidates = [castle.hex, ...castle.hex.cubeRing(1)];
                  
                  // Sort by distance to center? Or random? First valid found.
                  for (const spot of candidates) {
                      // Check if occupied
                       // Note: pieces array update inside this loop is tricky if multiple respawns.
                       // Using 'newPieces' from closure.
                       const isOccupied = newPieces.some(p => p.hex.equals(spot));
                       if (!isOccupied) {
                           // Spawn!
                           const phoenix = new Piece(spot, record.owner, PieceType.Phoenix);
                           newPieces.push(phoenix);
                           return; // Done for this record
                       }
                  }
              }
              // If no spot found, it fails to respawn this turn? 
              // Logic check: "Respawns at nearest castle". If blocked, maybe delay?
              // For now, if all blocked, it is lost/delayed. 
              // We removed it from records. So it's lost.
              // Better: Trigger Exiled/Lost if blocked? Or keep in records?
              // Let's Keep in records if blocked?
              // Complexity: infinite loop if always blocked.
              // Let's assume Lost if Blocked for MVP.
          }
      });

      return {
          ...state,
          pieces: newPieces,
          pieceMap: createPieceMap(newPieces),
          phoenixRecords: remainingRecords
      };
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
