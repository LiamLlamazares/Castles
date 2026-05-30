import { describe, expect, it } from "vitest";
import { GameEngine } from "../../Classes/Core/GameEngine";
import { Hex } from "../../Classes/Entities/Hex";
import { MoveCommand, PassCommand } from "../../Classes/Commands";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { commandToOnlineAction } from "../commandToOnlineAction";

describe("commandToOnlineAction", () => {
  it("serializes move commands with source and target hexes", () => {
    const board = getStartingBoard(6);
    const context = { gameEngine: new GameEngine(board), board };
    const piece = getStartingPieces(6).find((candidate) => candidate.color === "w");
    if (!piece) throw new Error("missing white piece");

    const command = new MoveCommand(piece, new Hex(0, 2, -2), context);

    expect(commandToOnlineAction(command, 7)).toEqual({
      type: "MOVE",
      baseVersion: 7,
      from: { q: piece.hex.q, r: piece.hex.r, s: piece.hex.s, colorIndex: 0 },
      to: { q: 0, r: 2, s: -2, colorIndex: 0 },
    });
  });

  it("serializes pass commands", () => {
    const board = getStartingBoard(6);
    const context = { gameEngine: new GameEngine(board), board };

    expect(commandToOnlineAction(new PassCommand(context), 2)).toEqual({
      type: "PASS",
      baseVersion: 2,
    });
  });
});
