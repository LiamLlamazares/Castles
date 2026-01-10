/**
 * @file BoardEditorToolbar.tsx
 * @description Toolbar for the board editor with piece and sanctuary selection.
 */
import React from 'react';
import { PieceType, SanctuaryType, Color, SanctuaryConfig } from '../Constants';
import { getImageByPieceType } from './PieceImages';
import { EditorTool } from './BoardEditor';
import { PieceFactory } from '../Classes/Entities/PieceFactory';
import { Hex } from '../Classes/Entities/Hex';
import { Piece } from '../Classes/Entities/Piece';

interface BoardEditorToolbarProps {
  selectedTool: EditorTool;
  onToolSelect: (tool: EditorTool) => void;
  boardRadius: number;
  onBoardRadiusChange: (radius: number) => void;
  isInitialBoard: boolean;
  showCoordinates: boolean;
  onShowCoordinatesChange: (show: boolean) => void;
  onTooltip: (data: { piece: Piece, position: {x: number, y: number} } | null) => void;
}

// All piece types (excluding special ones that come from sanctuaries for clarity)
const BASIC_PIECE_TYPES: PieceType[] = [
  PieceType.Swordsman,
  PieceType.Archer,
  PieceType.Knight,
  PieceType.Trebuchet,
  PieceType.Eagle,
  PieceType.Giant,
  PieceType.Assassin,
  PieceType.Dragon,
  PieceType.Monarch,
];

const SPECIAL_PIECE_TYPES: PieceType[] = [
  PieceType.Wolf,
  PieceType.Healer,
  PieceType.Ranger,
  PieceType.Wizard,
  PieceType.Necromancer,
  PieceType.Phoenix,
];

const ALL_SANCTUARY_TYPES: SanctuaryType[] = [
  SanctuaryType.WolfCovenant,
  SanctuaryType.SacredSpring,
  SanctuaryType.WardensWatch,
  SanctuaryType.ArcaneRefuge,
  SanctuaryType.ForsakenGrounds,
  SanctuaryType.PyreEternal,
];

// Sanctuary display names - use piece images instead of emoji icons
const SANCTUARY_DISPLAY: Record<SanctuaryType, { name: string }> = {
  [SanctuaryType.WolfCovenant]: { name: 'Wolf' },
  [SanctuaryType.SacredSpring]: { name: 'Healer' },
  [SanctuaryType.WardensWatch]: { name: 'Ranger' },
  [SanctuaryType.ArcaneRefuge]: { name: 'Wizard' },
  [SanctuaryType.ForsakenGrounds]: { name: 'Necro' },
  [SanctuaryType.PyreEternal]: { name: 'Phoenix' },
};

const BoardEditorToolbar: React.FC<BoardEditorToolbarProps> = ({
  selectedTool,
  onToolSelect,
  boardRadius,
  onBoardRadiusChange,
  isInitialBoard,
  showCoordinates,
  onShowCoordinatesChange,
  onTooltip,
}) => {
  const [selectedColor, setSelectedColor] = React.useState<Color>('w');

  const isToolSelected = (tool: EditorTool): boolean => {
    if (!tool || !selectedTool) return false;
    if (tool.type !== selectedTool.type) return false;
    if (tool.type === 'piece' && selectedTool.type === 'piece') {
      return tool.pieceType === selectedTool.pieceType && tool.color === selectedTool.color;
    }
    if (tool.type === 'sanctuary' && selectedTool.type === 'sanctuary') {
      return tool.sanctuaryType === selectedTool.sanctuaryType;
    }
    return tool.type === selectedTool.type;
  };

  const handlePieceClick = (pieceType: PieceType) => {
    const tool: EditorTool = { type: 'piece', pieceType, color: selectedColor };
    if (isToolSelected(tool)) {
      onToolSelect(null);
    } else {
      onToolSelect(tool);
    }
  };

  const handleSanctuaryClick = (sanctuaryType: SanctuaryType) => {
    const tool: EditorTool = { type: 'sanctuary', sanctuaryType };
    if (isToolSelected(tool)) {
      onToolSelect(null);
    } else {
      onToolSelect(tool);
    }
  };

  const handleDeleteClick = () => {
    if (selectedTool?.type === 'delete') {
      onToolSelect(null);
    } else {
      onToolSelect({ type: 'delete' });
    }
  };

  return (
    <div className="editor-toolbar" style={{
      width: '240px',
      background: 'rgba(0,0,0,0.4)',
      borderRight: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      padding: '16px',
    }}>
      {/* Board Size */}
      {!isInitialBoard && (
        <div className="toolbar-section" style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Board Size: {boardRadius}
          </h3>
          <input
            type="range"
            min="4"
            max="12"
            value={boardRadius}
            onChange={(e) => onBoardRadiusChange(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      )}

      {/* Coordinate Toggle */}
      <div className="toolbar-section" style={{ marginBottom: '20px' }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          padding: '10px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          <input
            type="checkbox"
            checked={showCoordinates}
            onChange={(e) => onShowCoordinatesChange(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.9rem' }}>Show Coordinates</span>
        </label>
      </div>

      {/* Color Selector */}
      <div className="toolbar-section" style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Piece Color
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setSelectedColor('w')}
            style={{
              flex: 1,
              padding: '10px',
              background: selectedColor === 'w' ? '#fff' : 'rgba(255,255,255,0.1)',
              color: selectedColor === 'w' ? '#000' : '#fff',
              border: selectedColor === 'w' ? '2px solid #4a90e2' : '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ⬜ White
          </button>
          <button
            onClick={() => setSelectedColor('b')}
            style={{
              flex: 1,
              padding: '10px',
              background: selectedColor === 'b' ? '#333' : 'rgba(0,0,0,0.3)',
              color: '#fff',
              border: selectedColor === 'b' ? '2px solid #4a90e2' : '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ⬛ Black
          </button>
        </div>
      </div>

      {/* Basic Pieces */}
      <div className="toolbar-section" style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Basic Pieces
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {BASIC_PIECE_TYPES.map((pieceType) => {
            const isSelected = selectedTool?.type === 'piece' && 
              selectedTool.pieceType === pieceType && 
              selectedTool.color === selectedColor;
            return (
              <button
                key={pieceType}
                onClick={() => handlePieceClick(pieceType)}
                title={pieceType}
                style={{
                  aspectRatio: '1',
                  padding: '6px',
                  background: isSelected ? 'rgba(74, 144, 226, 0.4)' : 'rgba(255,255,255,0.1)',
                  border: isSelected ? '2px solid #4a90e2' : '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <img
                  src={getImageByPieceType(pieceType, selectedColor)}
                  alt={pieceType}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Special Pieces */}
      <div className="toolbar-section" style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Special Pieces
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {SPECIAL_PIECE_TYPES.map((pieceType) => {
            const isSelected = selectedTool?.type === 'piece' && 
              selectedTool.pieceType === pieceType && 
              selectedTool.color === selectedColor;
            return (
              <button
                key={pieceType}
                onClick={() => handlePieceClick(pieceType)}
                title={pieceType}
                onMouseEnter={() => {
                   const dummy = PieceFactory.create(pieceType, new Hex(0,0,0), selectedColor);
                   onTooltip({ piece: dummy, position: { x: 280, y: 0 } });
                }}
                onMouseLeave={() => onTooltip(null)}
                style={{
                  aspectRatio: '1',
                  padding: '6px',
                  background: isSelected ? 'rgba(74, 144, 226, 0.4)' : 'rgba(255,255,255,0.1)',
                  border: isSelected ? '2px solid #4a90e2' : '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <img
                  src={getImageByPieceType(pieceType, selectedColor)}
                  alt={pieceType}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Sanctuaries/Shrines */}
      <div className="toolbar-section" style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Shrines (Mirrored)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {ALL_SANCTUARY_TYPES.map((sanctuaryType) => {
            const isSelected = selectedTool?.type === 'sanctuary' && 
              selectedTool.sanctuaryType === sanctuaryType;
            const display = SANCTUARY_DISPLAY[sanctuaryType];
            const tier = SanctuaryConfig[sanctuaryType].tier;
            return (
              <button
                key={sanctuaryType}
                onClick={() => handleSanctuaryClick(sanctuaryType)}
                title={`${display.name} Shrine (Tier ${tier})`}
                onMouseEnter={() => {
                   const pieceType = SanctuaryConfig[sanctuaryType].pieceType;
                   const dummy = PieceFactory.create(pieceType, new Hex(0,0,0), 'w');
                   onTooltip({ piece: dummy, position: { x: 280, y: 0 } });
                }}
                onMouseLeave={() => onTooltip(null)}
                style={{
                  padding: '10px 8px',
                  background: isSelected ? 'rgba(74, 144, 226, 0.4)' : 'rgba(255,255,255,0.1)',
                  border: isSelected ? '2px solid #4a90e2' : '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease',
                }}
              >
                <img 
                  src={getImageByPieceType(SanctuaryConfig[sanctuaryType].pieceType, 'w')}
                  alt={display.name}
                  style={{ width: '28px', height: '28px' }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>{display.name}</span>
                <span style={{ 
                  fontSize: '0.7rem', 
                  color: '#ddd',
                  /*background: 'rgba(255,255,255,0.1)',*/
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  Tier {tier}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Delete Mode */}
      <div className="toolbar-section" style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={handleDeleteClick}
          style={{
            width: '100%',
            padding: '14px',
            background: selectedTool?.type === 'delete' ? 'rgba(231, 76, 60, 0.6)' : 'rgba(231, 76, 60, 0.2)',
            border: selectedTool?.type === 'delete' ? '2px solid #e74c3c' : '1px solid rgba(231, 76, 60, 0.5)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>✕</span>
          Delete Mode {selectedTool?.type === 'delete' ? '(Active)' : ''}
        </button>
      </div>
    </div>
  );
};

export default BoardEditorToolbar;
