/**
 * @file useMoveExecution.ts
 * @description Handles all move execution logic (Move, Attack, Recruit, Pass, Pledge, Abilities).
 *
 * Extracted from useGameLogic to reduce complexity and improve separation of concerns.
 * This hook manages the actual execution of game actions using the Command Pattern:
 * - Commands encapsulate actions (Move, Attack, Pass, Recruit)
 * - History/Tree synchronization for branching
 *
 * @see useGameLogic - Composes this hook
 * @see GameCommand - Base command interface
 */
import { useCallback, useMemo } from "react";
import { GameEngine } from "../Classes/Core/GameEngine";
import { GameState, PhoenixRecord } from "../Classes/Core/GameState";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Hex } from "../Classes/Entities/Hex";
import { MoveTree } from "../Classes/Core/MoveTree";
import { NotationService } from "../Classes/Systems/NotationService";
import { createHistorySnapshot } from "../utils/GameStateUtils";
import { TurnPhase, Color, HistoryEntry, MoveRecord, AbilityType } from "../Constants";
import { PieceMap } from "../utils/PieceMap";
import { useInputController } from "./useInputController";

// Command Pattern imports
import {
  CommandContext,
  MoveCommand,
  AttackCommand,
  CastleAttackCommand,
  PassCommand,
  RecruitCommand,
  PledgeCommand,
  AbilityCommand,
} from "../Classes/Commands";

// MoveExecutionState removed in favor of strict GameState usage

export interface MoveExecutionProps {
  gameEngine: GameEngine;
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<any>>;
  isAnalysisMode: boolean;
  isViewingHistory: boolean;
  turnPhase: TurnPhase;
  currentPlayer: Color;
  isLegalMove: (hex: Hex) => boolean;
  isLegalAttack: (hex: Hex) => boolean;
  isRecruitmentSpot: (hex: Hex) => boolean;
  getEffectiveState: () => GameState;
  initialPieces: Piece[];
  initialBoard: import("../Classes/Core/Board").Board;
  startingSanctuaries: import("../Classes/Entities/Sanctuary").Sanctuary[];
  initialTurnCounter: number;
}

/**
 * Hook for executing game moves, attacks, and other actions.
 * Uses Command Pattern for action encapsulation.
 * Handles branching logic when making moves from analysis mode.
 */
export const useMoveExecution = ({
  gameEngine,
  state,
  setState,
  isAnalysisMode,
  isViewingHistory,
  turnPhase,
  currentPlayer,
  isLegalMove,
  isLegalAttack,
  isRecruitmentSpot,
  getEffectiveState,
}: MoveExecutionProps) => {
  const { movingPiece, castles } = state;

  // Command context for creating commands
  const commandContext = useMemo<CommandContext>(
    () => ({ gameEngine, board: gameEngine.board }),
    [gameEngine]
  );

  /**
   * Syncs the MoveTree cursor to the currently viewed node before mutation.
   * Returns a cloned tree with the cursor at the correct position.
   */
  const prepareTreeForMutation = useCallback((): MoveTree => {
    let treeForMutation = state.moveTree;
    if (isViewingHistory && treeForMutation && state.viewNodeId) {
      treeForMutation = treeForMutation.clone();
      const viewNode = treeForMutation.findNodeById(state.viewNodeId);
      if (viewNode) {
        treeForMutation.setCurrentNode(viewNode);
      }
    }
    return treeForMutation;
  }, [state.moveTree, state.viewNodeId, isViewingHistory]);

  /**
   * Unified Helper: Executes a command and updates state on success.
   */
  const executeCommand = useCallback(
    (command: import("../Classes/Commands").GameCommand): boolean => {
      // 1. Guard for Read-Only History Mode
      if (!isAnalysisMode && isViewingHistory) {
        return false;
      }

      const effectiveState = getEffectiveState();
      // Ensure the tree is ready for mutation if we are viewing history
      const treeForMutation = prepareTreeForMutation();
      
      const stateToExecute: GameState = {
          ...effectiveState,
          moveTree: treeForMutation
      };

      const result = command.execute(stateToExecute);

      if (result.success) {
        setState((prev: GameState) => ({
          ...prev,
          ...result.newState,
          viewNodeId: null
        }));
        return true;
      } else {
        if (result.error) console.error("Command failed:", result.error);
        return false;
      }
    },
    [isAnalysisMode, isViewingHistory, getEffectiveState, prepareTreeForMutation, setState]
  );

  /**
   * Handles passing the turn using PassCommand.
   */
  const handlePass = useCallback(() => {
    if (!isAnalysisMode && isViewingHistory) return;
    executeCommand(new PassCommand(commandContext));
  }, [isAnalysisMode, isViewingHistory, executeCommand, commandContext]);

  // Initialize Input Controller
  const { resolveCommand } = useInputController({
      gameEngine,
      turnPhase,
      movingPiece,
      castles,
      isLegalMove,
      isLegalAttack,
      isRecruitmentSpot,
      getPieces: () => state.pieces // Getter to access current pieces
  });

  /**
   * Handles clicking on a hex for movement, attack, or recruitment.
   */
  const handleHexClick = useCallback(
    (hex: Hex) => {
      // 1. Guard: Read-Only History Viewing
      if (!isAnalysisMode && isViewingHistory) {
        setState((prev: GameState) => ({ ...prev, movingPiece: null }));
        return;
      }

      // 2. Resolve Command via Controller
      const command = resolveCommand(hex);

      // 3. Execute or Cleanup
      let actionTaken = false;
      if (command) {
          actionTaken = executeCommand(command);
      }

      // 4. Cleanup: If no action was performed, deselect the piece
      if (!actionTaken) {
        setState((prev: GameState) => ({ ...prev, movingPiece: null }));
      }
    },
    [
      isAnalysisMode, 
      isViewingHistory, 
      resolveCommand, 
      executeCommand, 
      setState
    ]
  );

  /**
   * Handles pledging at a sanctuary using PledgeCommand.
   */
  const pledge = useCallback(
    (sanctuaryHex: Hex, spawnHex: Hex) => {
      const effectiveState = getEffectiveState();
      const sanctuary = effectiveState.sanctuaries?.find((s) => s.hex.equals(sanctuaryHex));
      
      if (!sanctuary) {
        console.error("Sanctuary not found");
        return;
      }

      executeCommand(new PledgeCommand(sanctuary, spawnHex, commandContext));
    },
    [executeCommand, getEffectiveState, commandContext]
  );

  /**
   * Handles triggering a special ability using AbilityCommand.
   */
  const triggerAbility = useCallback(
    (sourceHex: Hex, targetHex: Hex, ability: AbilityType) => {
      const effectiveState = getEffectiveState();
      const caster = effectiveState.pieceMap.getByKey(sourceHex.getKey());
      
      if (!caster) {
        console.error("Caster not found");
        return;
      }

      executeCommand(new AbilityCommand(caster, targetHex, ability, commandContext));
    },
    [executeCommand, getEffectiveState, commandContext]
  );

  return {
    handlePass,
    handleHexClick,
    pledge,
    triggerAbility,
  };
};
