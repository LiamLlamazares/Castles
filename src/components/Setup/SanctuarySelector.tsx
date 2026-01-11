/**
 * @file SanctuarySelector.tsx
 * @description Sanctuary selection component for starting and upgrade pool.
 * 
 * Extracted from GameSetup.tsx for better modularity.
 */
import React from 'react';
import { controlGroupStyle, labelStyle } from '../../css/styles';
import { SanctuaryType, SanctuaryConfig } from '../../Constants';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { Hex } from '../../Classes/Entities/Hex';
import { Piece } from '../../Classes/Entities/Piece';

interface SanctuarySelectorProps {
    selectedSanctuaries: Set<SanctuaryType>;
    onToggleSanctuary: (type: SanctuaryType) => void;
    selectedPoolTypes: Set<SanctuaryType>;
    onTogglePoolType: (type: SanctuaryType) => void;
    onHoverSanctuary: (piece: Piece | null) => void;
}

/**
 * Two-section sanctuary selector:
 * 1. Starting Sanctuaries - which types appear on the board at game start
 * 2. Available Upgrades - which types can be evolved into during the game
 */
const SanctuarySelector: React.FC<SanctuarySelectorProps> = ({
    selectedSanctuaries,
    onToggleSanctuary,
    selectedPoolTypes,
    onTogglePoolType,
    onHoverSanctuary
}) => {
    const sanctuaryTypes = Object.keys(SanctuaryConfig) as SanctuaryType[];

    return (
        <>
            {/* Starting Sanctuaries */}
            <div style={{ ...controlGroupStyle, flexDirection: 'column', alignItems: 'stretch' }}>
                <label style={{ ...labelStyle, marginBottom: '8px', alignSelf: 'flex-start' }}>Starting Sanctuaries</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px', width: '100%' }}>
                    {sanctuaryTypes.map((sanctuaryType) => {
                        const config = SanctuaryConfig[sanctuaryType];
                        const isSelected = selectedSanctuaries.has(sanctuaryType);
                        return (
                            <button
                                key={sanctuaryType}
                                onClick={() => onToggleSanctuary(sanctuaryType)}
                                style={{
                                    padding: '8px 4px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    border: isSelected ? '2px solid #fff' : '1px solid #444',
                                    background: isSelected ? config.themeColor : '#444',
                                    color: 'white',
                                    opacity: isSelected ? 1 : 0.7,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s',
                                    height: '60px'
                                }}
                                title={`Tier ${config.tier} - Spawns ${config.pieceType}`}
                                onMouseEnter={() => {
                                    const dummyPiece = PieceFactory.create(config.pieceType, new Hex(0, 0, 0), 'w');
                                    onHoverSanctuary(dummyPiece);
                                }}
                                onMouseLeave={() => onHoverSanctuary(null)}
                            >
                                <span style={{ fontWeight: 'bold' }}>{config.pieceType}</span>
                                <span style={{ fontSize: '0.65rem', opacity: 0.9 }}>Tier {config.tier}</span>
                            </button>
                        );
                    })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '8px', textAlign: 'center' }}>
                    {selectedSanctuaries.size === 0 ? 'Select start sanctuaries' : 
                     `${selectedSanctuaries.size} selected for start`}
                </div>
            </div>

            {/* Pool Availability Selection */}
            <div style={{ ...controlGroupStyle, flexDirection: 'column', alignItems: 'stretch' }}>
                <label style={{ ...labelStyle, marginBottom: '8px', alignSelf: 'flex-start' }}>Available Upgrades</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px', width: '100%' }}>
                    {sanctuaryTypes.map((sanctuaryType) => {
                        const config = SanctuaryConfig[sanctuaryType];
                        const isSelected = selectedPoolTypes.has(sanctuaryType);
                        return (
                            <button
                                key={sanctuaryType}
                                onClick={() => onTogglePoolType(sanctuaryType)}
                                style={{
                                    padding: '8px 4px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    border: isSelected ? '2px solid #fff' : '1px solid #444',
                                    background: isSelected ? '#555' : '#333',
                                    color: isSelected ? 'white' : '#888',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s',
                                    height: '40px'
                                }}
                                title={`Allow evolving into ${config.pieceType}`}
                            >
                                <span style={{ fontWeight: 'bold' }}>{config.pieceType}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
};

export default SanctuarySelector;
