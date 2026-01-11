/**
 * @file GameStateUtils.ts
 * @description Utility functions for GameState operations.
 * 
 * Centralizes common patterns like:
 * - Creating history snapshots
 * - State cloning helpers
 */
import { HistoryEntry, MoveRecord } from "../Constants";
import { GameState } from "../Classes/Core/GameState";

/**
 * Creates a snapshot of the current game state for history tracking.
 * This is used within the MoveTree nodes to enable navigation/variations.
 * 
 * @param state - The current game state to snapshot
 * @returns A cloned HistoryEntry representing the state at this point
 */
export function createHistorySnapshot(state: GameState): HistoryEntry {
    return {
        pieces: state.pieces.map(p => p.clone()),
        castles: state.castles.map(c => c.clone()),
        sanctuaries: state.sanctuaries?.map(s => s.clone()) ?? [],
        turnCounter: state.turnCounter,
        moveNotation: state.moveTree ? state.moveTree.getHistoryLine() : []
    };
}
