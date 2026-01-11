import React from "react";
import { Piece } from "../Classes/Entities/Piece";
import { Point } from "../Classes/Entities/Hex";
import { getImageByPieceType } from "./PieceImages";
import { PieceTheme } from "../Constants";
import shieldSvg from "../Assets/Images/Board/shield.svg";

interface PieceItemProps {
  piece: Piece;
  center: Point;
  pieceSize: number;
  isDefended: boolean;
  showShields: boolean;
  pieceTheme: PieceTheme;
  onClick: (piece: Piece) => void;
  onRightClick?: (piece: Piece) => void;
  editorPlacementMode: boolean;
}

const PieceItem = React.memo(({
  piece,
  center,
  pieceSize,
  isDefended,
  showShields,
  pieceTheme,
  onClick,
  onRightClick,
  editorPlacementMode
}: PieceItemProps) => {
  return (
    <g>
      <image
        href={getImageByPieceType(piece.type, piece.color, pieceTheme)}
        x={center.x - pieceSize / 2}
        y={center.y - pieceSize / 2}
        height={pieceSize}
        width={pieceSize}
        className="piece"
        style={{ pointerEvents: editorPlacementMode ? 'none' : 'auto' }}
        onClick={() => onClick(piece)}
        onContextMenu={(e) => {
          if (onRightClick) {
            e.preventDefault();
            onRightClick(piece);
          }
        }}
      />
      
      {showShields && isDefended && (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={center.x - pieceSize * 0.45}
            cy={center.y}
            r={pieceSize * 0.15}
            fill="rgba(255, 215, 0, 0.90)"
            stroke="rgba(0, 0, 0, 0.7)"
            strokeWidth={1.0}
          />
          <image
            href={shieldSvg}
            x={center.x - pieceSize * 0.45 - pieceSize * 0.08}
            y={center.y - pieceSize * 0.08}
            width={pieceSize * 0.16}
            height={pieceSize * 0.16}
          />
        </g>
      )}
    </g>
  );
});

export default PieceItem;
