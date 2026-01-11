/**
 * @file ActionOrchestrator.ts
 * @description Centralizes the orchestration of game state updates after an action is performed.
 * 
 * Handles redundant tasks like:
 * - Syncing PieceMap
 * - Creating MoveRecords
 * - Updating MoveHistory and MoveTree
 * - Calculating Turn Counter Increments
 * - Handling Turn/Phase transitions
 */
import { GameState } from "../../Core/GameState";
import { Board } from "../../Core/Board";
import { MoveRecord } from "../../../Constants";
import { MutatorUtils } from "./MutatorUtils";
import { RuleEngine } from "../RuleEngine";
import { TurnMutator } from "./TurnMutator";
import { createPieceMap } from "../../../utils/PieceMap";

export class ActionOrchestrator {
  /**
   * Finalizes a game action by applying standard state updates and transitions.
   * 
   * @param state - The current game state before the action
   * @param partialState - The modified parts of the state (e.g., pieces, castles)
   * @param notation - The move notation string
   * @param board - The game board for rule queries
   * @param isPassing - Whether this action is a "Pass" (affects turn increment)
   */
  public static finalizeAction(
    state: GameState,
    partialState: Partial<GameState>,
    notation: string,
    board: Board,
    isPassing: boolean = false
  ): GameState {
    // 1. Merge partial state
    let newState: GameState = { 
        ...state, 
        ...partialState,
        movingPiece: null // Deselect piece after any action
    };

    // 2. Sync PieceMap if pieces changed
    if (partialState.pieces) {
        newState.pieceMap = createPieceMap(newState.pieces);
    }

    // 3. Create Record
    const record = MutatorUtils.createMoveRecord(notation, state);

    // 4. Calculate Turn Increment
    // We use newState here because RuleEngine needs to see the result of the action (e.g. piece moved)
    const increment = RuleEngine.getTurnCounterIncrement(newState, board, isPassing);
    newState.turnCounter = state.turnCounter + increment;

    // 5. Run Turn Transitions (Phoenixes, Sanctuary Cooldowns, Global Resets)
    newState = TurnMutator.checkTurnTransitions(newState);

    // 6. Finalize MoveTree (Single Source of Truth)
    newState.moveTree = MutatorUtils.recordMoveInTree(newState, record);

    return newState;
  }
}
