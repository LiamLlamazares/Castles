import { PieceType, type MoveRecord } from "../../Constants";
import { NotationService } from "../../Classes/Systems/NotationService";
import { Hex } from "../../Classes/Entities/Hex";
import { getMoveHighlightHexes } from "../MoveHighlightUtils";

function moveRecord(notation: string): MoveRecord {
  return {
    notation,
    turnNumber: 1,
    color: "w",
    phase: "Movement",
  };
}

describe("getMoveHighlightHexes", () => {
  it("extracts source and target hexes from movement notation", () => {
    const from = new Hex(0, 0, 0);
    const to = new Hex(1, -1, 0);
    const highlight = getMoveHighlightHexes(
      moveRecord(`${NotationService.toCoordinate(from)}${NotationService.toCoordinate(to)}`)
    );

    expect(highlight?.from?.equals(from)).toBe(true);
    expect(highlight?.to?.equals(to)).toBe(true);
  });

  it("extracts source and target hexes from capture and ability notation", () => {
    const from = new Hex(-1, 1, 0);
    const to = new Hex(1, 0, -1);
    const capture = getMoveHighlightHexes(
      moveRecord(`${NotationService.toCoordinate(from)}x${NotationService.toCoordinate(to)}`)
    );
    const ability = getMoveHighlightHexes(
      moveRecord(`WT:${NotationService.toCoordinate(from)}${NotationService.toCoordinate(to)}`)
    );

    expect(capture?.from?.equals(from)).toBe(true);
    expect(capture?.to?.equals(to)).toBe(true);
    expect(ability?.from?.equals(from)).toBe(true);
    expect(ability?.to?.equals(to)).toBe(true);
  });

  it("highlights only the target for spawn-style notation", () => {
    const target = new Hex(0, 1, -1);
    const highlight = getMoveHighlightHexes(
      moveRecord(`${NotationService.toCoordinate(target)}=${PieceType.Knight.substring(0, 3)}`)
    );

    expect(highlight?.from).toBeNull();
    expect(highlight?.to?.equals(target)).toBe(true);
  });

  it("ignores pass and off-board coordinates", () => {
    const validHexKeys = new Set([new Hex(0, 0, 0).getKey()]);

    expect(getMoveHighlightHexes(moveRecord("Pass"))).toBeNull();
    expect(getMoveHighlightHexes(moveRecord("A1B1"), validHexKeys)).toBeNull();
  });
});
