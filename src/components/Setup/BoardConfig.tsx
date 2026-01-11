/**
 * @file BoardConfig.tsx
 * @description Board configuration settings (size, random castles, piece theme).
 * 
 * Extracted from GameSetup.tsx for better modularity.
 */
import React from 'react';
import { controlGroupStyle, labelStyle, inputNumberStyle } from '../../css/styles';
import { PieceTheme } from '../../Constants';

// SVG import for rotate icon
import rotateIcon from '../../Assets/Images/Board/rotate.svg';

interface BoardConfigProps {
    boardRadius: number;
    onBoardRadiusChange: (value: number) => void;
    useRandomCastles: boolean;
    onRandomCastlesChange: (value: boolean) => void;
    onReroll: () => void;
    pieceTheme: PieceTheme;
    onPieceThemeChange: (theme: PieceTheme) => void;
    sanctuaryCooldown: number;
    onSanctuaryCooldownChange: (value: number) => void;
}

/**
 * Board configuration controls: size, random castles, piece theme, sanctuary cooldown.
 */
const BoardConfig: React.FC<BoardConfigProps> = ({
    boardRadius,
    onBoardRadiusChange,
    useRandomCastles,
    onRandomCastlesChange,
    onReroll,
    pieceTheme,
    onPieceThemeChange,
    sanctuaryCooldown,
    onSanctuaryCooldownChange
}) => {
    return (
        <>
            {/* Board Size */}
            <div style={controlGroupStyle}>
                <label style={labelStyle}>Board Size: {boardRadius}</label>
                <input 
                    type="range" 
                    min="4" 
                    max="12" 
                    value={boardRadius} 
                    onChange={(e) => onBoardRadiusChange(parseInt(e.target.value))}
                    style={{ width: '150px' }}
                />
            </div>

            {/* Piece Style */}
            <div style={controlGroupStyle}>
                <label style={labelStyle}>Piece Style</label>
                <select
                    value={pieceTheme}
                    onChange={(e) => onPieceThemeChange(e.target.value as PieceTheme)}
                    style={{
                        padding: '8px 12px',
                        fontSize: '1rem',
                        borderRadius: '4px',
                        border: '1px solid #555',
                        background: '#444',
                        color: 'white',
                        cursor: 'pointer'
                    }}
                >
                    <option value="Castles">Castles (Default)</option>
                    <option value="Chess">Chess</option>
                </select>
            </div>

            {/* Castles */}
            <div style={controlGroupStyle}>
                <label style={labelStyle}>Random Castles</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                        type="checkbox" 
                        checked={useRandomCastles}
                        onChange={(e) => onRandomCastlesChange(e.target.checked)}
                        style={{ width: '20px', height: '20px' }}
                    />
                    {useRandomCastles && (
                        <button
                            onClick={onReroll}
                            title="Reroll Map"
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '1.5rem',
                                padding: '0 5px',
                                transition: 'transform 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2) rotate(180deg)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) rotate(0deg)'}
                        >
                            <img src={rotateIcon} alt="Reroll" style={{ width: '24px', height: '24px', filter: 'invert(1)' }} />
                        </button>
                    )}
                </div>
            </div>

            {/* Sanctuary Cooldown */}
            <div style={{ ...controlGroupStyle, alignItems: 'center' }}>
                <label style={labelStyle}>Sanctuary Cooldown</label>
                <input 
                    type="number" 
                    min="1"
                    max="20"
                    value={sanctuaryCooldown} 
                    onChange={(e) => onSanctuaryCooldownChange(Number(e.target.value))}
                    style={inputNumberStyle}
                    title="Cooldown turns after pledging"
                />
            </div>
        </>
    );
};

export default BoardConfig;
