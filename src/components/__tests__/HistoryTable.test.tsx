import { fireEvent, render, screen } from "@testing-library/react";
import HistoryTable from "../HistoryTable";
import type { PositionSnapshot } from "../../Classes/Core/GameState";
import { MoveTree } from "../../Classes/Core/MoveTree";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { MoveRecord } from "../../Constants";
import { createPieceMap } from "../../utils/PieceMap";

function createMove(turnNumber: number, notation: string, color: "w" | "b"): MoveRecord {
  return {
    notation,
    color,
    turnNumber,
    phase: "Movement",
  };
}

function createSnapshot(turnCounter: number): PositionSnapshot {
  const board = getStartingBoard(6);
  const pieces = getStartingPieces(6);
  return {
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: board.castles,
    sanctuaries: [],
    sanctuaryPool: [],
    turnCounter,
    graveyard: [],
    phoenixRecords: [],
  };
}

describe("HistoryTable", () => {
  it("renders move entries as keyboard-accessible buttons", () => {
    const moveTree = new MoveTree();
    const firstMove = createMove(1, "A1A2", "w");
    moveTree.rootNode.snapshot = createSnapshot(0);
    moveTree.addMove(firstMove, createSnapshot(1));
    const firstNode = moveTree.current;
    moveTree.addMove(createMove(1, "B1B2", "b"));
    const onJumpToNode = vi.fn();

    render(
      <HistoryTable
        moveHistory={[firstMove]}
        moveTree={moveTree}
        onJumpToNode={onJumpToNode}
        currentPlayer="w"
      />
    );

    const moveButton = screen.getByRole("button", { name: "1. A1A2" });
    fireEvent.click(moveButton);

    expect(onJumpToNode).toHaveBeenCalledWith(firstNode.id);
  });

  it("does not jump to history nodes that have no replay snapshot", () => {
    const moveTree = new MoveTree();
    const firstMove = createMove(1, "A1A2", "w");
    moveTree.addMove(firstMove);
    const onJumpToNode = vi.fn();

    render(
      <HistoryTable
        moveHistory={[firstMove]}
        moveTree={moveTree}
        onJumpToNode={onJumpToNode}
        currentPlayer="w"
      />
    );

    const moveButton = screen.getByRole("button", { name: "1. A1A2" });
    expect(moveButton).toBeDisabled();

    fireEvent.click(moveButton);

    expect(onJumpToNode).not.toHaveBeenCalled();
  });
});
