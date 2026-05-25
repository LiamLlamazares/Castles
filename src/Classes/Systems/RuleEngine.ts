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
  PieceType,
  DEFENDED_PIECE_IS_PROTECTED_RANGED,
} from "../../Constants";
import { getNeighborPieces } from "../../utils/PieceMap";
import { CombatSystem } from "./CombatSystem";

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
      const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
      return RuleEngine.getLegalAttacksForPlayer(piece, gameState, board, currentPlayer, true);
  }

  /**
   * Optimized check if ANY piece can move.
   * Used for turn skipping logic in TurnManager (skip Movement phase if stuck).
   */
  public static hasAnyLegalMoves(gameState: GameState, board: Board): boolean {
      const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
      
      const potentialMovers = gameState.pieces.filter(
          p => p.color === currentPlayer && p.canMove
      );

      // Lazy check: return true as soon as one legal move is found
      const blockedSet = RuleEngine.getBlockedHexSet(gameState, board, currentPlayer);
      return potentialMovers.some(piece => {
           const moves = piece.getLegalMoves(blockedSet, currentPlayer, board.hexSet);
           return moves.length > 0;
      });
  }

  /**
   * Returns all hexes that the current player could attack with any of their pieces.
   * Used for turn skip logic (skip attack phase if no legal attacks exist).
   */
  public static getFutureLegalAttacks(gameState: GameState, board: Board): Hex[] {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    return gameState.pieces
      .filter((piece) => piece.color === currentPlayer && piece.canAttack)
      .flatMap((piece) =>
        RuleEngine.getLegalAttacksForPlayer(piece, gameState, board, currentPlayer, false)
      );
  }

  /**
   * Performance Optimization: Phase 3
   * Checks if the current player has ANY legal attacks available.
   * Uses "Fail Fast" strategy to avoid calculating all possible attacks.
   */
  public static hasAnyFutureLegalAttacks(gameState: GameState, board: Board): boolean {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    
    const potentialAttackers = gameState.pieces.filter(
      (piece) => piece.color === currentPlayer && piece.canAttack
    );
    if (potentialAttackers.length === 0) return false;

    const hasEnemies = gameState.pieces.some(p => p.color !== currentPlayer) || 
                       gameState.castles.some(c => c.color !== currentPlayer && !RuleEngine.castleIsControlledByActivePlayer(c, currentPlayer));
    if (!hasEnemies) return false;

    for (const piece of potentialAttackers) {
      if (RuleEngine.getLegalAttacksForPlayer(piece, gameState, board, currentPlayer, false).length > 0) {
        return true;
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

      // Check if any enemy melee piece is adjacent to the target hex
      const enemyMeleeNeighbors = getNeighborPieces(hex, gameState.pieceMap, p =>
          p.color !== attackerColor &&
          (p.AttackType === AttackType.Melee || p.AttackType === AttackType.Swordsman)
      );
      return enemyMeleeNeighbors.length > 0;
  }

  private static getLegalAttacksForPlayer(
    piece: Piece | null,
    gameState: GameState,
    board: Board,
    currentPlayer: Color,
    requireAttackPhase: boolean
  ): Hex[] {
      const phase = TurnManager.getTurnPhase(gameState.turnCounter);
      if (requireAttackPhase && phase !== "Attack") return [];
      if (!piece || !piece.canAttack || piece.color !== currentPlayer) return [];

      const attackable = RuleEngine.getAttackableHexes(gameState, currentPlayer);
      const attackableSet = new Set(attackable.map(h => h.getKey()));
      const attacks = piece.legalAttacks(attackableSet, board.highGroundHexSet);
      const geometricallyLegalAttacks = attacks.filter(hex =>
        RuleEngine.canPieceGeometricallyAttackHex(piece, hex, gameState, board, currentPlayer)
      );

      return geometricallyLegalAttacks.filter(hex =>
        RuleEngine.attackCanLeadToPieceCapture(piece, hex, gameState, board, currentPlayer)
      );
  }

  private static canPieceGeometricallyAttackHex(
    piece: Piece,
    targetHex: Hex,
    gameState: GameState,
    board: Board,
    currentPlayer: Color
  ): boolean {
      if (!piece.canAttack || piece.color !== currentPlayer) return false;

      const targetSet = new Set([targetHex.getKey()]);
      const attacks = piece.legalAttacks(targetSet, board.highGroundHexSet);
      if (!attacks.some(hex => hex.equals(targetHex))) return false;

      if (piece.AttackType === AttackType.Ranged || piece.AttackType === AttackType.LongRanged) {
          return !RuleEngine.isHexDefended(targetHex, currentPlayer, gameState, board);
      }

      return true;
  }

  private static attackCanLeadToPieceCapture(
    attacker: Piece,
    targetHex: Hex,
    gameState: GameState,
    board: Board,
    currentPlayer: Color
  ): boolean {
      const targetPiece = gameState.pieceMap.getByKey(targetHex.getKey());
      if (!targetPiece) return true;
      if (targetPiece.color === currentPlayer) return false;

      const liveAttacker = gameState.pieceMap.getByKey(attacker.hex.getKey());
      if (!liveAttacker || liveAttacker.color !== currentPlayer || !liveAttacker.canAttack) {
          return false;
      }

      if (targetPiece.type === PieceType.Monarch && liveAttacker.type === PieceType.Assassin) {
          return true;
      }

      const targetStrength = CombatSystem.getCombatStrength(targetPiece, gameState.pieceMap);
      const attackStrength = CombatSystem.getCombatStrength(liveAttacker, gameState.pieceMap);
      const remainingDamageNeeded = targetStrength - targetPiece.damage - attackStrength;
      if (remainingDamageNeeded <= 0) return true;

      let remainingAttackPower = 0;
      for (const piece of gameState.pieces) {
          if (piece.color !== currentPlayer || !piece.canAttack) continue;
          if (piece.hex.equals(liveAttacker.hex)) continue;
          if (!RuleEngine.canPieceGeometricallyAttackHex(piece, targetPiece.hex, gameState, board, currentPlayer)) continue;

          if (targetPiece.type === PieceType.Monarch && piece.type === PieceType.Assassin) {
              return true;
          }

          remainingAttackPower += CombatSystem.getCombatStrength(piece, gameState.pieceMap);
          if (remainingAttackPower >= remainingDamageNeeded) return true;
      }

      return false;
  }

  public static castleIsControlledByActivePlayer(castle: Castle, currentPlayer: Color): boolean {
    return castle.owner === currentPlayer;
  }

  public static castleGrantsRecruitmentToActivePlayer(castle: Castle, currentPlayer: Color): boolean {
    return (
      RuleEngine.castleIsControlledByActivePlayer(castle, currentPlayer) &&
      castle.color !== currentPlayer
    );
  }

  public static getControlledCastlesActivePlayer(gameState: GameState): Castle[] {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    const phase = TurnManager.getTurnPhase(gameState.turnCounter);
    return gameState.castles.filter((castle) => {
      if (phase !== "Recruitment") return false;
      return (
        RuleEngine.castleGrantsRecruitmentToActivePlayer(castle, currentPlayer)
      );
    });
  }

  /**
   * Optimized check if ANY castle can grant recruitment to the active player (for turn skipping).
   */
  public static hasAnyFutureControlledCastles(gameState: GameState): boolean {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    // Use some() for early exit
    return gameState.castles.some((castle) => 
        RuleEngine.castleGrantsRecruitmentToActivePlayer(castle, currentPlayer)
    );
  }

  public static getFutureControlledCastlesActivePlayer(gameState: GameState): Castle[] {
    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    return gameState.castles.filter((castle) => {

      return (
        RuleEngine.castleGrantsRecruitmentToActivePlayer(castle, currentPlayer)
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
    
    // Check legal moves (for skipping Movement phase)
    let hasFutureMoves = false;
    if (!isPassing && TurnManager.getTurnPhase(gameState.turnCounter) === "Movement") {
        hasFutureMoves = RuleEngine.hasAnyLegalMoves(gameState, board);
    }
    // If not in Movement phase, hasFutureMoves is irrelevant (pass false)

    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);
    
    // Check if castles are usable in the current Castles phase
    // If we are passing, we explicitly give up remaining castle usages
    // Check if castles/sanctuaries are usable.
    // IMPORTANT: If we are Passing, we only want to ignore these IF we are currently IN the Recruitment phase.
    // If we are passing Movement or Attack, we still want to report that Recruitment is possible so we don't skip it.
    const phase = TurnManager.getTurnPhase(gameState.turnCounter);
    const passingRecruitment = isPassing && phase === "Recruitment";

    let hasUsableCastles = false;
    if (!passingRecruitment) {
        const unusedControlledCastles = gameState.castles.filter(
            (castle) =>
            RuleEngine.castleGrantsRecruitmentToActivePlayer(castle, currentPlayer) &&
            !castle.used_this_turn
        );
        hasUsableCastles = unusedControlledCastles.length > 0;
    }

    // Pass ignorePhase=true because we want to know if it WOULD be valid in the Recruitment phase
    let hasUsableSanctuaries = false;
    if (!passingRecruitment) {
        hasUsableSanctuaries = gameState.sanctuaries.some(s => SanctuaryService.canPledge(gameState, board, s.hex, true));
    }

    return TurnManager.getTurnCounterIncrement(
        gameState.turnCounter,
        hasFutureMoves,
        hasFutureAttacks,
        hasFutureControlledCastles || hasUsableSanctuaries,
        hasUsableCastles || hasUsableSanctuaries
    );
  }
}
