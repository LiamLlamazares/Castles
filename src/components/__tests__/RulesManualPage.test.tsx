import { fireEvent, render, screen } from "@testing-library/react";
import RulesManualPage from "../RulesManualPage";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { PieceType } from "../../Constants";

describe("RulesManualPage", () => {
  it("renders the full rules section backbone and every piece type", () => {
    render(
      <ThemeProvider>
        <RulesManualPage />
      </ThemeProvider>
    );

    [
      "Quick Start",
      "Winning",
      "Turn Phases",
      "Terrain",
      "Combat",
      "Combat Examples",
      "Ranges",
      "Castles and Recruitment",
      "Recruitment Cycle",
      "Promotion",
      "Sanctuaries",
      "Sanctuary Details",
      "Special Abilities",
      "Standard Pieces",
      "Special Pieces",
      "Common Blockers",
      "Optional Modes",
    ].forEach((heading) => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });

    Object.values(PieceType).forEach((pieceType) => {
      expect(screen.getAllByText(new RegExp(pieceType)).length).toBeGreaterThan(0);
    });
  });

  it("has a visible theme toggle on the standalone manual", () => {
    render(
      <ThemeProvider>
        <RulesManualPage />
      </ThemeProvider>
    );

    const toggle = screen.getByRole("button", { name: /mode/i });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /mode/i })).toBeInTheDocument();
  });
});
