import { fireEvent, render, screen } from "@testing-library/react";
import GameSetup from "../GameSetup";
import { Hex } from "../../Classes/Entities/Hex";
import { Sanctuary } from "../../Classes/Entities/Sanctuary";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";

jest.mock("../../Classes/Services/AssetRegistry", () => ({
  getAssetUrl: (_theme: string, color: string, type: string) => `${color}${type}.svg`,
}));

describe("GameSetup", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("passes the preview sanctuary positions through when starting a game", () => {
    const previewSanctuaries = [
      new Sanctuary(new Hex(-1, 1, 0), SanctuaryType.WolfCovenant, "w"),
      new Sanctuary(new Hex(1, -1, 0), SanctuaryType.WolfCovenant, "b"),
    ];
    jest
      .spyOn(SanctuaryGenerator, "generateRandomSanctuaries")
      .mockReturnValue(previewSanctuaries);

    const onPlay = jest.fn();
    render(<GameSetup onPlay={onPlay} />);

    fireEvent.click(screen.getByRole("button", { name: "PLAY GAME" }));

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0][3]).toBe(previewSanctuaries);
    expect(onPlay.mock.calls[0][4]).toEqual([
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
    ]);
  });
});
