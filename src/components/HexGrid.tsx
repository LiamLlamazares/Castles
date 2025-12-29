import React from "react";
import { Hex, Point } from "../Classes/Entities/Hex";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { Board } from "../Classes/Core/Board";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { getHexVisualClass, getCastleOwnerClass, getSanctuaryVisualClass } from "../utils/HexRenderUtils";

interface HexGridProps {
  hexagons: Hex[];
  castles: Castle[];
  sanctuaries: Sanctuary[];
  legalMoveSet: Set<string>;
  legalAttackSet: Set<string>;
  showCoordinates: boolean;
  isBoardRotated: boolean;
  /** Returns CSS class indicating if hex is adjacent to controlled castle */
  isAdjacentToControlledCastle: (hex: Hex) => boolean;
  onHexClick: (hex: Hex) => void;
  onHexRightClick?: (hex: Hex) => void;
  onHexHover?: (hex: Hex | null, event?: React.MouseEvent) => void;
  resizeVersion: number;
  layout: LayoutService;
  board: Board;
  isPledgeTarget?: (hex: Hex) => boolean;
  pledgingSanctuary?: Hex | null;
}

/** Get the polygon points for a hex */
const getPolygonPoints = (hex: Hex, isBoardRotated: boolean, layout: LayoutService): string => {
  return layout.hexCornerString[
    hex.reflect().getKey(!isBoardRotated)
  ];
};

/** Get the pixel center of a hex */
const getHexCenter = (hex: Hex, isBoardRotated: boolean, layout: LayoutService): Point => {
  return layout.layout.hexToPixelReflected(hex, isBoardRotated);
};


const HexGrid = React.memo(({
  hexagons,
  castles,
  sanctuaries,
  legalMoveSet,
  legalAttackSet,
  showCoordinates,
  isBoardRotated,
  isAdjacentToControlledCastle,
  onHexClick,
  onHexRightClick,
  onHexHover,
  layout,
  board,
  isPledgeTarget,
  pledgingSanctuary
}: HexGridProps) => {

  return (
    <>
      {/* Render all hexagons */}
      {hexagons.map((hex: Hex) => {
        // Compute classes
        const visualClass = getHexVisualClass(hex, board);
        const sanctuaryClass = getSanctuaryVisualClass(hex, sanctuaries);
        const adjacencyClass = isAdjacentToControlledCastle(hex) ? "hexagon-castle-adjacent" : "";
        const castleOwnerClass = getCastleOwnerClass(hex, castles);
        const pledgeClass = isPledgeTarget && isPledgeTarget(hex) ? "hexagon-pledge-target" : "";
        const pledgingSourceClass = pledgingSanctuary && hex.equals(pledgingSanctuary) ? "hexagon-pledging-source" : "";
        
        return (
          <g key={hex.getKey()}>
            <polygon
              points={getPolygonPoints(hex, isBoardRotated, layout)}
              className={`${visualClass} ${sanctuaryClass} ${adjacencyClass} ${castleOwnerClass} ${pledgeClass} ${pledgingSourceClass}`}
              onClick={() => onHexClick(hex)}
              onContextMenu={(e) => {
                if (onHexRightClick) {
                  e.preventDefault();
                  onHexRightClick(hex);
                }
              }}
              onMouseEnter={(e) => onHexHover && onHexHover(hex, e)}
              onMouseLeave={() => onHexHover && onHexHover(null)}
              filter={
                visualClass.includes("hexagon-high-ground")
                  ? "url(#shadow)"
                  : ""
              }
            />
            {showCoordinates && (
              <text
                x={getHexCenter(hex, isBoardRotated, layout).x}
                y={getHexCenter(hex, isBoardRotated, layout).y + 5}
                textAnchor="middle"
                style={{ fontSize: "15px", fill: "black", pointerEvents: "none" }}
              >
                {`${-hex.q}, ${-hex.s}`}
              </text>
            )}
          </g>
        );
      })}

    </>
  );
});

export default HexGrid;
