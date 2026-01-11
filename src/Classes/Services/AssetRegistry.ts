import { PieceType, Color, PieceTheme } from "../../Constants";

/**
 * Service to handle dynamic asset loading and path generation.
 * Removes the need for manual static imports for every piece.
 */
export class AssetRegistry {
  /**
   * Generates the path for a piece asset based on theme, type, and color.
   * 
   * Convention:
   * - Files are located in `src/Assets/Images/<Theme>/`
   * - Filenames follow pattern: `<color><Type>.svg` (e.g., `wArcher.svg`)
   * 
   * @param type - The piece type (e.g., "Archer")
   * @param color - The piece color ('w' or 'b')
   * @param theme - The theme folder name (default: "Castles")
   */
  public static getPieceImagePath(
    type: PieceType, 
    color: Color, 
    theme: PieceTheme
  ): string {
    // Note: In Vite/Webpack, dynamic requires often need a context. 
    // However, since we are moving towards standard URLs or relying on the bundler's static asset handling,
    // we might need to use `new URL` or a glob import if we want to ensure files exist.
    // purely standard path construction for now.
    
    // Using global glob import pattern to register all images
    // This part relies on Vite's import.meta.glob feature which is standard in this project stack.
    const path = `../../Assets/Images/${theme}/${color}${type}.svg`;
    return path;
  }
}

// Glob import for all SVG assets in Assets/Images
// This creates a map of all available assets at build time.
const modules = import.meta.glob('../../Assets/Images/**/*.svg', { as: 'url', eager: true });

/**
 * Registry to look up resolved asset URLs.
 */
export const getAssetUrl = (theme: PieceTheme, color: Color, type: PieceType): string => {
   // Construct the lookup key matching the glob pattern
   // Example: "../../Assets/Images/Castles/wArcher.svg"
   const key = `../../Assets/Images/${theme}/${color}${type}.svg`;
   
   const asset = modules[key];
   
   if (!asset) {
     console.warn(`Asset not found: ${key}. Fallback to placeholder or default.`);
     return ""; // Or some placeholder
   }
   
   return asset;
};
