/**
 * @file MutatorUtils.ts
 * @description Shared utility functions for state mutators.
 */
import { GameState } from "../../Core/GameState";
import { MoveRecord, PHASE_CYCLE_LENGTH } from "../../../Constants";
import { TurnManager } from "../../Core/TurnManager";
import { MoveTree } from "../../Core/MoveTree";
import { createHistorySnapshot } from "../../../utils/GameStateUtils";

export class MutatorUtils {
  /**
   * Creates a MoveRecord for the history log.
   */
  public static createMoveRecord(notation: string, state: GameState): MoveRecord {
    return {
      notation,
      turnNumber: Math.floor(state.turnCounter / 10) + 1,
      color: TurnManager.getCurrentPlayer(state.turnCounter),
      phase: TurnManager.getTurnPhase(state.turnCounter)
    };
  }

  /**
   * Appends a move record to the history.
   */
  public static appendHistory(state: GameState, record: MoveRecord): MoveRecord[] {
    return [...(state.moveHistory || []), record];
  }

  /**
   * Updates the MoveTree with a new move and a snapshot of the resulting state.
   */
  public static recordMoveInTree(state: GameState, record: MoveRecord): MoveTree {
      const newTree = state.moveTree.clone();
      newTree.addMove(record, createHistorySnapshot(state));
      return newTree;
  }
}
