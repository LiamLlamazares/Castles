/**
 * PieceRenderer component - renders all game pieces.
 * Extracted from Game.tsx for better separation of concerns.
 */
import React from "react";
import { Piece } from "../Classes/Entities/Piece";
import { Point } from "../Classes/Entities/Hex";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { N_SQUARES } from "../Constants";
import { startingBoard, startingLayout } from "../ConstantImports";
import { getImageByPieceType } from "./PieceImages";

interface PieceRendererProps {
  pieces: Piece[];
  isBoardRotated: boolean;
  onPieceClick: (piece: Piece) => void;
  resizeVersion: number;
  layout: LayoutService;
}

/** Get the pixel center of a piece */
const getPieceCenter = (piece: Piece, isBoardRotated: boolean, layout: LayoutService): Point => {
  return layout.hexCenters[piece.hex.getKey(isBoardRotated)];
};

const PieceRenderer = React.memo(({
  pieces,
  isBoardRotated,
  onPieceClick,
  layout
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
            onClick={() => onPieceClick(piece)}
          />
        );
      })}
    </>
  );
});

export default PieceRenderer;
