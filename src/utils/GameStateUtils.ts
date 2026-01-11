/**
 * @file GameStateUtils.ts
 * @description Utility functions for GameState operations.
 * 
 * Centralizes common patterns like:
 * - Creating history snapshots
 * - State cloning helpers
 */
import { MoveRecord } from "../Constants";
import { GameState, PositionSnapshot } from "../Classes/Core/GameState";
import { createPieceMap } from "./PieceMap";

/**
 * Creates a snapshot of the current game state for history tracking.
 * This is used within the MoveTree nodes to enable navigation/variations.
 * 
 * @param state - The current game state to snapshot
 * @returns A cloned PositionSnapshot representing the state at this point
 */
export function createHistorySnapshot(state: GameState): PositionSnapshot {
    const pieces = state.pieces.map(p => p.clone());
    return {
        pieces: pieces,
        pieceMap: createPieceMap(pieces),
        castles: state.castles.map(c => c.clone()),
        sanctuaries: state.sanctuaries?.map(s => s.clone()) ?? [],
        turnCounter: state.turnCounter,
        sanctuaryPool: [...state.sanctuaryPool],
        graveyard: state.graveyard.map(p => p.clone()),
        phoenixRecords: [...state.phoenixRecords]
    };
}
