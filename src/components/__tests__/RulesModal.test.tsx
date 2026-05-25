import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("../PieceImages", () => ({
  getImageByPieceType: () => "test-piece.svg",
}));

import RulesModal from "../RulesModal";
import { ThemeProvider } from "../../contexts/ThemeContext";

const renderRulesModal = () =>
  render(
    <ThemeProvider>
      <RulesModal isOpen={true} onClose={jest.fn()} />
    </ThemeProvider>
  );

describe("RulesModal", () => {
  it("renders quick rules and opens the full rules page in a new tab", () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    renderRulesModal();

    expect(screen.getByText("Quick Rules")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Full Rules"));

    expect(openSpy).toHaveBeenCalledWith(
      `${window.location.origin}/rules`,
      "_blank",
      "noopener,noreferrer"
    );

    openSpy.mockRestore();
  });
});
