/**
 * @file Theme.ts
 * @description Centralized color database and design tokens.
 * 
 * Using this ensures consistency across the UI and Board rendering.
 */

// Colors used for static elements (pieces, special highlights) that don't change with theme
export const Colors = {
    // Brand & Accents
    Primary: '#4a90d9',    // Blue: Selected states, Highlights
    Success: '#27ae60',    // Green: Play button, safe actions
    Warning: '#f39c12',    // Orange: Alerts (unused but reserved)
    Danger: '#e74c3c',     // Red: Errors, attacks
    
    // Castle & Player Colors (Fixed identity colors)
    WhitePlayer: '#00fbff', // Cyan
    BlackPlayer: '#8000ff', // Purple
    SanctuaryGold: 'rgba(255, 215, 0, 0.8)',
    
    // Transparencies for overlays (Fixed)
    OverlayDark: 'rgba(0, 0, 0, 0.6)',
    OverlayLight: 'rgba(255, 255, 255, 0.85)',
    SelectionBackground: 'rgba(74, 144, 217, 0.2)',
};

// Semantic Palette using CSS Variables for Theming
export const Palette = {
    // UI Panels
    PanelBackground: 'var(--panel-bg)',
    SidebarBackground: 'var(--tutorial-sidebar-bg)', // Using existing variable for consistent sidebar
    Border: 'var(--panel-border)',
    BorderLight: 'rgba(255, 255, 255, 0.1)', // Fallback or specific border var if needed
    
    // Text
    TextPrimary: 'var(--panel-text)',
    TextSecondary: 'var(--panel-text-muted)',
    TextMuted: '#888', // Fallback
    TextInverted: Colors.WhitePlayer, 
    
    // Interactive Elements
    ButtonPrimary: 'var(--tutorial-button-active)', // Reusing active button color
    ButtonSelected: 'var(--accent-color)',
    InputBackground: 'var(--button-bg)',
    
    // Board Elements
    CastleWhite: Colors.WhitePlayer,
    CastleBlack: Colors.BlackPlayer,
    Sanctuary: Colors.SanctuaryGold,
};
