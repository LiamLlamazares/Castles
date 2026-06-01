import { fireEvent, render, screen } from "@testing-library/react";
import HistoryTable from "../HistoryTable";
import { MoveTree } from "../../Classes/Core/MoveTree";
import { MoveRecord } from "../../Constants";

function createMove(turnNumber: number, notation: string, color: "w" | "b"): MoveRecord {
  return {
    notation,
    color,
    turnNumber,
    phase: "Movement",
  };
}

describe("HistoryTable", () => {
  it("renders move entries as keyboard-accessible buttons", () => {
    const moveTree = new MoveTree();
    const firstMove = createMove(1, "A1A2", "w");
    moveTree.addMove(firstMove);
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
});
