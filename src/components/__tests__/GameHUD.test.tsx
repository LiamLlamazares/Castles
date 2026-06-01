import { render, screen } from "@testing-library/react";
import { GameProvider } from "../../contexts/GameProvider";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { allPieces, startingBoard } from "../../ConstantImports";
import { useTooltip } from "../../hooks/useTooltip";
import { GameHUD } from "../HUD/GameHUD";

const HudHarness = ({ showDiscoveryHint }: { showDiscoveryHint: boolean }) => {
  const tooltip = useTooltip();

  return (
    <ThemeProvider>
      <GameProvider config={{ board: startingBoard, pieces: allPieces }}>
        <GameHUD
          tooltip={tooltip}
          activeAbility={null}
          onAbilitySelect={vi.fn()}
          showDiscoveryHint={showDiscoveryHint}
        />
      </GameProvider>
    </ThemeProvider>
  );
};

describe("GameHUD", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("can re-enable the tooltip discovery hint after being mounted with it disabled", () => {
    const { rerender } = render(<HudHarness showDiscoveryHint={false} />);

    expect(screen.queryByText(/Right-click any piece or hex/i)).not.toBeInTheDocument();

    rerender(<HudHarness showDiscoveryHint={true} />);

    expect(screen.getByText(/Right-click any piece or hex/i)).toBeInTheDocument();
  });
});
