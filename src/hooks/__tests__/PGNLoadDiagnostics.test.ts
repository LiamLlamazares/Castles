import { act } from "@testing-library/react";
import { Board } from "../../Classes/Core/Board";
import { MoveTree } from "../../Classes/Core/MoveTree";
import { Castle } from "../../Classes/Entities/Castle";
import { Hex } from "../../Classes/Entities/Hex";
import { PGNService } from "../../Classes/Services/PGNService";
import { renderGameLogicHook } from "../test-utils/TestGameProviderUtils";

const makeFirstLegalMove = (result: ReturnType<typeof renderGameLogicHook>["result"]) => {
  const movablePiece = result.current.pieces.find(
    (piece) => piece.color === result.current.currentPlayer && piece.canMove
  );
  expect(movablePiece).toBeDefined();

  act(() => {
    result.current.handlePieceClick(movablePiece!);
  });

  const targetHexKey = Array.from(result.current.legalMoveSet)[0];
  expect(targetHexKey).toBeDefined();
  const targetHex = result.current.hexagons.find((hex) => hex.getKey() === targetHexKey);
  expect(targetHex).toBeDefined();

  act(() => {
    result.current.handleHexClick(targetHex!);
  });
};

describe("loadPGN replay diagnostics", () => {
  it("returns null when replay diagnostics are produced", () => {
    const { result } = renderGameLogicHook();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const header = result.current.getPGN().split("\n\n")[0];
    const invalidPgn = `${header}\n\n1. Z99Z98`;

    const loaded = result.current.loadPGN(invalidPgn);

    expect(loaded).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "[loadPGN] Replay diagnostics",
      expect.arrayContaining([
        expect.objectContaining({
          notation: "Z99Z98",
          message: "Mover not found at Z99",
        }),
      ])
    );
    consoleError.mockRestore();
  });

  it("returns null when a non-mainline variation produces replay diagnostics", () => {
    const { result } = renderGameLogicHook();
    makeFirstLegalMove(result);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const header = result.current.getPGN().split("\n\n")[0];
    const mainMove = result.current.moveTree.getHistoryLine()[0].notation;
    const invalidVariationPgn = `${header}\n\n1. ${mainMove} (1. Z99Z98)`;

    const loaded = result.current.loadPGN(invalidVariationPgn);

    expect(loaded).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "[loadPGN] Replay diagnostics",
      expect.arrayContaining([
        expect.objectContaining({
          notation: "Z99Z98",
          message: "Mover not found at Z99",
        }),
      ])
    );
    consoleError.mockRestore();
  });

  it("preserves setup castle state when hard replay failure falls back to start position", () => {
    const { result } = renderGameLogicHook();
    const castle = new Castle(new Hex(-3, 3, 0), "b", 4, true, "w", 2);
    const board = new Board({ nSquares: 3 }, [castle]);
    const moveTree = new MoveTree();
    const pgn = PGNService.generatePGN(board, [], [], [], {}, moveTree);
    const replay = vi
      .spyOn(PGNService, "replayMoveHistory")
      .mockImplementation(() => {
        throw new Error("forced replay failure");
      });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const loaded = result.current.loadPGN(pgn);

    expect(loaded).not.toBeNull();
    expect(loaded?.castles).toHaveLength(1);
    expect(loaded?.castles[0].color).toBe("b");
    expect(loaded?.castles[0].owner).toBe("w");
    expect(loaded?.castles[0].turns_controlled).toBe(4);
    expect(loaded?.castles[0].used_this_turn).toBe(true);
    expect(loaded?.castles[0].recruitment_cooldown).toBe(2);
    expect(loaded?.diagnostics).toEqual([
      expect.objectContaining({
        notation: "<replay>",
        message: "forced replay failure",
      }),
    ]);

    replay.mockRestore();
    consoleError.mockRestore();
  });
});
