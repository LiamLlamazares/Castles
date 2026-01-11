/**
 * @file TimeControls.tsx
 * @description Time control settings component.
 * 
 * Extracted from GameSetup.tsx for better modularity.
 */
import React from 'react';
import { controlGroupStyle, labelStyle, inputNumberStyle } from '../../css/styles';

interface TimeControlsProps {
    timeInitial: number;
    timeIncrement: number;
    onTimeInitialChange: (value: number) => void;
    onTimeIncrementChange: (value: number) => void;
}

/**
 * Time control inputs for initial time and increment.
 */
const TimeControls: React.FC<TimeControlsProps> = ({
    timeInitial,
    timeIncrement,
    onTimeInitialChange,
    onTimeIncrementChange
}) => {
    return (
        <div style={controlGroupStyle}>
            <label style={labelStyle}>Time Control</label>
            <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '2px' }}>Minutes</span>
                    <input 
                        type="number" 
                        value={timeInitial} 
                        onChange={(e) => onTimeInitialChange(Number(e.target.value))}
                        style={{...inputNumberStyle, width: '50px'}}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '2px' }}>Increment</span>
                    <input 
                        type="number" 
                        value={timeIncrement} 
                        onChange={(e) => onTimeIncrementChange(Number(e.target.value))}
                        style={{...inputNumberStyle, width: '50px'}}
                    />
                </div>
            </div>
        </div>
    );
};

export default TimeControls;
