import { render, screen } from "@testing-library/react";
import { Board } from "../../Classes/Core/Board";
import { Castle } from "../../Classes/Entities/Castle";
import { Hex } from "../../Classes/Entities/Hex";
import { formatOwnerTurnCount } from "../../Constants";
import { TerrainTooltip } from "../TerrainTooltip";

vi.mock("../PieceImages", () => ({
  getImageByPieceType: () => "piece.svg",
}));

describe("TerrainTooltip", () => {
  it("uses shared owner-turn wording for castle recruitment cooldowns", () => {
    const castleHex = new Hex(3, -3, 0);
    const castle = new Castle(castleHex, "b", 0, false, "w", 1);
    const board = new Board(
      { nSquares: 3, riverCrossingLength: 1, hasHighGround: false },
      [castle]
    );

    render(<TerrainTooltip hex={castleHex} board={board} castle={castle} position={{ x: 0, y: 0 }} />);

    expect(screen.getByText(formatOwnerTurnCount(1))).toBeInTheDocument();
    expect(screen.queryByText("1 owner-turns")).not.toBeInTheDocument();
  });
});
