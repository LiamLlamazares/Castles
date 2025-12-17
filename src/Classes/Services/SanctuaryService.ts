/**
 * @file SanctuaryService.ts
 * @description Handles sanctuary pledging mechanics.
 *
 * Sanctuaries are special map locations where players can summon powerful
 * fantasy creatures by meeting strength requirements. This service provides:
 * - Pledge eligibility checks (canPledge)
 * - Pledge execution (pledge)
 * - Helper functions for strength calculation
 *
 * @usage Called by GameEngine.canPledge() and GameEngine.pledge()
 * @see Sanctuary - Entity class for sanctuary state
 * @see SanctuaryGenerator - Creates sanctuaries during setup
 */
import { Piece } from "../Entities/Piece";
import { Sanctuary } from "../Entities/Sanctuary";
import { Hex } from "../Entities/Hex";
import { GameState } from "../Core/GameEngine";
import { TurnManager } from "../Core/TurnManager";
import { createPieceMap } from "../../utils/PieceMap";
import { PieceType } from "../../Constants";

export class SanctuaryService {
  /**
   * Checks if a pledge action is valid for the given sanctuary.
   *
   * Validation includes:
   * 1. Sanctuary exists and is ready (not on cooldown, not already pledged)
   * 2. Current player has a piece on the sanctuary hex
   * 3. Total strength (occupant + friendly neighbors) meets requirement
   */
  public static canPledge(gameState: GameState, sanctuaryHex: Hex): boolean {
    const sanctuary = gameState.sanctuaries.find(s => s.hex.equals(sanctuaryHex));
    if (!sanctuary) return false;

    // 1. Basic Availability Check
    if (!sanctuary.isReady) return false;

    // 2. Control Check (Must have CURRENT PLAYER's piece on it)
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    const occupant = gameState.pieceMap.getByKey(sanctuaryHex.getKey());
    if (!occupant || occupant.color !== currentPlayer) return false;

    // 3. Strength Calculation (Occupant + Neighbors)
    const friendlyPieces = [occupant, ...this.getFriendlyNeighbors(gameState, sanctuaryHex, occupant.color)];
    const totalStrength = friendlyPieces.reduce((sum, p) => sum + p.Strength, 0);

    // 4. Requirement Check
    if (totalStrength < sanctuary.requiredStrength) return false;

    return true;
  }

  /**
   * Executes a pledge action, spawning a new piece from the sanctuary.
   *
   * @throws Error if pledge is invalid (should call canPledge first)
   */
  public static pledge(gameState: GameState, sanctuaryHex: Hex, spawnHex: Hex): GameState {
    const sanctuary = gameState.sanctuaries.find(s => s.hex.equals(sanctuaryHex));
    if (!sanctuary || !this.canPledge(gameState, sanctuaryHex)) {
      throw new Error("Invalid pledge action");
    }

    const occupant = gameState.pieceMap.getByKey(sanctuaryHex.getKey());
    if (!occupant) throw new Error("Sanctuary empty during pledge"); // Should be caught by canPledge

    let newPieces = [...gameState.pieces];

    // Handle Sacrifice for Tier 3
    if (sanctuary.requiresSacrifice) {
      // Sacrifice the occupant
      newPieces = newPieces.filter(p => !p.hex.equals(sanctuaryHex));
    }

    // Spawn new piece
    const newPiece = new Piece(spawnHex, occupant.color, sanctuary.pieceType);
    newPieces.push(newPiece);

    // Update Sanctuary (Cooldown + Pledged flag)
    const newSanctuaries = gameState.sanctuaries.map(s =>
      s.hex.equals(sanctuaryHex)
        ? s.with({ cooldown: 5, hasPledgedThisGame: true })
        : s
    );

    return {
      ...gameState,
      pieces: newPieces,
      pieceMap: createPieceMap(newPieces), // Rebuild map
      sanctuaries: newSanctuaries,
    };
  }

  /**
   * Gets all friendly pieces adjacent to a given hex.
   * Used for strength calculation during pledge validation.
   */
  public static getFriendlyNeighbors(gameState: GameState, hex: Hex, owner: string): Piece[] {
    const neighbors = hex.cubeRing(1);
    const friends: Piece[] = [];
    for (const n of neighbors) {
      const p = gameState.pieceMap.getByKey(n.getKey());
      if (p && p.color === owner) {
        friends.push(p);
      }
    }
    return friends;
  }
}
