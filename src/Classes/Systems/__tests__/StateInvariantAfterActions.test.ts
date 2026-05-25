import { act } from "@testing-library/react";
import { StateValidator } from "../StateValidator";
import { Board } from "../../Core/Board";
import { GameState } from "../../Core/GameState";
import { renderGameLogicHook } from "../../../hooks/test-utils/TestGameProviderUtils";

type ValidatableGameState = GameState & { board: Board };

const expectValidState = (state: ValidatableGameState) => {
  const errors = StateValidator.validate(state, state.board);
  expect(errors).toEqual([]);
};

describe("State invariants after live actions", () => {
  it("keeps state valid after a legal move", () => {
    const { result } = renderGameLogicHook();

    expectValidState(result.current as ValidatableGameState);

    const movablePiece = result.current.pieces.find(
      (piece) => piece.color === "w" && piece.canMove
    );
    expect(movablePiece).toBeDefined();

    act(() => {
      result.current.handlePieceClick(movablePiece!);
    });

    const targetHexKey = Array.from(result.current.legalMoveSet)[0];
    expect(targetHexKey).toBeDefined();

    const targetHex = result.current.hexagons.find(
      (hex) => hex.getKey() === targetHexKey
    );
    expect(targetHex).toBeDefined();

    act(() => {
      result.current.handleHexClick(targetHex!);
    });

    expectValidState(result.current as ValidatableGameState);
    expect(result.current.moveTree.getHistoryLine()).toHaveLength(1);
  });

  it("keeps state valid after passing", () => {
    const { result } = renderGameLogicHook();

    expectValidState(result.current as ValidatableGameState);

    act(() => {
      result.current.handlePass();
    });

    expectValidState(result.current as ValidatableGameState);
    expect(result.current.moveTree.getHistoryLine()).toHaveLength(1);
  });
});
