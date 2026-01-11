import React from "react";
import HexCell from "./HexCell";
import { Hex, Point } from "../Classes/Entities/Hex";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { Board } from "../Classes/Core/Board";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { PieceType, SanctuaryConfig } from "../Constants";
import { getImageByPieceType } from "./PieceImages";
import { getHexVisualClass, getCastleOwnerClass, getSanctuaryVisualClass } from "../utils/HexRenderUtils";

// SVG imports for terrain icons
// SVG imports removed (delegated to HexCell)

interface HexGridProps {
  hexagons: Hex[];
  castles: Castle[];
  sanctuaries: Sanctuary[];
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

// Helper functions removed (delegated to HexCell)



const HexGrid = React.memo(({
  hexagons,
  castles,
  sanctuaries,
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

  // Optimize: Pre-calculate Castle and Sanctuary lookups avoiding O(N*M) inside sort
  // Use Maps for O(1) lookup.
  const { castleMap, sanctuaryMap, castleSet, sanctuarySet } = React.useMemo(() => {
    const cMap = new Map<string, Castle>();
    const sMap = new Map<string, Sanctuary>();
    
    castles.forEach(c => cMap.set(c.hex.getKey(), c));
    sanctuaries.forEach(s => sMap.set(s.hex.getKey(), s));
    
    return {
      castleMap: cMap,
      sanctuaryMap: sMap,
      castleSet: new Set(cMap.keys()),
      sanctuarySet: new Set(sMap.keys())
    };
  }, [castles, sanctuaries]);

  // Sort hexagons by render priority: Standard < Sanctuary < Castle
  const sortedHexagons = React.useMemo(() => {
    return [...hexagons].sort((a, b) => {
      const getPriority = (h: Hex) => {
        const key = h.getKey();
        if (castleSet.has(key)) return 2;
        if (sanctuarySet.has(key)) return 1;
        return 0;
      };
      return getPriority(a) - getPriority(b);
    });
  }, [hexagons, castleSet, sanctuarySet]);

  return (
    <>
      {/* Render all hexagons in sorted order */}
      {sortedHexagons.map((hex: Hex) => {
        const key = hex.getKey();
        const castle = castleMap.get(key);
        const sanctuary = sanctuaryMap.get(key);

        // Compute classes
        const visualClass = getHexVisualClass(hex, board);
        const sanctuaryClass = sanctuary ? getSanctuaryVisualClass(hex, [sanctuary]) : "";
        const adjacencyClass = isAdjacentToControlledCastle(hex) ? "hexagon-castle-adjacent" : "";
        const castleOwnerClass = castle ? getCastleOwnerClass(hex, [castle]) : "";
        const pledgeClass = isPledgeTarget && isPledgeTarget(hex) ? "hexagon-pledge-target" : "";
        const pledgingSourceClass = pledgingSanctuary && hex.equals(pledgingSanctuary) ? "hexagon-pledging-source" : "";
        const combinedClass = `${visualClass} ${sanctuaryClass} ${adjacencyClass} ${castleOwnerClass} ${pledgeClass} ${pledgingSourceClass}`;
        
        // Data prep
        const points = getPolygonPoints(hex, isBoardRotated, layout);
        const center = getHexCenter(hex, isBoardRotated, layout);
        
        return (
          <HexCell
            key={key}
            hex={hex}
            points={points}
            center={center}
            className={combinedClass}
            
            isRiver={board.riverHexSet.has(key)}
            isHighGround={board.highGroundHexSet.has(key)}
            
            isCastle={!!castle}
            castleOwner={castle?.owner || null}
            castleTurnsControlled={castle?.turns_controlled || 0}
            
            sanctuaryType={sanctuary ? sanctuary.type : null}
            
            showCoordinates={showCoordinates}
            showTerrainIcons={showTerrainIcons}
            showSanctuaryIcons={showSanctuaryIcons}
            showCastleRecruitment={showCastleRecruitment}
            
            onClick={onHexClick}
            onRightClick={onHexRightClick}
            onHover={onHexHover}
            
            layoutSize={layout.size_image}
          />
        );
      })}
    </>
  );
});

export default HexGrid;
