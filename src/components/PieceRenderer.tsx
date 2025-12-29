/**
 * PieceRenderer component - renders all game pieces.
 * Extracted from Game.tsx for better separation of concerns.
 */
import React from "react";
import { Piece } from "../Classes/Entities/Piece";
import { Point } from "../Classes/Entities/Hex";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { getImageByPieceType } from "./PieceImages";

interface PieceRendererProps {
  pieces: Piece[];
  isBoardRotated: boolean;
  onPieceClick: (piece: Piece) => void;
  onPieceRightClick?: (piece: Piece | null) => void;
  resizeVersion: number;
  layout: LayoutService;
  /** When true, clicks pass through pieces to hexes below (for board editor placement mode) */
  editorPlacementMode?: boolean;
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
  editorPlacementMode = false
}: PieceRendererProps) => {
  const pieceSize = layout.size_image;
  return (
    <>
      {pieces.map((piece: Piece) => {
        const center = getPieceCenter(piece, isBoardRotated, layout);
        return (
          <image
            key={piece.hex.getKey()}
            href={getImageByPieceType(piece.type, piece.color)}
            x={center.x - pieceSize / 2}
            y={center.y - pieceSize / 2}
            height={pieceSize}
            width={pieceSize}
            className="piece"
            style={{ pointerEvents: editorPlacementMode ? 'none' : 'auto' }}
            onClick={() => onPieceClick(piece)}
            onContextMenu={(e) => {
              if (onPieceRightClick) {
                e.preventDefault();
                onPieceRightClick(piece);
              }
            }}
          />
        );
      })}
    </>
  );
});

export default PieceRenderer;
