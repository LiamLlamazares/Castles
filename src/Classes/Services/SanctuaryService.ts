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
import { GameState } from "../Core/GameState";
import { TurnManager } from "../Core/TurnManager";
import { NotationService } from "../Systems/NotationService";
import { SanctuaryType, SanctuaryConfig, SANCTUARY_EVOLUTION_COOLDOWN, PHASE_CYCLE_LENGTH, PHASES_PER_TURN, PLAYER_CYCLE_LENGTH } from "../../Constants";
import { Board } from "../Core/Board";
import { ActionOrchestrator } from "../Systems/Mutators/ActionOrchestrator";

export class SanctuaryService {
  /**
   * Checks if a pledge action is valid for the given sanctuary.
   *
   * Validation includes:
   * 1. Sanctuary exists and is ready (not on cooldown, not already pledged)
   * 2. Current player has a piece on the sanctuary hex
   * 3. Total strength (occupant + friendly neighbors) meets requirement
   */
  public static canPledge(gameState: GameState, board: Board, sanctuaryHex: Hex, ignorePhase: boolean = false): boolean {
    const sanctuary = gameState.sanctuaries.find(s => s.hex.equals(sanctuaryHex));
    if (!sanctuary) return false;

    // 1. Basic Availability Check
    if (!sanctuary.isReady) {
      console.log(`[SanctuaryDebug] Rejecting ${sanctuary.type}: Not Ready`);
      return false;
    }

    // 1b. Turn Requirement (Sanctuaries dormant until configured unlock turn)
    // Check if configuration allows early availability
    const config = SanctuaryConfig[sanctuary.type];
    const isAlwaysAvailable = config?.startAvailable === true;

    if (!isAlwaysAvailable) {
        const TURN_UNLOCK = gameState.sanctuarySettings?.unlockTurn ?? 10;
        // One turn = PHASES_PER_TURN sub-phases (usually 10)
        if (gameState.turnCounter < TURN_UNLOCK * PHASES_PER_TURN) {
           console.log(`[SanctuaryDebug] Rejecting ${sanctuary.type}: Turn Timer (Counter: ${gameState.turnCounter} < Unlock: ${TURN_UNLOCK * PHASES_PER_TURN})`);
           return false;
        }
    }

    // 1c. Phase Requirement (Recruitment Phase Only)
    // We explicitly skip this check if ignorePhase is true (used by RuleEngine for lookahead)
    if (!ignorePhase && TurnManager.getTurnPhase(gameState.turnCounter) !== "Recruitment") {
      // Don't log this one, it's too spammy during Move/Attack phases
      return false;
    }

    // 2. Control Check (Must have CURRENT PLAYER's piece on it)
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    const occupant = gameState.pieceMap.getByKey(sanctuaryHex.getKey());
    if (!occupant || occupant.color !== currentPlayer) {
       console.log(`[SanctuaryDebug] Rejecting ${sanctuary.type}: Not Controlled (Occupant: ${occupant?.color} vs Player: ${currentPlayer})`);
       return false;
    }

    // 3. Strength Calculation (Occupant + Neighbors)
    const friendlyPieces = [occupant, ...this.getFriendlyNeighbors(gameState, sanctuaryHex, occupant.color)];
    const totalStrength = friendlyPieces.reduce((sum, p) => sum + p.Strength, 0);

    // 4. Requirement Check
    if (totalStrength < sanctuary.requiredStrength) {
        console.log(`[SanctuaryDebug] Rejecting ${sanctuary.type}: Insufficient Strength (${totalStrength} < ${sanctuary.requiredStrength})`);
        return false;
    }

    // 5. Valid Spawn Location Check
    // Must have at least one valid spawn hex (Empty + Not River + Not Castle)
    const adjacentHexes = sanctuaryHex.cubeRing(1);
    const hasValidNeighbor = adjacentHexes.some(hex => 
        !gameState.pieceMap.has(hex) && 
        !board.isRiver(hex) && 
        !board.isCastle(hex, board.NSquares)
    );
    
    if (!hasValidNeighbor) {
        console.log(`[SanctuaryDebug] Rejecting ${sanctuary.type}: No valid spawn location`);
        return false;
    }

    console.log(`[SanctuaryDebug] Accepting ${sanctuary.type}: Pledge Valid!`);
    return true;
  }

  /**
   * Executes a pledge action, spawning a new piece from the sanctuary.
   * After pledging, the sanctuary evolves to the next higher-tier type.
   * Records the pledge in the MoveTree for history and PGN export.
   *
   * @throws Error if pledge is invalid (should call canPledge first)
   */
  public static pledge(gameState: GameState, sanctuaryHex: Hex, spawnHex: Hex, board: Board): GameState {
    const sanctuary = gameState.sanctuaries.find(s => s.hex.equals(sanctuaryHex));
    if (!sanctuary || !this.canPledge(gameState, board, sanctuaryHex)) {
      throw new Error("Invalid pledge action");
    }

    const occupant = gameState.pieceMap.getByKey(sanctuaryHex.getKey());
    if (!occupant) throw new Error("Sanctuary empty during pledge"); // Should be caught by canPledge

    // Validate Spawn Location specific to this pledge action
    if (gameState.pieceMap.has(spawnHex)) throw new Error("Invalid spawn location: Occupied");
    if (board.isRiver(spawnHex)) throw new Error("Invalid spawn location: River");
    if (board.isCastle(spawnHex, board.NSquares)) throw new Error("Invalid spawn location: Castle");

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

    // Also find the mirrored sanctuary (for fairness, both evolve together) -- REMOVED AS PER REQUEST
    // const mirroredHex = new Hex(-sanctuary.hex.q, -sanctuary.hex.r, -sanctuary.hex.s);
    // const mirroredSanctuary = gameState.sanctuaries.find(s => s.hex.equals(mirroredHex));

    // Get cooldown from settings or use default
    const cooldownTurns = gameState.sanctuarySettings?.cooldown ?? SANCTUARY_EVOLUTION_COOLDOWN;

    // Update ALL sanctuaries
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
      return s;
    });

    const notation = NotationService.getPledgeNotation(sanctuary.pieceType, spawnHex);

    return ActionOrchestrator.finalizeAction(
        gameState,
        {
            pieces: newPieces,
            sanctuaries: newSanctuaries,
            sanctuaryPool: newPool
        },
        notation,
        board
    );
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
   * Attempts to unlock a sanctuary type in the pool based on a clicked piece.
   * If the piece corresponds to a sanctuary type that is not yet in the pool or on the board,
   * it adds it to the pool.
   * 
   * @returns The updated pool (or the original if no change)
   */
  public static tryUnlockSanctuary(
    currentPool: SanctuaryType[],
    pieceType: import("../../Constants").PieceType,
    currentSanctuaries: Sanctuary[]
  ): SanctuaryType[] {
      // Find if this piece type corresponds to a sanctuary
      const configEntry = Object.entries(SanctuaryConfig).find(
          ([_, conf]: any) => conf.pieceType === pieceType
      );
      
      if (configEntry) {
          const sanctuaryType = configEntry[0] as SanctuaryType;
          // Check if it is currently "locked" (not in pool and not on board)
          const isOnBoard = currentSanctuaries.some(s => s.type === sanctuaryType);
          const isInPool = currentPool.includes(sanctuaryType);
          
          if (!isInPool && !isOnBoard) {
              // Unlock it!
              console.log(`[SanctuaryService] Unlocked Sanctuary Type: ${sanctuaryType}`);
              return [...currentPool, sanctuaryType];
          }
      }
      
      return currentPool;
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

