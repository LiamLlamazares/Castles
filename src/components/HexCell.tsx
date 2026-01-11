import React from 'react';
import { Hex, Point } from '../Classes/Entities/Hex';
import { SanctuaryConfig, PieceType, Color, SanctuaryType } from '../Constants';
import { getImageByPieceType } from './PieceImages';

// SVG imports
import riverSvg from "../Assets/Images/Board/river.svg";
import mountainSvg from "../Assets/Images/Board/mountain.svg";
import wcastleSvg from "../Assets/Images/misc/wcastle.svg";
import bcastleSvg from "../Assets/Images/misc/bcastle.svg";

// Recruitment cycle for castle preview
const RECRUITMENT_CYCLE = [
  PieceType.Swordsman,
  PieceType.Archer,
  PieceType.Knight,
  PieceType.Eagle,
  PieceType.Giant,
  PieceType.Trebuchet,
  PieceType.Assassin,
  PieceType.Dragon,
  PieceType.Monarch
];

export interface HexCellProps {
  hex: Hex;
  points: string;
  center: Point;
  className: string;
  
  // Terrain & Features
  isRiver: boolean;
  isHighGround: boolean;
  
  // Castle Data
  isCastle: boolean;
  castleOwner: Color | null;
  castleTurnsControlled: number; // For recruitment cycle
  
  // Sanctuary Data
  sanctuaryType: SanctuaryType | null;
  
  // Config / Toggles
  showCoordinates: boolean;
  showTerrainIcons: boolean;
  showSanctuaryIcons: boolean;
  showCastleRecruitment: boolean;
  
  // Event Handlers
  onClick: (hex: Hex) => void;
  onRightClick?: (hex: Hex) => void;
  onHover?: (hex: Hex | null, event?: React.MouseEvent) => void;
  
  layoutSize: number; // For scaling icons
}

const HexCell = React.memo(({
  hex,
  points,
  center,
  className,
  isRiver,
  isHighGround,
  isCastle,
  castleOwner,
  castleTurnsControlled,
  sanctuaryType,
  showCoordinates,
  showTerrainIcons,
  showSanctuaryIcons,
  showCastleRecruitment,
  onClick,
  onRightClick,
  onHover,
  layoutSize
}: HexCellProps) => {

  // Event Wrappers
  const handleContextMenu = (e: React.MouseEvent) => {
    if (onRightClick) {
      e.preventDefault();
      onRightClick(hex);
    }
  };
  
  const handleMouseEnter = (e: React.MouseEvent) => {
    if (onHover) onHover(hex, e);
  };
  
  const handleMouseLeave = () => {
    if (onHover) onHover(null);
  };
  
  // Render Helpers
  const renderCoordinate = () => {
     if (!showCoordinates) return null;
     return (
       <text
         x={center.x}
         y={center.y + 5}
         textAnchor="middle"
         style={{ fontSize: "15px", fill: "black", pointerEvents: "none" }}
       >
         {`${hex.q}, ${hex.r}`}
       </text>
     );
  };

  const renderTerrainIcons = () => {
      const iconSize = layoutSize * 0.35;
      const offsetX = iconSize * 1.1;
      const offsetY = 0;
      
      if (isRiver && showTerrainIcons) {
          return (
             <image
                href={riverSvg}
                x={center.x + offsetX - iconSize/2}
                y={center.y + offsetY - iconSize/2}
                width={iconSize}
                height={iconSize}
                style={{ pointerEvents: 'none' }}
             />
          );
      }
      
      if (isHighGround && !isCastle && showTerrainIcons) {
          return (
             <image
                href={mountainSvg}
                x={center.x + offsetX - iconSize/2}
                y={center.y + offsetY - iconSize/2}
                width={iconSize}
                height={iconSize}
                style={{ pointerEvents: 'none' }}
             />
          );
      }
      
      if (sanctuaryType && showSanctuaryIcons) {
          const pieceType = SanctuaryConfig[sanctuaryType].pieceType;
           return (
              <g style={{ pointerEvents: 'none' }}>
                <circle
                  cx={center.x + offsetX}
                  cy={center.y + offsetY}
                  r={iconSize * 0.55}
                  fill="rgba(0, 0, 0, 0.6)"
                  stroke="rgba(255, 215, 0, 0.8)"
                  strokeWidth={1.5}
                />
                <image
                  href={getImageByPieceType(pieceType, 'w')}
                  x={center.x + offsetX - iconSize/2}
                  y={center.y + offsetY - iconSize/2}
                  width={iconSize}
                  height={iconSize}
                  opacity={0.95}
                />
              </g>
            );
      }
      return null;
  };
  
  const renderCastleRecruitment = () => {
      if (!isCastle || !showCastleRecruitment || !castleOwner) return null;
      
      const nextPieceType = RECRUITMENT_CYCLE[castleTurnsControlled % RECRUITMENT_CYCLE.length];
      const pieceSize = layoutSize; 
      
      const iconSize = pieceSize * 0.35; 
      const leftOffsetX = -pieceSize * 0.45;  
      const rightOffsetX = pieceSize * 0.45;  
      const offsetY = 0; 
      
      return (
          <g style={{ pointerEvents: 'none' }}>
            {/* Piece icon on LEFT */}
            <circle
              cx={center.x + leftOffsetX}
              cy={center.y + offsetY}
              r={iconSize * 0.55}
              fill={castleOwner === 'w' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.85)'}
              stroke={castleOwner === 'w' ? '#00fbff' : '#8000ff'}
              strokeWidth={1.5}
            />
            <image
              href={getImageByPieceType(nextPieceType, castleOwner)}
              x={center.x + leftOffsetX - iconSize/2}
              y={center.y + offsetY - iconSize/2}
              width={iconSize}
              height={iconSize}
              opacity={0.90}
            />
            {/* Castle icon on RIGHT */}
            <circle
              cx={center.x + rightOffsetX}
              cy={center.y + offsetY}
              r={iconSize * 0.55}
              fill={'rgba(255, 255, 255, 0.9)'}
              stroke={castleOwner === 'w' ? '#00fbff' : '#8000ff'}
              strokeWidth={1.5}
            />
            <image
              href={castleOwner === 'w' ? wcastleSvg : bcastleSvg}
              x={center.x + rightOffsetX - iconSize/2}
              y={center.y + offsetY - iconSize/2}
              width={iconSize}
              height={iconSize}
              opacity={0.90}
            />
          </g>
      );
  };

  return (
    <g>
      <polygon
        points={points}
        className={className}
        onClick={() => onClick(hex)}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        filter={
          className.includes("hexagon-high-ground")
            ? "url(#shadow)"
            : ""
        }
      />
      {renderCoordinate()}
      {renderTerrainIcons()}
      {renderCastleRecruitment()}
    </g>
  );
});

export default HexCell;
