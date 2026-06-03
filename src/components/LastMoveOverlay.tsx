import React from "react";
import { Hex, Point } from "../Classes/Entities/Hex";
import { LayoutService } from "../Classes/Systems/LayoutService";
import type { MoveHighlightHexes } from "../utils/MoveHighlightUtils";

interface LastMoveOverlayProps {
  highlight: MoveHighlightHexes | null;
  isBoardRotated: boolean;
  layout: LayoutService;
}

function getPolygonPoints(hex: Hex, isBoardRotated: boolean, layout: LayoutService): string {
  return layout.hexCornerString[hex.reflect().getKey(!isBoardRotated)];
}

function getHexCenter(hex: Hex, isBoardRotated: boolean, layout: LayoutService): Point {
  return layout.layout.hexToPixelReflected(hex, isBoardRotated);
}

const LastMoveOverlay = React.memo(({ highlight, isBoardRotated, layout }: LastMoveOverlayProps) => {
  if (!highlight) return null;

  const fromKey = highlight.from?.getKey() ?? null;
  const toKey = highlight.to?.getKey() ?? null;
  const shouldDrawLine = !!highlight.from && !!highlight.to && fromKey !== toKey;
  const fromCenter = highlight.from ? getHexCenter(highlight.from, isBoardRotated, layout) : null;
  const toCenter = highlight.to ? getHexCenter(highlight.to, isBoardRotated, layout) : null;

  return (
    <g
      className="last-move-overlay"
      data-move-notation={highlight.notation}
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    >
      {shouldDrawLine && fromCenter && toCenter && (
        <line
          className="last-move-link"
          x1={fromCenter.x}
          y1={fromCenter.y}
          x2={toCenter.x}
          y2={toCenter.y}
        />
      )}
      {highlight.from && fromKey !== toKey && (
        <polygon
          className="last-move-highlight last-move-highlight-from"
          points={getPolygonPoints(highlight.from, isBoardRotated, layout)}
          data-hex-key={fromKey ?? undefined}
        />
      )}
      {highlight.to && (
        <polygon
          className="last-move-highlight last-move-highlight-to"
          points={getPolygonPoints(highlight.to, isBoardRotated, layout)}
          data-hex-key={toKey ?? undefined}
        />
      )}
    </g>
  );
});

export default LastMoveOverlay;
