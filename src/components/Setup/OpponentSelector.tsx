/**
 * @file OpponentSelector.tsx
 * @description Opponent selection component (Human/AI variants).
 * 
 * Extracted from GameSetup.tsx for better modularity.
 */
import React from 'react';
import { controlGroupStyle, labelStyle } from '../../css/styles';
import { OpponentType } from '../../hooks/useAIOpponent';
import { Color, PieceType, PieceTheme } from '../../Constants';
import { getImageByPieceType } from '../PieceImages';

// Opponent options for card-based selection
const OPPONENT_OPTIONS: { id: OpponentType; name: string; icon: string; description: string }[] = [
    { id: 'human', name: 'Human', icon: '☺', description: 'Local 2-player' },
    { id: 'random-ai', name: 'Random Bot', icon: '⚙', description: 'Easy difficulty' },
    // Future: { id: 'heuristic-ai', name: 'Smart Bot', icon: '☃', description: 'Medium' },
];

interface OpponentSelectorProps {
    opponentType: OpponentType;
    onOpponentChange: (type: OpponentType) => void;
    playerColor: Color;
    onPlayerColorChange: (color: Color) => void;
    pieceTheme: PieceTheme;
}

/**
 * Opponent selection with optional color picker for AI games.
 */
const OpponentSelector: React.FC<OpponentSelectorProps> = ({
    opponentType,
    onOpponentChange,
    playerColor,
    onPlayerColorChange,
    pieceTheme
}) => {
    return (
        <>
            {/* Opponent Selection - Card-based */}
            <div style={controlGroupStyle}>
                <label style={labelStyle}>Opponent</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {OPPONENT_OPTIONS.map(opt => {
                        const isSelected = opponentType === opt.id;
                        return (
                            <button
                                key={opt.id}
                                onClick={() => onOpponentChange(opt.id)}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    border: isSelected ? '2px solid #4a90d9' : '1px solid #555',
                                    background: isSelected ? 'rgba(74, 144, 217, 0.2)' : '#444',
                                    color: isSelected ? '#fff' : '#aaa',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.2s',
                                    minWidth: '80px'
                                }}
                                title={opt.description}
                            >
                                <span style={{ fontSize: '1.3rem' }}>{opt.icon}</span>
                                <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{opt.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Color Selection - Only show when playing vs AI */}
            {opponentType !== 'human' && (
                <div style={{ ...controlGroupStyle, flexDirection: 'column', alignItems: 'stretch' }}>
                    <label style={{ ...labelStyle, marginBottom: '8px' }}>Play as</label>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        {(['w', 'b'] as Color[]).map(color => {
                            const isSelected = playerColor === color;
                            const colorName = color === 'w' ? 'White' : 'Black';
                            return (
                                <button
                                    key={color}
                                    onClick={() => onPlayerColorChange(color)}
                                    style={{
                                        padding: '12px',
                                        cursor: 'pointer',
                                        borderRadius: '8px',
                                        border: isSelected ? '3px solid #4a90d9' : '2px solid #555',
                                        background: isSelected 
                                            ? (color === 'w' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.3)')
                                            : '#333',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.2s',
                                        minWidth: '100px',
                                        opacity: isSelected ? 1 : 0.6,
                                        transform: isSelected ? 'scale(1.05)' : 'scale(1)'
                                    }}
                                    title={`Play as ${colorName}`}
                                >
                                    <img 
                                        src={getImageByPieceType(PieceType.Monarch, color, pieceTheme)}
                                        alt={`${colorName} Monarch`}
                                        style={{ width: '48px', height: '48px' }}
                                    />
                                    <span style={{ 
                                        color: isSelected ? '#fff' : '#888',
                                        fontWeight: isSelected ? 'bold' : 'normal',
                                        fontSize: '0.9rem'
                                    }}>
                                        {colorName}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#888', 
                        textAlign: 'center', 
                        marginTop: '8px' 
                    }}>
                        Bot plays as {playerColor === 'w' ? 'Black' : 'White'}
                    </div>
                </div>
            )}
        </>
    );
};

export default OpponentSelector;
