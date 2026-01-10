import React from "react";
import { Hex, Point } from "../Classes/Entities/Hex";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { Board } from "../Classes/Core/Board";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { PieceType, SanctuaryConfig } from "../Constants";
import { getImageByPieceType } from "./PieceImages";
import { getHexVisualClass, getCastleOwnerClass, getSanctuaryVisualClass } from "../utils/HexRenderUtils";

// SVG imports for terrain icons
import riverSvg from "../Assets/Images/Board/river.svg";
import mountainSvg from "../Assets/Images/Board/mountain.svg";

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
  showCastleRecruitment?: boolean;
  showTerrainIcons?: boolean;
  showSanctuaryIcons?: boolean;
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

// Recruitment cycle matching rules.md
const RECRUITMENT_CYCLE = [
  PieceType.Swordsman,
  PieceType.Archer,
  PieceType.Knight,
  PieceType.Eagle,
  PieceType.Giant,
  PieceType.Trebuchet,
  PieceType.Assassin,
  PieceType.Dragon,
  PieceType.Monarch
];



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
  pledgingSanctuary,
  showCastleRecruitment = true,
  showTerrainIcons = true,
  showSanctuaryIcons = true
}: HexGridProps) => {

  // Sort hexagons by render priority: Standard < Sanctuary < Castle
  const sortedHexagons = React.useMemo(() => {
    return [...hexagons].sort((a, b) => {
      const getPriority = (h: Hex) => {
        if (castles.some(c => c.hex.equals(h))) return 2;
        if (sanctuaries.some(s => s.hex.equals(h))) return 1;
        return 0;
      };
      return getPriority(a) - getPriority(b);
    });
  }, [hexagons, castles, sanctuaries]);

  return (
    <>
      {/* Render all hexagons in sorted order */}
      {sortedHexagons.map((hex: Hex) => {
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
                {`${hex.q}, ${hex.r}`}
              </text>
            )}
            
            {/* Accessibility: Terrain Icons */}
            {(() => {
              const center = getHexCenter(hex, isBoardRotated, layout);
              const isRiver = board.riverHexSet.has(hex.getKey());
              const isHighGround = board.highGroundHexSet.has(hex.getKey());
              const sanctuary = sanctuaries.find(s => s.hex.equals(hex));
              const iconSize = layout.size_image * 0.35;
              const offsetX = iconSize * 1.1; // Center-right
              const offsetY = 0; // Vertically centered
              
              // River icon (center-right)
              if (isRiver && showTerrainIcons) {
                return (
                  <image
                    href={riverSvg}
                    x={center.x + offsetX - iconSize/2}
                    y={center.y + offsetY - iconSize/2}
                    width={iconSize}
                    height={iconSize}
                    style={{ pointerEvents: 'none' }}
                  />
                );
              }
              
              // High ground icon (center-right)
              if (isHighGround && !castles.some(c => c.hex.equals(hex)) && showTerrainIcons) {
                return (
                  <image
                    href={mountainSvg}
                    x={center.x + offsetX - iconSize/2}
                    y={center.y + offsetY - iconSize/2}
                    width={iconSize}
                    height={iconSize}
                    style={{ pointerEvents: 'none' }}
                  />
                );
              }
              
              // Sanctuary icon - show the piece SVG (center-right)
              if (sanctuary && showSanctuaryIcons) {
                const pieceType = SanctuaryConfig[sanctuary.type].pieceType;
                
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    {/* Background circle */}
                    <circle
                      cx={center.x + offsetX}
                      cy={center.y + offsetY}
                      r={iconSize * 0.55}
                      fill="rgba(0, 0, 0, 0.6)"
                      stroke="rgba(255, 215, 0, 0.8)"
                      strokeWidth={1.5}
                    />
                    {/* Piece icon - use white color for visibility */}
                    <image
                      href={getImageByPieceType(pieceType, 'w')}
                      x={center.x + offsetX - iconSize/2}
                      y={center.y + offsetY - iconSize/2}
                      width={iconSize}
                      height={iconSize}
                      opacity={0.95}
                    />
                  </g>
                );
              }
              
              return null;
            })()}
            
            {/* Castle Recruitment Preview - always visible */}
            {(() => {
              if (!showCastleRecruitment) return null;
              
              const castle = castles.find(c => c.hex.equals(hex));
              if (castle) {
                const center = getHexCenter(hex, isBoardRotated, layout);
                const nextPieceType = RECRUITMENT_CYCLE[castle.turns_controlled % RECRUITMENT_CYCLE.length];
                const pieceSize = layout.size_image;
                const iconSize = pieceSize * 0.35; 
                const offsetX = pieceSize * 0.45;  // Middle Right
                const offsetY = 0; // Vertically centered
                
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    {/* Icon background - use contrasting color based on piece color */}
                    <circle
                      cx={center.x + offsetX}
                      cy={center.y + offsetY}
                      r={iconSize * 0.55}
                      fill={castle.owner === 'w' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.85)'}
                      stroke={castle.owner === 'w' ? '#00fbff' : '#8000ff'}
                      strokeWidth={1.5}
                    />
                    {/* Next piece icon */}
                    <image
                      href={getImageByPieceType(nextPieceType, castle.owner)}
                      x={center.x + offsetX - iconSize/2}
                      y={center.y + offsetY - iconSize/2}
                      width={iconSize}
                      height={iconSize}
                      opacity={0.90}
                    />
                    {/* "Next" label - removed to reduce clutter */}
                  </g>
                );
              }
              return null;
            })()}
          </g>
        );
      })}

    </>
  );
});

export default HexGrid;
