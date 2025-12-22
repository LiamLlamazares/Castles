/**
 * @file useMoveExecution.ts
 * @description Handles all move execution logic (Move, Attack, Recruit, Pass, Pledge, Abilities).
 *
 * Extracted from useGameLogic to reduce complexity and improve separation of concerns.
 * This hook manages the actual execution of game actions, including:
 * - Move validation dispatch
 * - State mutation via GameEngine
 * - History/Tree synchronization for branching
 *
 * @see useGameLogic - Composes this hook
 * @see GameEngine - Core game logic facade
 */
import { useCallback } from "react";
import { GameEngine, GameState } from "../Classes/Core/GameEngine";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Hex } from "../Classes/Entities/Hex";
import { MoveTree } from "../Classes/Core/MoveTree";
import { NotationService } from "../Classes/Systems/NotationService";
import { createHistorySnapshot } from "../utils/GameStateUtils";
import { TurnPhase, Color, HistoryEntry, MoveRecord } from "../Constants";
import { PieceMap } from "../utils/PieceMap";

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
   * Handles passing the turn.
   */
  const handlePass = useCallback(() => {
    // Block moves in Play Mode (Read-Only) when viewing history
    if (!isAnalysisMode && isViewingHistory) {
      return;
    }

    const effectiveState = getEffectiveState();
    const snapshot = createHistorySnapshot(effectiveState);
    const treeForMutation = prepareTreeForMutation();

    setState((prev: MoveExecutionState) => {
      const stateWithHistory = {
        ...effectiveState,
        history: [...effectiveState.history, snapshot],
        moveTree: treeForMutation,
      };
      const newState = gameEngine.passTurn(stateWithHistory);
      return { ...prev, ...newState, viewNodeId: null, history: newState.history };
    });
  }, [gameEngine, isAnalysisMode, isViewingHistory, getEffectiveState, prepareTreeForMutation, setState]);

  /**
   * Handles clicking on a hex for movement, attack, or recruitment.
   */
  const handleHexClick = useCallback(
    (hex: Hex) => {
      // Block moves in Play Mode (Read-Only) when viewing history
      if (!isAnalysisMode && isViewingHistory) {
        setState((prev: MoveExecutionState) => ({ ...prev, movingPiece: null }));
        return;
      }

      const effectiveState = getEffectiveState();

      // Handle Movement
      if (turnPhase === "Movement" && movingPiece?.canMove) {
        if (isLegalMove(hex)) {
          const snapshot = createHistorySnapshot(effectiveState);
          const treeForMutation = prepareTreeForMutation();

          const stateWithHistory = {
            ...effectiveState,
            history: [...effectiveState.history, snapshot],
            moveTree: treeForMutation,
          };

          setState((prev: MoveExecutionState) => {
            const newState = gameEngine.applyMove(stateWithHistory, movingPiece!, hex);
            return {
              ...prev,
              ...newState,
              viewNodeId: null,
              history: newState.history,
            };
          });
          return;
        }
        setState((prev: MoveExecutionState) => ({ ...prev, movingPiece: null }));
        return;
      }

      // Handle Attack
      if (turnPhase === "Attack" && movingPiece?.canAttack) {
        if (isLegalAttack(hex)) {
          const snapshot = createHistorySnapshot(effectiveState);
          const treeForMutation = prepareTreeForMutation();

          const stateWithHistory = {
            ...effectiveState,
            history: [...effectiveState.history, snapshot],
            moveTree: treeForMutation,
          };

          const targetPiece = effectiveState.pieces.find((p) => p.hex.equals(hex));

          setState((prev: MoveExecutionState) => {
            if (targetPiece) {
              const newState = gameEngine.applyAttack(stateWithHistory, movingPiece!, hex);
              return { ...prev, ...newState, viewNodeId: null, history: newState.history };
            } else {
              const newState = gameEngine.applyCastleAttack(stateWithHistory, movingPiece!, hex);
              return { ...prev, ...newState, viewNodeId: null, history: newState.history };
            }
          });
          return;
        }
        setState((prev: MoveExecutionState) => ({ ...prev, movingPiece: null }));
        return;
      }

      // Handle Recruitment
      if (isRecruitmentSpot(hex)) {
        const castle = castles.find((c) => c.isAdjacent(hex));
        if (castle) {
          const snapshot = createHistorySnapshot(effectiveState);
          const treeForMutation = prepareTreeForMutation();

          const stateWithHistory = {
            ...effectiveState,
            history: [...effectiveState.history, snapshot],
            moveTree: treeForMutation,
          };

          setState((prev: MoveExecutionState) => {
            const newState = gameEngine.recruitPiece(stateWithHistory, castle, hex);
            return { ...prev, ...newState, viewNodeId: null, history: newState.history };
          });
          return;
        }
      }

      setState((prev: MoveExecutionState) => ({ ...prev, movingPiece: null }));
    },
    [
      gameEngine,
      turnPhase,
      movingPiece,
      castles,
      isLegalMove,
      isLegalAttack,
      isRecruitmentSpot,
      isAnalysisMode,
      isViewingHistory,
      getEffectiveState,
      prepareTreeForMutation,
      setState,
    ]
  );

  /**
   * Handles pledging at a sanctuary.
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
   */
  const triggerAbility = useCallback(
    (sourceHex: Hex, targetHex: Hex, ability: "Fireball" | "Teleport" | "RaiseDead") => {
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
