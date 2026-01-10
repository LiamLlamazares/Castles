/**
 * @file RuleEngine.ts
 * @description Pure query functions for game rules and legal actions.
 *
 * All methods are **static** and **pure** - they read state but never modify it.
 * Used for validation and legal move calculation before StateMutator applies changes.
 *
 * Provides:
 * - Legal move/attack calculation (getLegalMoves, getLegalAttacks)
 * - Hex queries (getBlockedHexes, getEnemyHexes, getDefendedHexes)
 * - Castle control (getControlledCastlesActivePlayer)
 * - Turn increment calculation (getTurnCounterIncrement)
 *
 * @usage Called by GameEngine for all rule queries.
 * @see GameEngine - Facade that exposes RuleEngine methods
 * @see TurnManager - Handles phase/player calculation
 * @see MoveStrategies - Individual piece movement patterns
 */
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { Board } from "../Core/Board";
import { TurnManager } from "../Core/TurnManager";
import { GameState } from "../Core/GameState";
import { SanctuaryService } from "../Services/SanctuaryService";
import {
  Color,
  AttackType,
  DEFENDED_PIECE_IS_PROTECTED_RANGED,
} from "../../Constants";

export class RuleEngine {
  // ================= BOARD QUERIES =================

  /** Returns all hexes currently occupied by pieces */
  public static getOccupiedHexes(gameState: GameState): Hex[] {
    return gameState.pieces.map((piece) => piece.hex);
  }

  /**
   * Returns all hexes that block ground movement.
   * Includes: rivers, enemy/neutral castles, and occupied hexes.
   * Friendly castles are passable (pieceColor determines friendship).
   */
  public static getBlockedHexes(gameState: GameState, board: Board, pieceColor?: Color): Hex[] {
    const occupied = RuleEngine.getOccupiedHexes(gameState);
    
    // Filter castles: only block if not owned by the moving piece's player
    const blockingCastleHexes = pieceColor
      ? board.castleHexes.filter(hex => {
          const castle = gameState.castles.find(c => c.hex.equals(hex));
          return !castle || castle.owner !== pieceColor;
        })
      : board.castleHexes; // If no color specified, all castles block
    
    return [
        ...board.riverHexes, 
        ...blockingCastleHexes, 
        ...occupied
    ];
  }

  /** Returns a Set of hex keys for O(1) blocked hex lookups */
  public static getBlockedHexSet(gameState: GameState, board: Board, pieceColor?: Color): Set<string> {
    const blockedHexes = RuleEngine.getBlockedHexes(gameState, board, pieceColor);
    return new Set(blockedHexes.map(hex => hex.getKey()));
  }
  
  public static getEnemyHexes(gameState: GameState, currentPlayer: Color): Hex[] {
    return gameState.pieces
      .filter((piece) => piece.color !== currentPlayer)
      .map((piece) => piece.hex);
  }

  public static getEnemyCastleHexes(gameState: GameState, currentPlayer: Color): Hex[] {
    return gameState.castles.filter(
      (castle) => {
          // Castle is enemy if color is different AND not controlled by us via occupation
          const isControlledByUs = RuleEngine.castleIsControlledByActivePlayer(castle, currentPlayer);
          return castle.color !== currentPlayer && !isControlledByUs;
      }
    ).map((castle) => castle.hex);
  }

  public static getAttackableHexes(gameState: GameState, currentPlayer: Color): Hex[] {
    return [...RuleEngine.getEnemyHexes(gameState, currentPlayer), ...RuleEngine.getEnemyCastleHexes(gameState, currentPlayer)];
  }

  /**
   * Returns hexes that are protected from ranged attacks.
   * These are hexes adjacent to enemy melee pieces.
   */
  public static getDefendedHexes(gameState: GameState, currentPlayer: Color, board: Board): Hex[] {
    if (!DEFENDED_PIECE_IS_PROTECTED_RANGED) return [];
    
    const enemyMeleePieces = gameState.pieces.filter(
      (piece) =>
        piece.color !== currentPlayer &&
        (piece.AttackType === AttackType.Melee || piece.AttackType === AttackType.Swordsman)
    );
    
    // Enemy melee pieces "defend" all hexes they can attack
    return enemyMeleePieces
      .flatMap((piece) => piece.legalAttacks(board.hexSet, board.highGroundHexSet));
  }

  // ================= LEGAL ACTIONS =================

  // This method calculates legal moves for a specific piece
  public static getLegalMoves(piece: Piece | null, gameState: GameState, board: Board): Hex[] {
    const phase = TurnManager.getTurnPhase(gameState.turnCounter);
    if (piece && phase === "Movement" && piece.canMove) {
        // Pass piece.color so friendly castles are passable
        const blockedSet = RuleEngine.getBlockedHexSet(gameState, board, piece.color);
        return piece.getLegalMoves(blockedSet, piece.color, board.hexSet);
    }
    return [];
  }

  public static getLegalAttacks(piece: Piece | null, gameState: GameState, board: Board): Hex[] {
      const phase = TurnManager.getTurnPhase(gameState.turnCounter);
      const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);

      if (piece && phase === "Attack" && piece.canAttack) {
          const attackable = RuleEngine.getAttackableHexes(gameState, currentPlayer);
          const attackableSet = new Set(attackable.map(h => h.getKey()));
          
          const attacks = piece.legalAttacks(attackableSet, board.highGroundHexSet);

          // Ranged and LongRanged pieces can only attack undefended targets
          if (piece.AttackType === AttackType.Ranged || piece.AttackType === AttackType.LongRanged) {
              return attacks.filter(hex => !RuleEngine.isHexDefended(hex, currentPlayer, gameState, board));
          }
          
          return attacks;
      }
      return [];
  }

  /**
   * Returns all hexes that the current player could attack with any of their pieces.
   * Used for turn skip logic (skip attack phase if no legal attacks exist).
   */
  public static getFutureLegalAttacks(gameState: GameState, board: Board): Hex[] {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    const attackable = RuleEngine.getAttackableHexes(gameState, currentPlayer);
    const attackableSet = new Set(attackable.map(h => h.getKey()));
    
    // Calculate defended hexes ONCE
    const defended = RuleEngine.getDefendedHexes(gameState, currentPlayer, board);
    const defendedSet = new Set(defended.map(h => h.getKey()));
    
    return gameState.pieces
      .filter((piece) => piece.color === currentPlayer && piece.canAttack)
      .flatMap((piece) => {
        const attacks = piece.legalAttacks(attackableSet, board.highGroundHexSet);
        
        // Ranged pieces can't attack defended hexes
        if (piece.AttackType === AttackType.Ranged || piece.AttackType === AttackType.LongRanged) {
          return attacks.filter(hex => !defendedSet.has(hex.getKey()));
        }
        return attacks;
      });
  }

  /**
   * Performance Optimization: Phase 3
   * Checks if the current player has ANY legal attacks available.
   * Uses "Fail Fast" strategy to avoid calculating all possible attacks.
   */
  public static hasAnyFutureLegalAttacks(gameState: GameState, board: Board): boolean {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    
    // 1. Identify potential attackers (cheap filter)
    const potentialAttackers = gameState.pieces.filter(
      (piece) => piece.color === currentPlayer && piece.canAttack
    );
    if (potentialAttackers.length === 0) return false;

    // 2. Cheap check: Are there any enemy units/castles at all?
    const hasEnemies = gameState.pieces.some(p => p.color !== currentPlayer) || 
                       gameState.castles.some(c => c.color !== currentPlayer && !RuleEngine.castleIsControlledByActivePlayer(c, currentPlayer));
    if (!hasEnemies) return false;

    // 3. Build Attackable Set (Needed for legalAttacks check)
    // Optimization: We could iterate potential targets, but pieces checks internal limits.
    const attackable = RuleEngine.getAttackableHexes(gameState, currentPlayer);
    const attackableSet = new Set(attackable.map(h => h.getKey()));
    
    // 4. Iterate attackers and return TRUE as soon as one legal attack is found
    for (const piece of potentialAttackers) {
      const allAttacks = piece.legalAttacks(attackableSet, board.highGroundHexSet);
      
      if (allAttacks.length === 0) continue;

      // Melee: If any attack exists, it's valid (Melee ignores defense for legality usually, or assumes trade)
      // Logic check: legalAttacks() returns geometrically valid attacks on enemies. 
      // Rule: Ranged cannot attack Defended. Melee can.
      if (piece.AttackType !== AttackType.Ranged && piece.AttackType !== AttackType.LongRanged) {
          return true;
      }

      // Ranged: Must check if target is defended.
      // Optimization: Check `isHexDefended` for specific targets instead of generating ALL defended hexes.
      for (const targetHex of allAttacks) {
          if (!RuleEngine.isHexDefended(targetHex, currentPlayer, gameState, board)) {
              return true; // Found one valid ranged attack!
          }
      }
    }

    return false;
  }

  /**
   * O(1) check if a specific hex is defended by enemy melee units.
   * Used for Ranged attack validation optimization.
   */
  public static isHexDefended(hex: Hex, attackerColor: Color, gameState: GameState, board: Board): boolean {
      if (!DEFENDED_PIECE_IS_PROTECTED_RANGED) return false;

      // Check all 6 neighbors for an Enemy Melee piece
      const neighbors = hex.cubeRing(1);
      for (const neighbor of neighbors) {
          // Use O(1) pieceMap lookup if available in GameState
          // We added pieceMap to GameState in Phase 2!
          const piece = gameState.pieceMap.getByKey(neighbor.getKey());
          if (piece && piece.color !== attackerColor && 
              (piece.AttackType === AttackType.Melee || piece.AttackType === AttackType.Swordsman)) {
              return true;
          }
      }
      return false;
  }

  public static castleIsControlledByActivePlayer(castle: Castle, currentPlayer: Color): boolean {
    return castle.owner === currentPlayer;
  }

  public static getControlledCastlesActivePlayer(gameState: GameState): Castle[] {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    const phase = TurnManager.getTurnPhase(gameState.turnCounter);
    return gameState.castles.filter((castle) => {
      if (phase !== "Recruitment") return false;
      return (
        RuleEngine.castleIsControlledByActivePlayer(castle, currentPlayer) &&
        castle.color !== currentPlayer
      );
    });
  }

  /**
   * Optimized check if ANY castle is controlled by active player (for turn skipping).
   */
  public static hasAnyFutureControlledCastles(gameState: GameState): boolean {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    // Use some() for early exit
    return gameState.castles.some((castle) => 
        RuleEngine.castleIsControlledByActivePlayer(castle, currentPlayer) &&
        castle.color !== currentPlayer
    );
  }

  public static getFutureControlledCastlesActivePlayer(gameState: GameState): Castle[] {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    return gameState.castles.filter((castle) => {

      return (
        RuleEngine.castleIsControlledByActivePlayer(castle, currentPlayer) &&
        castle.color !== currentPlayer
      );
    });
  }

  /**
   * Returns all hexes where a new piece can be recruited.
   * Logic: Adjacent to a controlled, unused castle, and not occupied.
   */
  public static getRecruitmentHexes(gameState: GameState, board: Board): Hex[] {
     const occupiedSet = new Set(RuleEngine.getOccupiedHexes(gameState).map(h => h.getKey()));
     const controlledCastles = RuleEngine.getControlledCastlesActivePlayer(gameState);
     
     const recruitmentHexes: Hex[] = [];
     const processedHexKeys = new Set<string>();

     for (const castle of controlledCastles) {
        if (castle.used_this_turn) continue;

        const adjacentHexes = castle.hex.cubeRing(1);
        for (const hex of adjacentHexes) {
           const key = hex.getKey();
           // Must be a valid board hex, not occupied, and not already added
           if (board.hexSet.has(key) && !occupiedSet.has(key) && !processedHexKeys.has(key)) {
              recruitmentHexes.push(hex);
              processedHexKeys.add(key);
           }
        }
     }
     return recruitmentHexes;
  }

  // ================= TURN MANAGEMENT HELPER =================

  /**
   * Delegates the complex turn increment logic to TurnManager,
   * passing in the necessary calculated booleans.
   */
  public static getTurnCounterIncrement(gameState: GameState, board: Board, isPassing: boolean = false): number {
    // Optimization Phase 3: Use early-exit checks instead of full list generation
    const hasFutureAttacks = RuleEngine.hasAnyFutureLegalAttacks(gameState, board);
    const hasFutureControlledCastles = RuleEngine.hasAnyFutureControlledCastles(gameState);

    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    
    // Check if castles are usable in the current Castles phase
    // If we are passing, we explicitly give up remaining castle usages
    let hasUsableCastles = false;
    if (!isPassing) {
        // Only count castles that are DIFFERENT color (Start-castles cannot recruit)
        const unusedControlledCastles = gameState.castles.filter(
            (castle) =>
            RuleEngine.castleIsControlledByActivePlayer(castle, currentPlayer) &&
            !castle.used_this_turn &&
            castle.color !== currentPlayer
        );
        hasUsableCastles = unusedControlledCastles.length > 0;
    }

    // Pass ignorePhase=true because we want to know if it WOULD be valid in the Recruitment phase
    const hasUsableSanctuaries = gameState.sanctuaries.some(s => SanctuaryService.canPledge(gameState, s.hex, true));

    return TurnManager.getTurnCounterIncrement(
        gameState.turnCounter,
        hasFutureAttacks,
        hasFutureControlledCastles || hasUsableSanctuaries,
        hasUsableCastles || hasUsableSanctuaries
    );
  }
}
