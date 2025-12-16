/**
 * PieceRenderer component - renders all game pieces.
 * Extracted from Game.tsx for better separation of concerns.
 */
import React from "react";
import { Piece } from "../Classes/Piece";
import { Point } from "../Classes/Hex";
import { N_SQUARES } from "../Constants";
import { startingBoard } from "../ConstantImports";
import { getImageByPieceType } from "./PieceImages";

interface PieceRendererProps {
  pieces: Piece[];
  isBoardRotated: boolean;
  onPieceClick: (piece: Piece) => void;
}

/** Get the pixel center of a piece */
const getPieceCenter = (piece: Piece, isBoardRotated: boolean): Point => {
  return startingBoard.hexCenters[piece.hex.getKey(isBoardRotated)];
};

const PieceRenderer = React.memo(({
  pieces,
  isBoardRotated,
  onPieceClick,
}: PieceRendererProps) => {
  const pieceSize = startingBoard.size_image;
  return (
    <>
      {pieces.map((piece: Piece) => {
        const center = getPieceCenter(piece, isBoardRotated);
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
