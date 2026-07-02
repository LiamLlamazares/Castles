import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { MoveTree } from "../../Classes/Core/MoveTree";
import type { MoveRecord } from "../../Constants";
import {
  hydrateAnalysisMoveTreeFromOnlineSnapshot,
  hydrateAnalysisMoveTreeFromSetup,
} from "../replayAnalysis";
import {
  createInitialStateFromSetupDTO,
  serializeGameState,
  serializeOnlineGameSetup,
} from "../serialization";
import type { OnlineGameSnapshotDTO } from "../types";

function moveRecord(notation: string): MoveRecord {
  return {
    notation,
    turnNumber: 1,
    color: "w",
    phase: "Movement",
  };
}

describe("online replay analysis", () => {
  it("hydrates sparse move history into a navigable snapshot tree", () => {
    const sparseTree = new MoveTree();
    sparseTree.addMove(moveRecord("H12H11"));

    const result = hydrateAnalysisMoveTreeFromSetup({
      board: getStartingBoard(6),
      pieces: getStartingPieces(6),
      moveTree: sparseTree,
      sanctuaries: [],
    });

    expect(result.status).toBe("complete");
    expect(result.moveTree).not.toBe(sparseTree);
    expect(result.moveTree.rootNode.snapshot).toBeDefined();
    expect(result.moveTree.rootNode.children).toHaveLength(1);
    expect(result.moveTree.rootNode.children[0].snapshot?.turnCounter).toBeGreaterThan(0);
    expect(result.moveTree.current.snapshot?.turnCounter).toBeGreaterThan(0);
  });

  it("hydrates online snapshots with sparse move history through the same replay path", () => {
    const setup = serializeOnlineGameSetup({
      board: getStartingBoard(6),
      pieces: getStartingPieces(6),
      sanctuaries: [],
      initialPoolTypes: [],
      timeControl: { initial: 20, increment: 20 },
    });
    const initialState = createInitialStateFromSetupDTO(setup).state;
    const snapshot: OnlineGameSnapshotDTO = {
      gameId: "game_replay_snapshot",
      version: 1,
      setup,
      state: serializeGameState(initialState),
      moveHistory: [moveRecord("H12H11")],
      playerToMove: "b",
      turnPhase: "Movement",
    };

    const result = hydrateAnalysisMoveTreeFromOnlineSnapshot(snapshot);

    expect(result.status).toBe("complete");
    expect(result.moveTree.rootNode.children).toHaveLength(1);
    expect(result.moveTree.rootNode.children[0].snapshot?.turnCounter).toBeGreaterThan(0);
  });

  it("uses the saved snapshot state when an online replay has no move history", () => {
    const setup = serializeOnlineGameSetup({
      board: getStartingBoard(6),
      pieces: getStartingPieces(6),
      sanctuaries: [],
      initialPoolTypes: [],
      gameRules: { vpModeEnabled: true },
    });
    const initialState = createInitialStateFromSetupDTO(setup).state;
    const snapshot: OnlineGameSnapshotDTO = {
      gameId: "game_replay_no_moves",
      version: 0,
      setup,
      state: {
        ...serializeGameState(initialState),
        victoryPoints: { w: 4, b: 2 },
      },
      moveHistory: [],
      playerToMove: "w",
      turnPhase: "Movement",
    };

    const result = hydrateAnalysisMoveTreeFromOnlineSnapshot(snapshot);

    expect(result.status).toBe("complete");
    expect(result.moveTree.rootNode.snapshot?.victoryPoints).toEqual({ w: 4, b: 2 });
    expect(result.moveTree.current.snapshot?.victoryPoints).toEqual({ w: 4, b: 2 });
  });
});
