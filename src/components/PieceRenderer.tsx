/**
 * PieceRenderer component - renders all game pieces.
 * Extracted from Game.tsx for better separation of concerns.
 */
import React from "react";
import { Piece } from "../Classes/Entities/Piece";
import { Point } from "../Classes/Entities/Hex";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { Board } from "../Classes/Core/Board";  
import { RuleEngine } from "../Classes/Systems/RuleEngine";
import { createPieceMap } from "../utils/PieceMap";
import { getImageByPieceType } from "./PieceImages";
import { PieceTheme } from "../Constants";
import PieceItem from "./PieceItem";

// SVG import for shield icon
import shieldSvg from "../Assets/Images/Board/shield.svg";

interface PieceRendererProps {
  pieces: Piece[];
  isBoardRotated: boolean;
  onPieceClick: (piece: Piece) => void;
  onPieceRightClick?: (piece: Piece | null) => void;
  resizeVersion: number;
  layout: LayoutService;
  /** When true, clicks pass through pieces to hexes below (for board editor placement mode) */
  editorPlacementMode?: boolean;
  /** Board reference for defense checking */
  board?: Board;
  showShields?: boolean;
  /** Piece theme for image selection */
  pieceTheme?: PieceTheme;
}

/** Get the pixel center of a piece */
const getPieceCenter = (piece: Piece, isBoardRotated: boolean, layout: LayoutService): Point => {
  return layout.hexCenters[piece.hex.getKey(isBoardRotated)];
};

const PieceRenderer = React.memo(({
  pieces,
  isBoardRotated,
  onPieceClick,
  onPieceRightClick,
  layout,
  editorPlacementMode = false,
  board,
  showShields = true,
  pieceTheme = "Castles"
}: PieceRendererProps) => {
  const pieceSize = layout.size_image;

  // Pre-calculate defended hexes for all players in one pass
  const defendedHexSet = React.useMemo(() => {
    if (!board) return new Set<string>();
    
    // Get defended hexes for both white and black
    // Note: RuleEngine.getDefendedHexes returns hexes that are PROTECTED by friendly melee pieces
    const whiteDefended = RuleEngine.getDefendedHexes({ pieces } as any, 'b', board); // Defended FROM black = white's defended hexes
    const blackDefended = RuleEngine.getDefendedHexes({ pieces } as any, 'w', board); // Defended FROM white = black's defended hexes
    
    return new Set([
      ...whiteDefended.map(h => h.getKey()),
      ...blackDefended.map(h => h.getKey())
    ]);
  }, [pieces, board]);

  // Sort pieces by Y-coordinate for correct rendering order
  const sortedPieces = React.useMemo(() => {
    return [...pieces].sort((a, b) => {
      const ca = getPieceCenter(a, isBoardRotated, layout);
      const cb = getPieceCenter(b, isBoardRotated, layout);
      return ca.y - cb.y;
    });
  }, [pieces, isBoardRotated, layout]);

  return (
    <>
      {sortedPieces.map((piece: Piece) => {
        const center = getPieceCenter(piece, isBoardRotated, layout);
        const isDefended = defendedHexSet.has(piece.hex.getKey());
        
        return (
          <PieceItem
            key={piece.hex.getKey()} // Stable key based on position
            piece={piece}
            center={center}
            pieceSize={pieceSize}
            isDefended={isDefended}
            showShields={showShields}
            pieceTheme={pieceTheme}
            onClick={onPieceClick}
            onRightClick={onPieceRightClick}
            editorPlacementMode={editorPlacementMode}
          />
        );
      })}
    </>
  );
});

export default PieceRenderer;
