/**
 * PieceRenderer component - renders all game pieces.
 * Extracted from Game.tsx for better separation of concerns.
 */
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

const PieceRenderer: React.FC<PieceRendererProps> = ({
  pieces,
  isBoardRotated,
  onPieceClick,
}) => {
  return (
    <>
      {pieces.map((piece: Piece) => {
        const center = getPieceCenter(piece, isBoardRotated);
        return (
          <image
            key={piece.hex.getKey()}
            href={getImageByPieceType(piece.type, piece.color)}
            x={center.x - 145 / N_SQUARES}
            y={center.y - 145 / N_SQUARES}
            height={275 / N_SQUARES}
            width={275 / N_SQUARES}
            className="piece"
            onClick={() => onPieceClick(piece)}
          />
        );
      })}
    </>
  );
};

export default PieceRenderer;
