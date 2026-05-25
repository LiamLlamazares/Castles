import { render, screen } from "@testing-library/react";
import ControlPanel from "../ControlPanel";

describe("ControlPanel", () => {
  const baseProps = {
    currentPlayer: "w" as const,
    turnPhase: "Movement" as const,
    turnCounter: 0,
    onPass: vi.fn(),
    onResign: vi.fn(),
    onNewGame: vi.fn(),
    moveHistory: [],
    hasGameStarted: false,
    winner: null,
  };

  it("shows a clear victory points scoreboard when VP mode is enabled", () => {
    const { container } = render(
      <ControlPanel
        {...baseProps}
        victoryPoints={{ w: 3, b: 1 }}
      />
    );

    expect(screen.getByText("Victory Points")).toBeInTheDocument();
    expect(screen.getByText("White")).toBeInTheDocument();
    expect(screen.getByText("Black")).toBeInTheDocument();
    expect(screen.getByText("First to 10")).toBeInTheDocument();
    expect(screen.getByLabelText("White victory points: 3 of 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Black victory points: 1 of 10")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="vp-pip-w"][data-filled="true"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="vp-pip-b"][data-filled="true"]')).toHaveLength(1);
  });
});
