/**
 * Piece image mappings for the game UI.
 * Supports multiple piece themes (Chess, Castles, etc.)
 */
import { PieceType, Color, PieceTheme } from "../Constants";
import { getAssetUrl } from "../Classes/Services/AssetRegistry";

/** Default theme used when none specified */
export const DEFAULT_PIECE_THEME: PieceTheme = "Castles";

/**
 * Returns the appropriate image URL for a given piece type, color, and theme.
 * @param type - The piece type (Swordsman, Dragon, etc.)
 * @param color - The piece color ('w' or 'b')
 * @param theme - The piece theme (Chess, Castles, etc.). Defaults to DEFAULT_PIECE_THEME.
 */
export const getImageByPieceType = (
  type: PieceType,
  color: Color,
  theme: PieceTheme = DEFAULT_PIECE_THEME
): string => {
  return getAssetUrl(theme, color, type);
};
