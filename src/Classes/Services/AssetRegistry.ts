import { PieceType, Color, PieceTheme } from "../../Constants";

/**
 * Service to handle dynamic asset loading and path generation.
 * Removes the need for manual static imports for every piece.
 */
// Webpack require.context arguments must be literals.
const assetMap: Record<string, string> = {};

const imagesContext = require.context('../../Assets/Images', true, /\.svg$/);

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
     if (process.env.NODE_ENV !== "test") {
       console.warn(`Asset not found for key: "${key}" (Theme: ${theme}, Piece: ${color}${type})`);
     }
     return ""; 
   }
   
   return asset;
};
