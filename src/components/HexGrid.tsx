/**
 * HexGrid component - renders the hexagonal board tiles.
 * Extracted from Game.tsx for better separation of concerns.
 */
import { Hex, Point } from "../Classes/Hex";
import { N_SQUARES, LEGAL_MOVE_DOT_RADIUS } from "../Constants";
import { startingBoard } from "../ConstantImports";

interface HexGridProps {
  hexagons: Hex[];
  legalMoveSet: Set<string>;
  legalAttackSet: Set<string>;
  showCoordinates: boolean;
  isBoardRotated: boolean;
  /** Returns CSS class indicating if hex is adjacent to controlled castle */
  isAdjacentToControlledCastle: (hex: Hex) => boolean;
  onHexClick: (hex: Hex) => void;
}

/** Get the polygon points for a hex */
const getPolygonPoints = (hex: Hex, isBoardRotated: boolean): string => {
  return startingBoard.hexCornerString[
    hex.reflect().getKey(!isBoardRotated)
  ];
};

/** Get the pixel center of a hex */
const getHexCenter = (hex: Hex, isBoardRotated: boolean): Point => {
  return startingBoard.layout.hexToPixelReflected(hex, isBoardRotated);
};

/** Render a circle indicator (for legal moves/attacks) */
const renderCircle = (
  hex: Hex,
  className: string,
  isBoardRotated: boolean,
  onHexClick: (hex: Hex) => void
): JSX.Element => {
  const center = getHexCenter(hex, isBoardRotated);
  return (
    <circle
      key={hex.getKey()}
      cx={center.x}
      cy={center.y}
      r={LEGAL_MOVE_DOT_RADIUS / N_SQUARES}
      className={className}
      onClick={() => onHexClick(hex)}
    />
  );
};

const HexGrid: React.FC<HexGridProps> = ({
  hexagons,
  legalMoveSet,
  legalAttackSet,
  showCoordinates,
  isBoardRotated,
  isAdjacentToControlledCastle,
  onHexClick,
}) => {
  return (
    <>
      {/* Render all hexagons */}
      {hexagons.map((hex: Hex) => (
        <g key={hex.getKey()}>
          <polygon
            points={getPolygonPoints(hex, isBoardRotated)}
            className={`${startingBoard.colorClassMap[hex.getKey()]} ${
              isAdjacentToControlledCastle(hex)
                ? "hexagon-castle-adjacent"
                : ""
            }`}
            onClick={() => onHexClick(hex)}
            filter={
              startingBoard.colorClassMap[hex.getKey()] === "hexagon-high-ground"
                ? "url(#shadow)"
                : ""
            }
          />
          {showCoordinates && (
            <text
              x={getHexCenter(hex, isBoardRotated).x}
              y={getHexCenter(hex, isBoardRotated).y + 5}
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
          return renderCircle(hex, "legalMoveDot", isBoardRotated, onHexClick);
        } else if (legalAttackSet.has(key)) {
          return renderCircle(hex, "legalAttackDot", isBoardRotated, onHexClick);
        }
        return null;
      })}
    </>
  );
};

export default HexGrid;
