/**
 * @file AbilityMutator.ts
 * @description Handles Ability logic (Fireball, Teleport, RaiseDead).
 */
import { GameState } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { Board } from "../../Core/Board";
import { NotationService } from "../NotationService";
import { MutatorUtils } from "./MutatorUtils";
import { RuleEngine } from "../RuleEngine";
import { DeathSystem } from "../DeathSystem";
import { createPieceMap } from "../../../utils/PieceMap";
import { TurnMutator } from "./TurnMutator";
import { AbilityType, PieceType } from "../../../Constants";

export class AbilityMutator {

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
           if (state.pieceMap.has(targetHex)) throw new Error("Teleport target blocked");
           
           newPieces = newPieces.map(p => p.hex.getKey() === source.hex.getKey() 
                ? p.with({ hex: targetHex })
                : p
           );
       } else if (ability === AbilityType.RaiseDead) {
           
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

       const abilityNotation = NotationService.getAbilityNotation(ability, source.type, source.hex, targetHex);
       const record = MutatorUtils.createMoveRecord(abilityNotation, state);
       const newMoveHistory = MutatorUtils.appendHistory(state, record);

        const result = TurnMutator.checkTurnTransitions({
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
           moveTree: MutatorUtils.recordMoveInTree(result, record)
       };
  }
}
