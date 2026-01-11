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
import { useState, useCallback, useEffect, useMemo } from "react";
import { Hex } from "../Classes/Entities/Hex";
import { Piece } from "../Classes/Entities/Piece";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { AbilityType } from "../Constants";
import { InteractionPolicy } from "../Classes/Systems/InteractionPolicy";
import { createPieceMap } from "../utils/PieceMap";

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
  onEngineHexClick: (hex: Hex) => void;
  /** Board instance for terrain checks */
  board: import("../Classes/Core/Board").Board;
  /** Full Game State access for Policy Context */
  gameState: import("../Classes/Core/GameState").GameState;
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
  canPledge, // Kept for API compatibility, but logic delegated to Policy if needed
  pledge,
  triggerAbility,
  onEngineHexClick,
  board,
  gameState
}: UseClickHandlerProps): UseClickHandlerResult {
  const [activeAbility, setActiveAbility] = useState<AbilityType | null>(null);
  const [pledgingSanctuary, setPledgingSanctuary] = useState<Hex | null>(null);

  // Policy Context
  const interactionCtx = useMemo(() => ({
    board,
    gameState
  }), [board, gameState]);

  // Reset active ability/pledge when moving piece changes
  useEffect(() => {
    setActiveAbility(null);
    setPledgingSanctuary(null);
  }, [movingPiece]);

  /**
   * Main click handler - processes in priority order
   */
  const handleBoardClick = useCallback(
    (hex: Hex) => {
      // 1. Ability Targeting Mode
      if (activeAbility && movingPiece) {
        if (InteractionPolicy.isValidAbilityTarget(movingPiece.hex, hex, activeAbility)) {
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
        if (InteractionPolicy.isValidPledgeSpawn(interactionCtx, pledgingSanctuary, hex)) {
          try {
            pledge(pledgingSanctuary, hex);
            setPledgingSanctuary(null);
            return;
          } catch (e) {
            console.warn("Pledge failed:", e instanceof Error ? e.message : e);
          }
        }
        
        setPledgingSanctuary(null); // Cancel if clicking elsewhere
        // Fall through to normal handling? Or separate flow?
        // Original logic fell through for "clicking elsewhere"
      }

      // 3. Sanctuary Selection (Enter Pledge Mode)
      // Only if NOT currently moving a piece
      if (!movingPiece) {
        const clickedSanctuary = sanctuaries?.find((s: Sanctuary) =>
          s.hex.equals(hex)
        );
        
        if (clickedSanctuary && InteractionPolicy.canEnterPledgeMode(interactionCtx, hex)) {
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
      sanctuaries,
      pledge,
      triggerAbility,
      onEngineHexClick,
      interactionCtx 
    ]
  );

  /**
   * Check if a hex is a valid pledge target (adjacent to pledging sanctuary)
   */
  const isPledgeTarget = useCallback(
    (hex: Hex) => {
      if (!pledgingSanctuary) return false;
      return InteractionPolicy.isPledgeTarget(interactionCtx, pledgingSanctuary, hex);
    },
    [pledgingSanctuary, interactionCtx]
  );

  return {
    handleBoardClick,
    isPledgeTarget,
    activeAbility,
    setActiveAbility,
    pledgingSanctuary,
  };
}

