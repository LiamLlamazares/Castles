/**
 * LegalMoveOverlay component - renders legal move and attack indicators.
 * This component is rendered AFTER pieces in the SVG to ensure dots appear on top.
 */
import React from "react";
import { Hex, Point } from "../Classes/Entities/Hex";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { LEGAL_MOVE_DOT_SCALE_FACTOR } from "../Constants";

interface LegalMoveOverlayProps {
  hexagons: Hex[];
  legalMoveSet: Set<string>;
  legalAttackSet: Set<string>;
  isBoardRotated: boolean;
  onHexClick: (hex: Hex) => void;
  layout: LayoutService;
}

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

const LegalMoveOverlay = React.memo(({
  hexagons,
  legalMoveSet,
  legalAttackSet,
  isBoardRotated,
  onHexClick,
  layout
}: LegalMoveOverlayProps) => {
  return (
    <>
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

export default LegalMoveOverlay;
