import { Hex } from "../Classes/Entities/Hex";
import { Board } from "../Classes/Core/Board";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { SanctuaryType } from "../Constants";

/**
 * Determines the CSS classes for a given hex based on board state.
 * Handles terrain types (river, castle, high ground) and color patterns.
 */
export const getHexVisualClass = (hex: Hex, board: Board): string => {
  const key = hex.getKey();
  const isHighGround = board.highGroundHexSet.has(key);
  const isRiver = board.riverHexSet.has(key);
  const isWhiteCastle = board.whiteCastleHexSet.has(key);
  const isBlackCastle = board.blackCastleHexSet.has(key);
  const isCastle = board.castleHexSet.has(key); // Generic castle fallback

  // Base color pattern (3-color shading)
  let colorClass = ["hexagon-dark", "hexagon-mid", "hexagon-light"][
    ((hex.color_index % 3) + 3) % 3
  ];

  if (isHighGround) {
    colorClass += " hexagon-high-ground";
  }

  // Terrain overrides
  if (isRiver) return "hexagon-river";
  if (isWhiteCastle) return "hexagon-white-castle";
  if (isBlackCastle) return "hexagon-black-castle";
  if (isCastle) return "hexagon-castle";

  return colorClass;
};

/**
 * Determines the CSS class for castle ownership.
 */
export const getCastleOwnerClass = (hex: Hex, castles: Castle[]): string => {
  const castle = castles.find((c) => c.hex.equals(hex));
  if (!castle) return "";
  // Return class based on current owner (not original color)
  return castle.owner === "w" ? "castle-owned-white" : "castle-owned-black";
};

/**
 * Determines the CSS class for a sanctuary.
 */
export const getSanctuaryVisualClass = (hex: Hex, sanctuaries: Sanctuary[]): string => {
  const sanctuary = sanctuaries.find(s => s.hex.equals(hex));
  if (!sanctuary) return "";

  // Base class
  let className = "hexagon-sanctuary";

  // Type-specific classes (with cooldown modifier if not ready)
  const cooldownSuffix = sanctuary.isReady ? "" : "-cooldown";
  
  switch (sanctuary.type) {
    case SanctuaryType.WolfCovenant: return `${className} hexagon-sanctuary-wolf${cooldownSuffix}`;
    case SanctuaryType.SacredSpring: return `${className} hexagon-sanctuary-healer${cooldownSuffix}`;
    case SanctuaryType.WardensWatch: return `${className} hexagon-sanctuary-ranger${cooldownSuffix}`;
    case SanctuaryType.ArcaneRefuge: return `${className} hexagon-sanctuary-wizard${cooldownSuffix}`;
    case SanctuaryType.ForsakenGrounds: return `${className} hexagon-sanctuary-necromancer${cooldownSuffix}`;
    case SanctuaryType.PyreEternal: return `${className} hexagon-sanctuary-phoenix${cooldownSuffix}`;
    default: return className;
  }
};
