/**
 * PieceRenderer component - renders all game pieces.
 * Extracted from Game.tsx for better separation of concerns.
 */
import React from "react";
import { Piece } from "../Classes/Piece";
import { Point } from "../Classes/Hex";
import { N_SQUARES, PIECE_IMAGE_SIZE, PIECE_IMAGE_OFFSET } from "../Constants";
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
  return (
    <>
      {pieces.map((piece: Piece) => {
        const center = getPieceCenter(piece, isBoardRotated);
        return (
          <image
            key={piece.hex.getKey()}
            href={getImageByPieceType(piece.type, piece.color)}
            x={center.x - PIECE_IMAGE_OFFSET / N_SQUARES}
            y={center.y - PIECE_IMAGE_OFFSET / N_SQUARES}
            height={PIECE_IMAGE_SIZE / N_SQUARES}
            width={PIECE_IMAGE_SIZE / N_SQUARES}
            className="piece"
            onClick={() => onPieceClick(piece)}
          />
        );
      })}
    </>
  );
});

export default PieceRenderer;
