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
import { GameEngine, GameState } from "../Classes/Core/GameEngine";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Hex } from "../Classes/Entities/Hex";
import { MoveTree } from "../Classes/Core/MoveTree";
import { NotationService } from "../Classes/Systems/NotationService";
import { createHistorySnapshot } from "../utils/GameStateUtils";
import { TurnPhase, Color, HistoryEntry, MoveRecord, AbilityType } from "../Constants";
import { PieceMap } from "../utils/PieceMap";

// Command Pattern imports
import {
  CommandContext,
  MoveCommand,
  AttackCommand,
  CastleAttackCommand,
  PassCommand,
  RecruitCommand,
} from "../Classes/Commands";

export interface MoveExecutionState {
  pieces: Piece[];
  castles: Castle[];
  turnCounter: number;
  movingPiece: Piece | null;
  moveTree: MoveTree;
  viewNodeId: string | null;
  history: HistoryEntry[];
  moveHistory: MoveRecord[];
  sanctuaries: import("../Classes/Entities/Sanctuary").Sanctuary[];
  pieceMap: PieceMap;
  graveyard: Piece[];
  phoenixRecords: import("../Classes/Core/GameEngine").PhoenixRecord[];
}

export interface MoveExecutionProps {
  gameEngine: GameEngine;
  state: MoveExecutionState;
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
   * Prepares state with history snapshot and tree for mutation.
   */
  const prepareStateForAction = useCallback((): GameState => {
    const effectiveState = getEffectiveState();
    const snapshot = createHistorySnapshot(effectiveState);
    const treeForMutation = prepareTreeForMutation();
    return {
      ...effectiveState,
      history: [...effectiveState.history, snapshot],
      moveTree: treeForMutation,
    };
  }, [getEffectiveState, prepareTreeForMutation]);

  /**
   * Handles passing the turn using PassCommand.
   */
  const handlePass = useCallback(() => {
    // Block moves in Play Mode (Read-Only) when viewing history
    if (!isAnalysisMode && isViewingHistory) {
      return;
    }

    const stateWithHistory = prepareStateForAction();
    const command = new PassCommand(commandContext);
    const result = command.execute(stateWithHistory);

    if (result.success) {
      setState((prev: MoveExecutionState) => ({
        ...prev,
        ...result.newState,
        viewNodeId: null,
        history: result.newState.history,
      }));
    }
  }, [commandContext, isAnalysisMode, isViewingHistory, prepareStateForAction, setState]);

  /**
   * Handles clicking on a hex for movement, attack, or recruitment.
   * Uses MoveCommand, AttackCommand, CastleAttackCommand, or RecruitCommand.
   */
  const handleHexClick = useCallback(
    (hex: Hex) => {
      // Block moves in Play Mode (Read-Only) when viewing history
      if (!isAnalysisMode && isViewingHistory) {
        setState((prev: MoveExecutionState) => ({ ...prev, movingPiece: null }));
        return;
      }

      // Handle Movement
      if (turnPhase === "Movement" && movingPiece?.canMove) {
        if (isLegalMove(hex)) {
          const stateWithHistory = prepareStateForAction();
          const command = new MoveCommand(movingPiece, hex, commandContext);
          const result = command.execute(stateWithHistory);

          if (result.success) {
            setState((prev: MoveExecutionState) => ({
              ...prev,
              ...result.newState,
              viewNodeId: null,
              history: result.newState.history,
            }));
          }
          return;
        }
        setState((prev: MoveExecutionState) => ({ ...prev, movingPiece: null }));
        return;
      }

      // Handle Attack
      if (turnPhase === "Attack" && movingPiece?.canAttack) {
        if (isLegalAttack(hex)) {
          const stateWithHistory = prepareStateForAction();
          const effectiveState = getEffectiveState();
          const targetPiece = effectiveState.pieces.find((p) => p.hex.equals(hex));

          // Use AttackCommand for pieces, CastleAttackCommand for castles
          const command = targetPiece
            ? new AttackCommand(movingPiece, hex, commandContext)
            : new CastleAttackCommand(movingPiece, hex, commandContext);

          const result = command.execute(stateWithHistory);

          if (result.success) {
            setState((prev: MoveExecutionState) => ({
              ...prev,
              ...result.newState,
              viewNodeId: null,
              history: result.newState.history,
            }));
          }
          return;
        }
        setState((prev: MoveExecutionState) => ({ ...prev, movingPiece: null }));
        return;
      }

      // Handle Recruitment
      if (isRecruitmentSpot(hex)) {
        const castle = castles.find((c) => c.isAdjacent(hex));
        if (castle) {
          const stateWithHistory = prepareStateForAction();
          const command = new RecruitCommand(castle, hex, commandContext);
          const result = command.execute(stateWithHistory);

          if (result.success) {
            setState((prev: MoveExecutionState) => ({
              ...prev,
              ...result.newState,
              viewNodeId: null,
              history: result.newState.history,
            }));
          }
          return;
        }
      }

      setState((prev: MoveExecutionState) => ({ ...prev, movingPiece: null }));
    },
    [
      commandContext,
      turnPhase,
      movingPiece,
      castles,
      isLegalMove,
      isLegalAttack,
      isRecruitmentSpot,
      isAnalysisMode,
      isViewingHistory,
      getEffectiveState,
      prepareStateForAction,
      setState,
    ]
  );

  /**
   * Handles pledging at a sanctuary.
   * (Not yet converted to Command - sanctuary logic is more complex)
   */
  const pledge = useCallback(
    (sanctuaryHex: Hex, spawnHex: Hex) => {
      // Block pledge in Play Mode (Read-Only) when viewing history
      if (!isAnalysisMode && isViewingHistory) {
        return;
      }

      const effectiveState = getEffectiveState();
      const snapshot = createHistorySnapshot(effectiveState);
      const treeForMutation = prepareTreeForMutation();

      setState((prevState: MoveExecutionState) => {
        try {
          const stateWithHistory = {
            ...effectiveState,
            history: [...effectiveState.history, snapshot],
            moveTree: treeForMutation,
          };

          const sanctuary = stateWithHistory.sanctuaries?.find((s) => s.hex.equals(sanctuaryHex));
          if (!sanctuary) throw new Error("Sanctuary not found");

          const newCoreState = gameEngine.pledge(stateWithHistory, sanctuaryHex, spawnHex);

          const notation = NotationService.getPledgeNotation(sanctuary.pieceType, spawnHex);
          const pledgeCurrentPlayer = gameEngine.getCurrentPlayer(stateWithHistory.turnCounter);
          const pledgeTurnPhase = gameEngine.getTurnPhase(stateWithHistory.turnCounter);
          const turnNumber = Math.floor(stateWithHistory.turnCounter / 10) + 1;

          const moveRecord = {
            notation,
            turnNumber,
            color: pledgeCurrentPlayer,
            phase: pledgeTurnPhase,
          };

          let finalTree = treeForMutation;
          if (finalTree) {
            if (!isAnalysisMode) {
              finalTree = finalTree.clone();
            }
            finalTree.addMove(moveRecord);
          }

          return {
            ...prevState,
            ...newCoreState,
            moveHistory: [...stateWithHistory.moveHistory, moveRecord],
            history: stateWithHistory.history,
            viewNodeId: null,
            moveTree: finalTree,
          };
        } catch (e) {
          console.error(e);
          return prevState;
        }
      });
    },
    [gameEngine, isAnalysisMode, isViewingHistory, getEffectiveState, prepareTreeForMutation, setState]
  );

  /**
   * Handles triggering a special ability (Fireball, Teleport, RaiseDead).
   * (Not yet converted to Command - ability logic is more complex)
   */
  const triggerAbility = useCallback(
    (sourceHex: Hex, targetHex: Hex, ability: AbilityType) => {
      // Block abilities in Play Mode (Read-Only) when viewing history
      if (!isAnalysisMode && isViewingHistory) {
        return;
      }

      const effectiveState = getEffectiveState();
      const snapshot = createHistorySnapshot(effectiveState);
      const treeForMutation = prepareTreeForMutation();

      setState((prevState: MoveExecutionState) => {
        try {
          const stateWithHistory = {
            ...effectiveState,
            history: [...effectiveState.history, snapshot],
            moveTree: treeForMutation,
          };
          const newState = gameEngine.activateAbility(stateWithHistory, sourceHex, targetHex, ability);
          return { ...prevState, ...newState, viewNodeId: null, history: newState.history };
        } catch (e) {
          console.error(e);
          return prevState;
        }
      });
    },
    [gameEngine, isAnalysisMode, isViewingHistory, getEffectiveState, prepareTreeForMutation, setState]
  );

  return {
    handlePass,
    handleHexClick,
    pledge,
    triggerAbility,
  };
};
