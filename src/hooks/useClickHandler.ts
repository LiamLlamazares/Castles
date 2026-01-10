/**
 * @file useClickHandler.ts
 * @description Handles hex click interactions for the game board.
 *
 * Extracted from Game.tsx to improve separation of concerns.
 * Manages:
 * - Ability targeting (Fireball, Teleport, RaiseDead)
 * - Sanctuary pledging flow
 * - Delegation to game engine for normal moves
 *
 * @see Game.tsx - Uses this hook for click handling
 * @see useGameLogic - Provides underlying game state and actions
 */
import { useState, useCallback, useEffect } from "react";
import { Hex } from "../Classes/Entities/Hex";
import { Piece } from "../Classes/Entities/Piece";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { AbilityType } from "../Constants";
import { isValidAbilityTarget } from "../Classes/Config/AbilityConfig";

interface UseClickHandlerProps {
  /** Currently selected piece (from game engine) */
  movingPiece: Piece | null;
  /** All sanctuaries on the board */
  sanctuaries: Sanctuary[];
  /** All pieces on the board */
  pieces: Piece[];
  /** Check if a sanctuary can be pledged */
  canPledge: (sanctuaryHex: Hex) => boolean;
  /** Execute a pledge action */
  pledge: (sanctuaryHex: Hex, spawnHex: Hex) => void;
  /** Execute an ability (Wizard/Necromancer) */
  triggerAbility: (sourceHex: Hex, targetHex: Hex, ability: AbilityType) => void;
  /** Normal hex click handler from game engine */
  /** Normal hex click handler from game engine */
  onEngineHexClick: (hex: Hex) => void;
  /** Board instance for terrain checks */
  board: import("../Classes/Core/Board").Board;
}

interface UseClickHandlerResult {
  /** Handler for board hex clicks - processes abilities, pledging, then delegates */
  handleBoardClick: (hex: Hex) => void;
  /** Check if hex is a valid pledge target */
  isPledgeTarget: (hex: Hex) => boolean;
  /** Currently active ability mode */
  activeAbility: AbilityType | null;
  /** Set active ability mode */
  setActiveAbility: (ability: AbilityType | null) => void;
  /** Currently pledging sanctuary hex (null if not pledging) */
  pledgingSanctuary: Hex | null;
}

/**
 * Hook for handling hex click interactions.
 * Processes clicks in priority order:
 * 1. Ability targeting (if ability active)
 * 2. Pledge spawn location (if pledging)
 * 3. Sanctuary selection (enter pledge mode)
 * 4. Normal game engine handling
 */
export function useClickHandler({
  movingPiece,
  sanctuaries,
  pieces,
  canPledge,
  pledge,
  triggerAbility,
  onEngineHexClick,
  board,
}: UseClickHandlerProps): UseClickHandlerResult {
  const [activeAbility, setActiveAbility] = useState<AbilityType | null>(null);
  const [pledgingSanctuary, setPledgingSanctuary] = useState<Hex | null>(null);

  // Reset active ability when moving piece changes
  useEffect(() => {
    setActiveAbility(null);
  }, [movingPiece]);

  /**
   * Main click handler - processes in priority order
   */
  const handleBoardClick = useCallback(
    (hex: Hex) => {
      // 1. Ability Targeting Mode
      if (activeAbility && movingPiece) {
        const distance = movingPiece.hex.distance(hex);
        
        // Use centralized config for range validation (no magic numbers)
        const valid = isValidAbilityTarget(activeAbility, distance);

        if (valid) {
          triggerAbility(movingPiece.hex, hex, activeAbility);
          setActiveAbility(null);
        } else {
          // Invalid target - keep mode active to retry
          console.log("Invalid ability target");
        }
        return;
      }

      // 2. Pledging Spawn Location
      if (pledgingSanctuary) {
        // Cancel if clicking same sanctuary
        if (hex.equals(pledgingSanctuary)) {
          setPledgingSanctuary(null);
          return;
        }

        // Attempt pledge if valid spawn hex
        // Re-use logic from SanctuaryService/AIContextBuilder implicitly
        const isSpawnHexEmpty = !pieces.some((p) => p.hex.equals(hex));
        const isRiver = board.isRiver(hex);
        const isCastle = board.isCastle(hex, board.NSquares);
        
        if (
          canPledge(pledgingSanctuary) &&
          hex.distance(pledgingSanctuary) === 1 &&
          isSpawnHexEmpty &&
          !isRiver &&
          !isCastle
        ) {
          try {
            pledge(pledgingSanctuary, hex);
            setPledgingSanctuary(null);
            return;
          } catch (e) {
            console.warn("Pledge failed:", e);
          }
        }
        setPledgingSanctuary(null); // Cancel if clicking elsewhere
        // Fall through to normal handling
      }

      // 3. Sanctuary Selection (Enter Pledge Mode)
      // Only if NOT currently moving a piece
      if (!movingPiece) {
        const clickedSanctuary = sanctuaries?.find((s: Sanctuary) =>
          s.hex.equals(hex)
        );
        if (clickedSanctuary && canPledge(hex)) {
          setPledgingSanctuary(hex);
          return;
        }
      }

      // 4. Delegate to Engine
      onEngineHexClick(hex);
    },
    [
      activeAbility,
      movingPiece,
      pledgingSanctuary,
      pieces,
      sanctuaries,
      canPledge,
      pledge,
      triggerAbility,
      onEngineHexClick,
      board
    ]
  );

  /**
   * Check if a hex is a valid pledge target (adjacent to pledging sanctuary)
   */
  const isPledgeTarget = useCallback(
    (hex: Hex) => {
      if (!pledgingSanctuary) return false;
      
      const isNeighbor = hex.distance(pledgingSanctuary) === 1;
      if (!isNeighbor) return false;

      // Validate topology
      if (board.isRiver(hex)) return false;
      if (board.isCastle(hex, board.NSquares)) return false;
      
      // Validate occupancy
      // Note: We use the pieces array passed in props which should be current
      if (pieces.some(p => p.hex.equals(hex))) return false;

      return true;
    },
    [pledgingSanctuary, board, pieces]
  );

  return {
    handleBoardClick,
    isPledgeTarget,
    activeAbility,
    setActiveAbility,
    pledgingSanctuary,
  };
}
