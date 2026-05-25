import { fireEvent, render, screen } from "@testing-library/react";
import BoardEditorToolbar from "../BoardEditorToolbar";

vi.mock("../../Classes/Services/AssetRegistry", () => ({
  getAssetUrl: (_theme: string, color: string, type: string) => `${color}${type}.svg`,
}));

describe("BoardEditorToolbar", () => {
  it("shows delete mode near the top with a trash icon", () => {
    const onToolSelect = vi.fn();

    render(
      <BoardEditorToolbar
        selectedTool={null}
        onToolSelect={onToolSelect}
        boardRadius={8}
        onBoardRadiusChange={vi.fn()}
        isInitialBoard={false}
        showCoordinates
        onShowCoordinatesChange={vi.fn()}
        onTooltip={vi.fn()}
      />
    );

    const deleteButton = screen.getByRole("button", { name: /Delete Mode/ });
    const pieceColorHeading = screen.getByText("Piece Color");
    const showCoordinatesToggle = screen.getByText("Show Coordinates");
    const shrinesHeading = screen.getByText("Shrines (Mirrored)");

    expect(deleteButton.textContent).toContain("🗑");
    expect(
      deleteButton.compareDocumentPosition(pieceColorHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      shrinesHeading.compareDocumentPosition(showCoordinatesToggle) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(deleteButton);

    expect(onToolSelect).toHaveBeenCalledWith({ type: "delete" });
  });
});
