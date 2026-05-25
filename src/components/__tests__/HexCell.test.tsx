import { render, screen } from "@testing-library/react";
import HexCell from "../HexCell";
import { Hex } from "../../Classes/Entities/Hex";
import { SanctuaryType } from "../../Constants";

vi.mock("../../Classes/Services/AssetRegistry", () => ({
  getAssetUrl: (_theme: string, color: string, type: string) => `${color}${type}.svg`,
}));

const baseProps = {
  hex: new Hex(0, 0, 0),
  points: "0,0 10,0 10,10",
  center: { x: 50, y: 50 },
  className: "",
  isRiver: false,
  isHighGround: false,
  isCastle: false,
  castleOwner: null,
  castleTurnsControlled: 0,
  showCoordinates: false,
  showTerrainIcons: true,
  showSanctuaryIcons: true,
  showCastleRecruitment: true,
  onClick: vi.fn(),
  layoutSize: 40,
};

describe("HexCell", () => {
  it("shows a cooldown badge on sanctuary icons when cooldown remains", () => {
    render(
      <svg>
        <HexCell
          {...baseProps}
          sanctuaryType={SanctuaryType.WolfCovenant}
          sanctuaryCooldown={3}
        />
      </svg>
    );

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show a sanctuary cooldown badge when ready", () => {
    render(
      <svg>
        <HexCell
          {...baseProps}
          sanctuaryType={SanctuaryType.WolfCovenant}
          sanctuaryCooldown={0}
        />
      </svg>
    );

    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
