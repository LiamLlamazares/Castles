/**
 * HexGrid component - renders the hexagonal board tiles.
 * Extracted from Game.tsx for better separation of concerns.
 */
import React from "react";
import { Hex, Point } from "../Classes/Entities/Hex";
import { Castle } from "../Classes/Entities/Castle";
import { Board } from "../Classes/Core/Board";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { N_SQUARES, LEGAL_MOVE_DOT_SCALE_FACTOR } from "../Constants";
import { startingBoard, startingLayout } from "../ConstantImports";

interface HexGridProps {
  hexagons: Hex[];
  castles: Castle[];
  legalMoveSet: Set<string>;
  legalAttackSet: Set<string>;
  showCoordinates: boolean;
  isBoardRotated: boolean;
  /** Returns CSS class indicating if hex is adjacent to controlled castle */
  isAdjacentToControlledCastle: (hex: Hex) => boolean;
  onHexClick: (hex: Hex) => void;
  resizeVersion: number;
  layout: LayoutService;
  board: Board;
}

/** Get the owner class for a castle hex (if applicable) */
const getCastleOwnerClass = (hex: Hex, castles: Castle[]): string => {
  const castle = castles.find(c => c.hex.equals(hex));
  if (!castle) return '';
  // Return class based on current owner (not original color)
  return castle.owner === 'w' ? 'castle-owned-white' : 'castle-owned-black';
};

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

/** Render a circle indicator (for legal moves/attacks) */
const renderCircle = (
  hex: Hex,
  className: string,
  isBoardRotated: boolean,
  onHexClick: (hex: Hex) => void,
  layout: LayoutService
): JSX.Element => {
  const center = getHexCenter(hex, isBoardRotated, layout);
  // Dynamic radius based on hex size
  const radius = layout.size_hexes * LEGAL_MOVE_DOT_SCALE_FACTOR;
  
  return (
    <circle
      key={hex.getKey()}
      cx={center.x}
      cy={center.y}
      r={radius}
      className={className}
      onClick={() => onHexClick(hex)}
    />
  );
};

const HexGrid = React.memo(({
  hexagons,
  castles,
  legalMoveSet,
  legalAttackSet,
  showCoordinates,
  isBoardRotated,
  isAdjacentToControlledCastle,
  onHexClick,
  layout,
  board
}: HexGridProps) => {

  const getHexClass = (hex: Hex): string => {
      const key = hex.getKey();
      const isHighGround = board.highGroundHexSet.has(key);
      const isRiver = board.riverHexSet.has(key);
      const isWhiteCastle = board.whiteCastleHexSet.has(key);
      const isBlackCastle = board.blackCastleHexSet.has(key);
      const isCastle = board.castleHexSet.has(key);
      
      let colorClass = ["hexagon-dark", "hexagon-mid", "hexagon-light"][
        ((hex.color_index % 3) + 3) % 3
      ];
      
      if (isHighGround) colorClass += " hexagon-high-ground";
      
      if (isRiver) return "hexagon-river";
      if (isWhiteCastle) return "hexagon-white-castle";
      if (isBlackCastle) return "hexagon-black-castle";
      if (isCastle) return "hexagon-castle"; // Fallback
      
      return colorClass;
  };

  return (
    <>
      {/* Render all hexagons */}
      {hexagons.map((hex: Hex) => (
        <g key={hex.getKey()}>
          <polygon
            points={getPolygonPoints(hex, isBoardRotated, layout)}
            className={`${getHexClass(hex)} ${
              isAdjacentToControlledCastle(hex)
                ? "hexagon-castle-adjacent"
                : ""
            } ${getCastleOwnerClass(hex, castles)}`}
            onClick={() => onHexClick(hex)}
            filter={
              getHexClass(hex).includes("hexagon-high-ground")
                ? "url(#shadow)"
                : ""
            }
          />
          {showCoordinates && (
            <text
              x={getHexCenter(hex, isBoardRotated, layout).x}
              y={getHexCenter(hex, isBoardRotated, layout).y + 5}
              textAnchor="middle"
              style={{ fontSize: "15px", color: "black" }}
            >
              {`${-hex.q}, ${-hex.s}`}
            </text>
          )}
        </g>
      ))}
      {/* Render dots for legal moves and attacks */}
      {hexagons.map((hex: Hex) => {
        const key = hex.getKey();
        if (legalMoveSet.has(key)) {
          return renderCircle(hex, "legalMoveDot", isBoardRotated, onHexClick, layout);
        } else if (legalAttackSet.has(key)) {
          return renderCircle(hex, "legalAttackDot", isBoardRotated, onHexClick, layout);
        }
        return null;
      })}
    </>
  );
});

export default HexGrid;
