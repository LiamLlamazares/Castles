import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderCustomGameLogicHook } from "../test-utils/TestGameProviderUtils";
import { useGameInteraction } from "../useGameInteraction";
import { useCoreGame } from "../useCoreGame";
import { startingBoard, allPieces } from "../../ConstantImports";
import { MoveTree } from "../../Classes/Core/MoveTree";
import { createPieceMap } from "../../utils/PieceMap";
import type { PositionSnapshot } from "../../Classes/Core/GameState";
import { PieceType } from "../../Constants";

function createSnapshot(turnCounter: number): PositionSnapshot {
  const pieces = allPieces.map(piece => piece.clone());
  return {
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: startingBoard.castles.map(castle => castle.clone()),
    sanctuaries: [],
    sanctuaryPool: [],
    turnCounter,
    graveyard: [],
    phoenixRecords: [],
  };
}

function createOneMoveTree(): MoveTree {
  const moveTree = new MoveTree();
  moveTree.rootNode.snapshot = createSnapshot(0);
  moveTree.addMove(
    {
      notation: "H12H11",
      turnNumber: 1,
      color: "w",
      phase: "Movement",
    },
    createSnapshot(1)
  );
  return moveTree;
}

describe("online terminal action guards", () => {
  it("does not submit online actions after a terminal online result", () => {
    const submitAction = vi.fn();
    const { result } = renderCustomGameLogicHook({
      onlineSession: {
        gameId: "game_terminal",
        role: "player",
        playerColor: "w",
        version: 3,
        status: "connected",
        result: { winner: "b", reason: "timeout" },
        submitAction,
      },
    });

    act(() => {
      result.current.handlePass();
      result.current.handleResign("w");
    });

    expect(submitAction).not.toHaveBeenCalled();
  });

  it("does not submit new online actions while an action is pending confirmation", () => {
    const submitAction = vi.fn();
    const { result } = renderCustomGameLogicHook({
      onlineSession: {
        gameId: "game_pending",
        role: "player",
        playerColor: "w",
        version: 3,
        status: "connected",
        isActionPending: true,
        submitAction,
      },
    });

    act(() => {
      result.current.handlePass();
      result.current.handleResign("w");
    });

    expect(submitAction).not.toHaveBeenCalled();
  });

  it("does not submit online actions while the player connection is not live", () => {
    const submitAction = vi.fn();
    const { result } = renderCustomGameLogicHook({
      onlineSession: {
        gameId: "game_resyncing",
        role: "player",
        playerColor: "w",
        version: 3,
        status: "resyncing",
        submitAction,
      },
    });

    act(() => {
      result.current.handlePass();
      result.current.handleResign("w");
    });

    expect(submitAction).not.toHaveBeenCalled();
  });

  it("treats spectator sessions as read-only", () => {
    const { result } = renderCustomGameLogicHook({
      onlineSession: {
        gameId: "game_spectator",
        role: "spectator",
        version: 3,
        status: "connected",
        spectatorUrl: "https://castles.example/?onlineGame=game_spectator&view=spectator",
      },
    });

    act(() => {
      result.current.handlePass();
      result.current.handleResign("w");
    });

    expect(result.current.turnCounter).toBe(0);
  });

  it("submits online resignation through the provider action without local state mutation", () => {
    const submitAction = vi.fn();
    const { result } = renderCustomGameLogicHook({
      onlineSession: {
        gameId: "game_provider_resign",
        role: "player",
        playerColor: "b",
        version: 0,
        status: "connected",
        submitAction,
      },
    });

    act(() => {
      result.current.handleResign("w");
    });

    expect(result.current.pieces.find((piece) => piece.type === "Monarch" && piece.color === "w")).toBeDefined();
    expect(submitAction).toHaveBeenCalledExactlyOnceWith({
      type: "RESIGN",
      baseVersion: 0,
    });
  });

  it("does not run local monarch-removal resignation while an online session exists", () => {
    const submitAction = vi.fn();

    const { result } = renderHook(() => {
      const { state, setState, gameEngine } = useCoreGame(startingBoard, allPieces);
      const interaction = useGameInteraction({
        state,
        setState,
        gameEngine,
        turnPhase: "Movement",
        currentPlayer: "w",
        handleHexClick: vi.fn(),
        movingPiece: null,
        onlineSession: {
          gameId: "game_online_resign",
          role: "player",
          playerColor: "b",
          version: 0,
          status: "connected",
          submitAction,
        },
      });

      return { state, interaction };
    });

    act(() => {
      result.current.interaction.handleResign("w");
    });

    expect(result.current.state.pieces.find((piece) => piece.type === "Monarch" && piece.color === "w")).toBeDefined();
    expect(submitAction).toHaveBeenCalledExactlyOnceWith({
      type: "RESIGN",
      baseVersion: 0,
    });
  });

  it("keeps online history review read-only for active players", () => {
    const submitAction = vi.fn();
    const { result } = renderCustomGameLogicHook({
      moveTree: createOneMoveTree(),
      turnCounter: 1,
      onlineSession: {
        gameId: "game_live_history_review",
        role: "player",
        playerColor: "w",
        version: 1,
        status: "connected",
        submitAction,
      },
    });

    const selectablePiece = result.current.pieces.find(piece => piece.color === "w" && piece.canMove);
    expect(selectablePiece).toBeDefined();

    act(() => {
      result.current.handlePieceClick(selectablePiece!);
    });

    expect(result.current.movingPiece).not.toBeNull();

    act(() => {
      result.current.stepHistory(-1);
    });

    expect(result.current.isViewingHistory).toBe(true);

    act(() => {
      result.current.handlePieceClick(result.current.pieces.find(piece => piece.color === "w")!);
      result.current.handlePass();
      result.current.handleResign("w");
      result.current.promotePiece(PieceType.Archer);
    });

    expect(result.current.movingPiece).toBeNull();
    expect(submitAction).not.toHaveBeenCalled();

    act(() => {
      result.current.stepHistory(1);
    });

    expect(result.current.isViewingHistory).toBe(false);
  });
});
