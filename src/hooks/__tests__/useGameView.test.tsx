import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGameView } from "../useGameView";

function GameViewProbe({ initialBoardRotated = false }: { initialBoardRotated?: boolean }) {
  const view = useGameView(initialBoardRotated);
  return (
    <button
      type="button"
      data-board-orientation={view.isBoardRotated ? "rotated" : "default"}
      onClick={() => view.setBoardRotated(false)}
    >
      Board orientation
    </button>
  );
}

describe("useGameView", () => {
  it("can seed board rotation before the first render", () => {
    render(<GameViewProbe initialBoardRotated />);

    expect(screen.getByRole("button", { name: "Board orientation" })).toHaveAttribute(
      "data-board-orientation",
      "rotated"
    );
  });

  it("keeps explicit orientation updates working after initialization", () => {
    render(<GameViewProbe initialBoardRotated />);

    const button = screen.getByRole("button", { name: "Board orientation" });
    fireEvent.click(button);

    expect(button).toHaveAttribute("data-board-orientation", "default");
  });
});
