import { PieceType, Color, PieceTheme } from "../../Constants";

/**
 * Service to handle dynamic asset loading and path generation.
 * Removes the need for manual static imports for every piece.
 */
export class AssetRegistry {
  // We don't need static methods if we export the helper function below
}

// Webpack require.context to load all SVG files from Assets/Images
// The arguments must be literals!
// Context covers all subdirectories (true) and matches .svg files
const imagesContext = require.context('../../Assets/Images', true, /\.svg$/);

const assetMap: Record<string, string> = {};

imagesContext.keys().forEach((key: string) => {
  // key is something like "./Castles/wArcher.svg" or "./Chess/bKing.svg"
  // The value returned by imagesContext(key) is the resolved URL/path (thanks to file-loader in CRA)
  assetMap[key] = imagesContext(key) as string;
});

/**
 * Registry to look up resolved asset URLs.
 */
export const getAssetUrl = (theme: PieceTheme, color: Color, type: PieceType): string => {
   // Construct the lookup key matching the require.context format
   // Current format uses local paths: "./<Theme>/<color><Type>.svg"
   const key = `./${theme}/${color}${type}.svg`;
   
   const asset = assetMap[key];
   
   if (!asset) {
     console.warn(`Asset not found for key: "${key}" (Theme: ${theme}, Piece: ${color}${type})`);
     console.log('Available keys:', Object.keys(assetMap)); // Debug helper
     return ""; 
   }
   
   return asset;
};
