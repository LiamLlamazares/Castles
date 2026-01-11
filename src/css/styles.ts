/**
 * @file styles.ts
 * @description Shared style constants for React components.
 * 
 * Extracted from GameSetup.tsx for reuse across the application.
 * All styles use React.CSSProperties for type safety.
 */
import React from 'react';
import { Palette, Colors } from '../Theme';

// ============================================================================
// LAYOUT & CONTAINERS
// ============================================================================

/**
 * Standard control group wrapper style.
 * Used for form inputs with labels in sidebars.
 */
export const controlGroupStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: Palette.PanelBackground,
    padding: '12px',
    borderRadius: '8px',
    width: '100%',
    boxSizing: 'border-box'
};

/**
 * Vertical control group variant.
 * Used when controls need to stack.
 */
export const controlGroupVerticalStyle: React.CSSProperties = {
    ...controlGroupStyle,
    flexDirection: 'column',
    alignItems: 'stretch',
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================

/**
 * Standard label style for form controls.
 */
export const labelStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: Palette.TextSecondary
};

/**
 * Small label variant for secondary text.
 */
export const labelSmallStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: Palette.TextMuted,
};

// ============================================================================
// INPUTS
// ============================================================================

/**
 * Standard number input style.
 */
export const inputNumberStyle: React.CSSProperties = {
    width: '60px',
    padding: '5px',
    fontSize: '1rem',
    borderRadius: '4px',
    border: `1px solid ${Palette.Border}`,
    background: Palette.InputBackground,
    color: 'white'
};

/**
 * Standard select dropdown style.
 */
export const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '1rem',
    borderRadius: '4px',
    border: `1px solid ${Palette.Border}`,
    background: Palette.InputBackground,
    color: 'white',
    cursor: 'pointer'
};

// ============================================================================
// BUTTONS
// ============================================================================

/**
 * Primary action button style (green).
 */
export const primaryButtonStyle: React.CSSProperties = {
    padding: '15px',
    fontSize: '1.2rem',
    cursor: 'pointer',
    borderRadius: '8px',
    border: 'none',
    background: Palette.ButtonPrimary,
    color: 'white',
    fontWeight: 'bold',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    width: '100%',
};

/**
 * Mode selector button base style.
 */
export const modeButtonStyle = (isSelected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 8px',
    fontSize: '0.85rem',
    cursor: 'pointer',
    borderRadius: '6px',
    border: isSelected ? '2px solid #fff' : `1px solid ${Palette.Border}`,
    background: isSelected ? Palette.ButtonSelected : Palette.InputBackground,
    color: 'white',
    fontWeight: isSelected ? 'bold' : 'normal',
    textTransform: 'capitalize',
    transition: 'all 0.2s'
});

/**
 * Card-style button for selections (e.g., opponent, sanctuary).
 */
export const cardButtonStyle = (isSelected: boolean, color?: string): React.CSSProperties => ({
    padding: '8px 4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    borderRadius: '4px',
    border: isSelected ? '2px solid #fff' : `1px solid ${Palette.BorderLight}`,
    background: isSelected ? (color || Palette.ButtonSelected) : Palette.InputBackground,
    color: 'white',
    opacity: isSelected ? 1 : 0.7,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
});

// ============================================================================
// PANELS & SECTIONS
// ============================================================================

/**
 * Sidebar panel style.
 */
export const sidebarStyle: React.CSSProperties = {
    width: '380px',
    height: '100%',
    padding: '20px',
    background: Palette.SidebarBackground,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    overflowY: 'auto',
    borderRight: `1px solid ${Palette.BorderLight}`,
    boxSizing: 'border-box',
    flexShrink: 0
};

/**
 * Experimental/special section highlight style.
 */
export const experimentalSectionStyle: React.CSSProperties = {
    ...controlGroupStyle,
    flexDirection: 'column',
    alignItems: 'stretch',
    background: 'rgba(102, 126, 234, 0.1)',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid rgba(102, 126, 234, 0.3)'
};
