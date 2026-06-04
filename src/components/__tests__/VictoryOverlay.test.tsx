import { fireEvent, render, screen } from "@testing-library/react";
import VictoryOverlay from "../VictoryOverlay";

describe("VictoryOverlay", () => {
  it("hides Reset Board when restart is not allowed", () => {
    const onRestart = vi.fn();
    const onSetup = vi.fn();

    render(
      <VictoryOverlay
        victoryMessage="White wins by resignation"
        winner="w"
        onRestart={onRestart}
        onSetup={onSetup}
        onAnalyze={vi.fn()}
        canRestart={false}
      />
    );

    expect(screen.queryByRole("button", { name: "Reset Board" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));

    expect(onSetup).toHaveBeenCalledOnce();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("shows a rematch action when a rematch target is available", () => {
    const onRematch = vi.fn();

    render(
      <VictoryOverlay
        victoryMessage="White wins by resignation"
        winner="w"
        onRestart={vi.fn()}
        onSetup={vi.fn()}
        onAnalyze={vi.fn()}
        canRestart={false}
        rematchLabel="Rematch Samir"
        onRematch={onRematch}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Rematch Samir" }));

    expect(onRematch).toHaveBeenCalledOnce();
  });
});
