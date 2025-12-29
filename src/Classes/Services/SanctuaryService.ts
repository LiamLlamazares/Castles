/**
 * @file SanctuaryService.ts
 * @description Handles sanctuary pledging and evolution mechanics.
 *
 * Sanctuaries are special map locations where players can summon powerful
 * fantasy creatures by meeting strength requirements. This service provides:
 * - Pledge eligibility checks (canPledge)
 * - Pledge execution with sanctuary evolution (pledge)
 * - Helper functions for strength calculation
 *
 * EVOLUTION SYSTEM:
 * When a sanctuary is pledged, it evolves into the next available higher-tier
 * sanctuary type from the pool. The evolved sanctuary has a cooldown before
 * it can be pledged again. When no higher-tier types remain, the sanctuary
 * becomes permanently inactive.
 *
 * @usage Called by GameEngine.canPledge() and GameEngine.pledge()
 * @see Sanctuary - Entity class for sanctuary state
 * @see SanctuaryGenerator - Creates sanctuaries during setup
 */
import { Piece } from "../Entities/Piece";
import { PieceFactory } from "../Entities/PieceFactory";
import { Sanctuary } from "../Entities/Sanctuary";
import { Hex } from "../Entities/Hex";
import { GameState } from "../Core/GameEngine";
import { TurnManager } from "../Core/TurnManager";
import { NotationService } from "../Systems/NotationService";
import { createPieceMap } from "../../utils/PieceMap";
import { createHistorySnapshot } from "../../utils/GameStateUtils";
import { SanctuaryType, SanctuaryConfig, SANCTUARY_EVOLUTION_COOLDOWN, MoveRecord, PHASE_CYCLE_LENGTH } from "../../Constants";

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

    // 1b. Turn Requirement (Sanctuaries dormant until configured unlock turn)
    // Default: Turn 10 = turnCounter >= 10 * PHASE_CYCLE_LENGTH * 2 (5 phases per player, 2 players per turn)
    const TURN_UNLOCK = gameState.sanctuarySettings?.unlockTurn ?? 10;
    if (gameState.turnCounter < TURN_UNLOCK * PHASE_CYCLE_LENGTH * 2) return false;

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
   * After pledging, the sanctuary evolves to the next higher-tier type.
   * Records the pledge in moveHistory and moveTree for PGN export.
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
    const newPiece = PieceFactory.fromType(sanctuary.pieceType, spawnHex, occupant.color);
    newPieces.push(newPiece);

    // ===== SANCTUARY EVOLUTION =====
    // Find the next sanctuary type from the pool that is a higher tier
    const { evolvedType, newPool } = this.getNextEvolution(
      gameState.sanctuaryPool,
      sanctuary.tier
    );

    // Also find the mirrored sanctuary (for fairness, both evolve together)
    const mirroredHex = new Hex(-sanctuary.hex.q, -sanctuary.hex.r, -sanctuary.hex.s);
    const mirroredSanctuary = gameState.sanctuaries.find(s => s.hex.equals(mirroredHex));

    // Get cooldown from settings or use default
    const cooldownTurns = gameState.sanctuarySettings?.cooldown ?? SANCTUARY_EVOLUTION_COOLDOWN;

    // Update ALL sanctuaries (including mirrored one if it exists)
    const newSanctuaries = gameState.sanctuaries.map(s => {
      // Update the pledged sanctuary
      if (s.hex.equals(sanctuaryHex)) {
        if (evolvedType) {
          // Evolve to higher tier with cooldown
          return s.with({ 
            type: evolvedType, 
            cooldown: cooldownTurns, 
            hasPledgedThisGame: false // Reset so it can be pledged again after cooldown
          });
        } else {
          // No evolution available - sanctuary becomes inactive
          return s.with({ hasPledgedThisGame: true, cooldown: 0 });
        }
      }
      // Also evolve the mirrored sanctuary (both sides stay in sync)
      if (mirroredSanctuary && s.hex.equals(mirroredHex)) {
        if (evolvedType) {
          return s.with({ 
            type: evolvedType, 
            cooldown: cooldownTurns, 
            hasPledgedThisGame: false 
          });
        } else {
          return s.with({ hasPledgedThisGame: true, cooldown: 0 });
        }
      }
      return s;
    });

    // ===== RECORD MOVE IN HISTORY & TREE =====
    const notation = NotationService.getPledgeNotation(sanctuary.pieceType, spawnHex);
    const record: MoveRecord = {
      notation,
      turnNumber: Math.floor(gameState.turnCounter / 10) + 1,
      color: TurnManager.getCurrentPlayer(gameState.turnCounter),
      phase: TurnManager.getTurnPhase(gameState.turnCounter)
    };
    const newMoveHistory = [...(gameState.moveHistory || []), record];

    // Build intermediate state for snapshot
    const intermediateState: GameState = {
      ...gameState,
      pieces: newPieces,
      pieceMap: createPieceMap(newPieces),
      sanctuaries: newSanctuaries,
      sanctuaryPool: newPool,
      moveHistory: newMoveHistory,
    };

    // Update moveTree with the pledge record and snapshot
    const newTree = gameState.moveTree.clone();
    newTree.addMove(record, createHistorySnapshot(intermediateState));

    return {
      ...intermediateState,
      moveTree: newTree,
    };
  }

  /**
   * Finds the next sanctuary type for evolution from the pool.
   * Prioritizes lower tiers first (Tier 2 before Tier 3).
   * Returns null if no higher-tier types remain.
   */
  private static getNextEvolution(
    pool: SanctuaryType[],
    currentTier: 1 | 2 | 3
  ): { evolvedType: SanctuaryType | null; newPool: SanctuaryType[] } {
    // Find types of higher tier, sorted by tier (lower first)
    const higherTiers = pool
      .filter(t => SanctuaryConfig[t].tier > currentTier)
      .sort((a, b) => SanctuaryConfig[a].tier - SanctuaryConfig[b].tier);

    if (higherTiers.length === 0) {
      return { evolvedType: null, newPool: pool };
    }

    // Take the first (lowest tier) available
    const evolvedType = higherTiers[0];
    const newPool = pool.filter(t => t !== evolvedType);

    return { evolvedType, newPool };
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

