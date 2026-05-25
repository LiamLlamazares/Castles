import { PieceType, Color, PieceTheme } from "../../Constants";

/**
 * Service to handle dynamic asset loading and path generation.
 * Removes the need for manual static imports for every piece.
 */
const assetMap: Record<string, string> = {};

const imageModules = import.meta.glob("../../Assets/Images/**/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

Object.entries(imageModules).forEach(([path, url]) => {
  const marker = "/Assets/Images/";
  const markerIndex = path.replace(/\\/g, "/").indexOf(marker);

  if (markerIndex === -1) return;

  const key = `./${path.replace(/\\/g, "/").slice(markerIndex + marker.length)}`;
  assetMap[key] = url;
});

/**
 * Registry to look up resolved asset URLs.
 */
export const getAssetUrl = (theme: PieceTheme, color: Color, type: PieceType): string => {
   // Construct the lookup key matching the normalized import.meta.glob format.
   // Current format uses local paths: "./<Theme>/<color><Type>.svg"
   const key = `./${theme}/${color}${type}.svg`;
   
   const asset = assetMap[key];
   
   if (!asset) {
     if (!import.meta.env.TEST) {
       console.warn(`Asset not found for key: "${key}" (Theme: ${theme}, Piece: ${color}${type})`);
     }
     return ""; 
   }
   
   return asset;
};
