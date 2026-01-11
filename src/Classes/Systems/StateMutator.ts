/**
 * @file StateMutator.ts
 * @description Pure functions for immutable game state transitions.
 * @deprecated Please usage specialized mutators in ./Mutators/ directory.
 * This class acts as a facade layer to maintain backward compatibility during refactoring.
 */
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { GameState } from "../Core/GameState";
import { Board } from "../Core/Board";
import { AbilityType } from "../../Constants";

// Import specialized mutators
import { MovementMutator } from "./Mutators/MovementMutator";
import { CombatMutator } from "./Mutators/CombatMutator";
import { TurnMutator } from "./Mutators/TurnMutator";
import { AbilityMutator } from "./Mutators/AbilityMutator";
import { RecruitmentMutator } from "./Mutators/RecruitmentMutator";

export class StateMutator {

  // ================= PUBLIC MUTATIONS (Facade) =================

  public static applyMove(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    return MovementMutator.applyMove(state, piece, targetHex, board);
  }

  public static applyCastleAttack(state: GameState, piece: Piece, targetHex: Hex, board: Board): GameState {
    return CombatMutator.applyCastleAttack(state, piece, targetHex, board);
  }

  public static applyAttack(state: GameState, attacker: Piece, targetHex: Hex, board: Board): GameState {
    return CombatMutator.applyAttack(state, attacker, targetHex, board);
  }

  public static passTurn(state: GameState, board: Board): GameState {
    return TurnMutator.passTurn(state, board);
  }

  public static activateAbility(state: GameState, source: Piece, targetHex: Hex, ability: AbilityType, board: Board): GameState {
    return AbilityMutator.activateAbility(state, source, targetHex, ability, board);
  }

  public static recruitPiece(state: GameState, castle: Castle, hex: Hex, board: Board): GameState {
    return RecruitmentMutator.recruitPiece(state, castle, hex, board);
  }

  public static resetTurnFlags(state: GameState): GameState {
    return TurnMutator.resetTurnFlags(state);
  }
}
