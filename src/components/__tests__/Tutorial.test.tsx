import { render, screen } from "@testing-library/react";
import Tutorial from "../Tutorial";
import GameBoard from "../Game";
import { ThemeProvider } from "../../contexts/ThemeContext";

vi.mock("../Game", () => ({
  default: vi.fn(() => <div data-testid="tutorial-board" />),
}));

vi.mock("../PieceImages", () => ({
  getImageByPieceType: () => "test-piece.svg",
}));

describe("Tutorial", () => {
  it("uses a tutorial-specific shell without the nested game menu", () => {
    render(
      <ThemeProvider>
        <Tutorial onBack={vi.fn()} />
      </ThemeProvider>
    );

    expect(screen.getByRole("button", { name: "Back to game" })).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-board")).toBeInTheDocument();
    expect(GameBoard).toHaveBeenCalled();
    expect(vi.mocked(GameBoard).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        isTutorialMode: true,
        showNavigationMenu: false,
        showTooltipHint: false,
      })
    );
  });
});
