/**
 * @file Theme.ts
 * @description Centralized color database and design tokens.
 * 
 * Using this ensures consistency across the UI and Board rendering.
 */

export const Colors = {
    // Brand & Accents
    Primary: '#4a90d9',    // Blue: Selected states, Highlights
    Success: '#27ae60',    // Green: Play button, safe actions
    Warning: '#f39c12',    // Orange: Alerts (unused but reserved)
    Danger: '#e74c3c',     // Red: Errors, attacks
    
    // Castle & Player Colors
    WhitePlayer: '#00fbff', // Cyan
    BlackPlayer: '#8000ff', // Purple
    SanctuaryGold: 'rgba(255, 215, 0, 0.8)',
    
    // Grayscale / UI Backgrounds
    Gray50: '#ffffff',
    Gray100: '#eee',
    Gray200: '#ddd',
    Gray300: '#ccc',
    Gray400: '#aaa',
    Gray500: '#888',
    Gray600: '#555',
    Gray700: '#444',
    Gray800: '#333',
    Gray900: '#222',
    Black: '#000000',

    // Transparencies
    OverlayDark: 'rgba(0, 0, 0, 0.6)',
    OverlayLight: 'rgba(255, 255, 255, 0.85)',
    SelectionBackground: 'rgba(74, 144, 217, 0.2)',
};

export const Palette = {
    // UI Panels
    PanelBackground: Colors.Gray800,
    SidebarBackground: Colors.Gray900,
    Border: Colors.Gray600,
    BorderLight: Colors.Gray700,
    
    // Text
    TextPrimary: Colors.Gray100,
    TextSecondary: Colors.Gray200,
    TextMuted: Colors.Gray400,
    TextInverted: Colors.WhitePlayer, // For dark backgrounds if needed
    
    // Interactive Elements
    ButtonPrimary: Colors.Success,
    ButtonSelected: Colors.Primary,
    InputBackground: Colors.Gray700,
    
    // Board Elements
    CastleWhite: Colors.WhitePlayer,
    CastleBlack: Colors.BlackPlayer,
    Sanctuary: Colors.SanctuaryGold,
};
