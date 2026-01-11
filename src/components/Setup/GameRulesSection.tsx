/**
 * @file GameRulesSection.tsx
 * @description Experimental game rules section (VP Mode, etc.).
 * 
 * Extracted from GameSetup.tsx for better modularity.
 */
import React from 'react';
import { experimentalSectionStyle, labelStyle } from '../../css/styles';

// SVG import for trophy icon
import trophyIcon from '../../Assets/Images/misc/trophy.svg';

interface GameRulesSectionProps {
    vpModeEnabled: boolean;
    onVpModeChange: (enabled: boolean) => void;
}

/**
 * Experimental game rules section with special mode toggles.
 */
const GameRulesSection: React.FC<GameRulesSectionProps> = ({
    vpModeEnabled,
    onVpModeChange
}) => {
    return (
        <div style={experimentalSectionStyle}>
            <label style={{ 
                ...labelStyle, 
                marginBottom: '10px', 
                color: '#667eea',
                fontSize: '0.9rem'
            }}>
                Game Rules (Experimental)
            </label>
            
            {/* VP Mode Toggle */}
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                marginBottom: '8px'
            }}>
                <input 
                    type="checkbox" 
                    id="vpMode"
                    checked={vpModeEnabled}
                    onChange={(e) => onVpModeChange(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="vpMode" style={{ 
                    fontSize: '0.85rem', 
                    cursor: 'pointer',
                    color: vpModeEnabled ? '#27ae60' : '#aaa'
                }}>
                    <img src={trophyIcon} alt="" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginRight: '6px', filter: 'invert(1)' }} />Victory Points Mode
                </label>
            </div>
            {vpModeEnabled && (
                <div style={{ 
                    fontSize: '0.7rem', 
                    color: '#888', 
                    marginLeft: '28px',
                    marginBottom: '8px'
                }}>
                    4 castles = +1 VP/round, 5 castles = +3 VP/round. First to 10 VP wins!
                </div>
            )}   
        </div>
    );
};

export default GameRulesSection;
