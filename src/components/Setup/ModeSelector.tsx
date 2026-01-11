/**
 * @file ModeSelector.tsx
 * @description Game mode selection component (Quick/Standard/Full).
 * 
 * Extracted from GameSetup.tsx for better modularity.
 */
import React from 'react';

export type GameMode = 'quick' | 'standard' | 'full';

interface ModeSelectorProps {
    selectedMode: GameMode;
    onModeChange: (mode: GameMode) => void;
}

/**
 * Mode selector buttons for choosing game preset.
 */
const ModeSelector: React.FC<ModeSelectorProps> = ({ selectedMode, onModeChange }) => {
    const modes: GameMode[] = ['quick', 'standard', 'full'];
    
    return (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {modes.map((mode) => (
                <button
                    key={mode}
                    onClick={() => onModeChange(mode)}
                    style={{
                        flex: 1,
                        padding: '10px 8px',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        border: selectedMode === mode ? '2px solid #fff' : '1px solid #555',
                        background: selectedMode === mode ? '#4a90d9' : '#444',
                        color: 'white',
                        fontWeight: selectedMode === mode ? 'bold' : 'normal',
                        textTransform: 'capitalize',
                        transition: 'all 0.2s'
                    }}
                >
                    {mode}
                </button>
            ))}
        </div>
    );
};

export default ModeSelector;
