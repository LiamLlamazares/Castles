import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { Board } from "../Core/Board";
import { TurnManager } from "../Core/TurnManager";
import {
  Color,
  AttackType,
  DEFENDED_PIECE_IS_PROTECTED_RANGED,
} from "../../Constants";

export class RuleEngine {
  // ================= BOARD QUERIES =================

  /** Returns all hexes currently occupied by pieces */
  public static getOccupiedHexes(pieces: Piece[]): Hex[] {
    return pieces.map((piece) => piece.hex);
  }

  /**
   * Returns all hexes that block ground movement.
   * Includes: rivers, castles, and occupied hexes.
   */
  public static getBlockedHexes(pieces: Piece[], castles: Castle[], board: Board): Hex[] {
    const occupied = RuleEngine.getOccupiedHexes(pieces);
    return [
        ...board.riverHexes, 
        ...board.castleHexes, 
        ...occupied
    ];
  }

  /** Returns a Set of hex keys for O(1) blocked hex lookups */
  public static getBlockedHexSet(pieces: Piece[], castles: Castle[], board: Board): Set<string> {
    const blockedHexes = RuleEngine.getBlockedHexes(pieces, castles, board);
    return new Set(blockedHexes.map(hex => hex.getKey()));
  }
  
  public static getEnemyHexes(pieces: Piece[], currentPlayer: Color): Hex[] {
    return pieces
      .filter((piece) => piece.color !== currentPlayer)
      .map((piece) => piece.hex);
  }

  public static getEnemyCastleHexes(castles: Castle[], pieces: Piece[], currentPlayer: Color): Hex[] {
    return castles.filter(
      (castle) => {
          // Castle is enemy if color is different AND not controlled by us via occupation
          const isControlledByUs = RuleEngine.castleIsControlledByActivePlayer(castle, pieces, currentPlayer);
          return castle.color !== currentPlayer && !isControlledByUs;
      }
    ).map((castle) => castle.hex);
  }

  public static getAttackableHexes(pieces: Piece[], castles: Castle[], currentPlayer: Color): Hex[] {
    return [...RuleEngine.getEnemyHexes(pieces, currentPlayer), ...RuleEngine.getEnemyCastleHexes(castles, pieces, currentPlayer)];
  }

  /**
   * Returns hexes that are protected from ranged attacks.
   * These are hexes adjacent to enemy melee pieces.
   */
  public static getDefendedHexes(pieces: Piece[], currentPlayer: Color, board: Board): Hex[] {
    if (!DEFENDED_PIECE_IS_PROTECTED_RANGED) return [];
    
    const enemyMeleePieces = pieces.filter(
      (piece) =>
        piece.color !== currentPlayer &&
        piece.AttackType === AttackType.Melee
    );
    
    // Enemy melee pieces "defend" all hexes they can attack
    return enemyMeleePieces
      .flatMap((piece) => piece.legalAttacks(board.hexSet, board.highGroundHexSet));
  }

  // ================= LEGAL ACTIONS =================

  // This method calculates legal moves for a specific piece
  public static getLegalMoves(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number, board: Board): Hex[] {
    const phase = TurnManager.getTurnPhase(turnCounter);
    if (piece && phase === "Movement" && piece.canMove) {
        const blockedSet = RuleEngine.getBlockedHexSet(pieces, castles, board);
        return piece.getLegalMoves(blockedSet, piece.color, board.hexSet);
    }
    return [];
  }

  public static getLegalAttacks(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number, board: Board): Hex[] {
      const phase = TurnManager.getTurnPhase(turnCounter);
      const currentPlayer = TurnManager.getCurrentPlayer(turnCounter);

      if (piece && phase === "Attack" && piece.canAttack) {
          const attackable = RuleEngine.getAttackableHexes(pieces, castles, currentPlayer);
          const attackableSet = new Set(attackable.map(h => h.getKey()));
          
          if (piece.AttackType === AttackType.Ranged) {
              const defended = RuleEngine.getDefendedHexes(pieces, currentPlayer, board);
              return piece
                .legalAttacks(attackableSet, board.highGroundHexSet)
                .filter(
                  (hex) =>
                    !defended.some((defendedHex) => defendedHex.equals(hex))
                );
          }
          return piece.legalAttacks(attackableSet, board.highGroundHexSet);
      }
      return [];
  }

  /**
   * Returns all hexes that the current player could attack with any of their pieces.
   * Used for turn skip logic (skip attack phase if no legal attacks exist).
   */
  public static getFutureLegalAttacks(pieces: Piece[], castles: Castle[], turnCounter: number, board: Board): Hex[] {
    const currentPlayer = TurnManager.getCurrentPlayer(turnCounter);
    const attackable = RuleEngine.getAttackableHexes(pieces, castles, currentPlayer);
    const attackableSet = new Set(attackable.map(h => h.getKey()));
    
    // Calculate defended hexes ONCE
    const defended = RuleEngine.getDefendedHexes(pieces, currentPlayer, board);
    const defendedSet = new Set(defended.map(h => h.getKey()));
    
    return pieces
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
   * Checks if the current player has ANY legal attacks available.
   * Optimized for early exit (O(1) best case, instead of O(N)).
   */
  public static hasAnyFutureLegalAttacks(pieces: Piece[], castles: Castle[], turnCounter: number, board: Board): boolean {
    const currentPlayer = TurnManager.getCurrentPlayer(turnCounter);
    
    // 1. Identify potential attackers first (cheap filter)
    const potentialAttackers = pieces.filter(
      (piece) => piece.color === currentPlayer && piece.canAttack
    );
    if (potentialAttackers.length === 0) return false;

    // 2. Build expensive sets only if needed
    const attackable = RuleEngine.getAttackableHexes(pieces, castles, currentPlayer);
    if (attackable.length === 0) return false;
    
    const attackableSet = new Set(attackable.map(h => h.getKey()));
    
    // Calculate defended hexes ONCE (FIX to ensure O(N) not O(N^2) for many ranged)
    const defended = RuleEngine.getDefendedHexes(pieces, currentPlayer, board);
    const defendedSet = new Set(defended.map(h => h.getKey()));

    // 3. Check each attacker, returning true immediately if one has choices
    for (const piece of potentialAttackers) {
      const attacks = piece.legalAttacks(attackableSet, board.highGroundHexSet);
      
      if (piece.AttackType === AttackType.Ranged || piece.AttackType === AttackType.LongRanged) {
         // Must find at least one non-defended attack
         if (attacks.some(hex => !defendedSet.has(hex.getKey()))) return true;
      } else {
         if (attacks.length > 0) return true;
      }
    }

    return false;
  }

  public static castleIsControlledByActivePlayer(castle: Castle, _pieces: Piece[], currentPlayer: Color): boolean {
    return castle.owner === currentPlayer;
  }

  public static getControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    const currentPlayer = TurnManager.getCurrentPlayer(turnCounter);
    const phase = TurnManager.getTurnPhase(turnCounter);
    return castles.filter((castle) => {
      if (phase !== "Castles") return false;
      return (
        RuleEngine.castleIsControlledByActivePlayer(castle, pieces, currentPlayer) &&
        castle.color !== currentPlayer
      );
    });
  }

  /**
   * Optimized check if ANY castle is controlled by active player (for turn skipping).
   */
  public static hasAnyFutureControlledCastles(castles: Castle[], pieces: Piece[], turnCounter: number): boolean {
    const currentPlayer = TurnManager.getCurrentPlayer(turnCounter);
    // Use some() for early exit
    return castles.some((castle) => 
        RuleEngine.castleIsControlledByActivePlayer(castle, pieces, currentPlayer) &&
        castle.color !== currentPlayer
    );
  }

  public static getFutureControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    const currentPlayer = TurnManager.getCurrentPlayer(turnCounter);
    return castles.filter((castle) => {

      return (
        RuleEngine.castleIsControlledByActivePlayer(castle, pieces, currentPlayer) &&
        castle.color !== currentPlayer
      );
    });
  }

  /**
   * Returns all hexes where a new piece can be recruited.
   * Logic: Adjacent to a controlled, unused castle, and not occupied.
   */
  public static getRecruitmentHexes(pieces: Piece[], castles: Castle[], turnCounter: number, board: Board): Hex[] {
     const occupiedSet = new Set(RuleEngine.getOccupiedHexes(pieces).map(h => h.getKey()));
     const controlledCastles = RuleEngine.getControlledCastlesActivePlayer(castles, pieces, turnCounter);
     
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
  public static getTurnCounterIncrement(pieces: Piece[], castles: Castle[], turnCounter: number, board: Board, isPassing: boolean = false): number {
    // Optimization Phase 3: Use early-exit checks instead of full list generation
    const hasFutureAttacks = RuleEngine.hasAnyFutureLegalAttacks(pieces, castles, turnCounter, board);
    const hasFutureControlledCastles = RuleEngine.hasAnyFutureControlledCastles(castles, pieces, turnCounter);

    const currentPlayer = TurnManager.getCurrentPlayer(turnCounter);
    
    // Check if castles are usable in the current Castles phase
    // If we are passing, we explicitly give up remaining castle usages
    let hasUsableCastles = false;
    if (!isPassing) {
        // Only count castles that are DIFFERENT color (Start-castles cannot recruit)
        const unusedControlledCastles = castles.filter(
            (castle) =>
            RuleEngine.castleIsControlledByActivePlayer(castle, pieces, currentPlayer) &&
            !castle.used_this_turn &&
            castle.color !== currentPlayer
        );
        hasUsableCastles = unusedControlledCastles.length > 0;
    }

    return TurnManager.getTurnCounterIncrement(
        turnCounter,
        hasFutureAttacks,
        hasFutureControlledCastles,
        hasUsableCastles
    );
  }
}
