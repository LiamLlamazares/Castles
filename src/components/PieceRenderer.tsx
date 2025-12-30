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
  board
}: PieceRendererProps) => {
  const pieceSize = layout.size_image;
  const pieceMap = createPieceMap(pieces);

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
        
        // Check if this piece is defended (adjacent to friendly melee)
        const isDefended = board ? RuleEngine.isHexDefended(
          piece.hex,
          piece.color === 'w' ? 'b' : 'w',  // enemy color
          { pieces, pieceMap } as any,
          board
        ) : false;
        
        return (
          <g key={piece.hex.getKey()}>
            {/* Piece image */}
            <image
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
            
            {/* Shield icon overlay for defended pieces - Top-Right corner (less intrusive) */}
            {isDefended && (
              <g style={{ pointerEvents: 'none' }}>
                {/* Shield background - smaller */}
                <circle
                  cx={center.x - pieceSize * 0.275}
                  cy={center.y - pieceSize * 0.35}
                  r={pieceSize * 0.12}
                  fill="rgba(255, 215, 0, 0.90)"
                  stroke="rgba(0, 0, 0, 0.7)"
                  strokeWidth={1.0}
                />
                {/* Shield symbol - smaller */}
                <text
                  x={center.x - pieceSize * 0.275}
                  y={center.y - pieceSize * 0.35 + 1}
                  fontSize={pieceSize * 0.14}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#000"
                  fontWeight="bold"
                >
                  🛡️
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
});

export default PieceRenderer;
