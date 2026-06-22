import type { PieceTheme } from "../Constants";

const PIECE_THEME_STORAGE_KEY = "castles-piece-theme";

export const PIECE_THEME_OPTIONS: Array<{ value: PieceTheme; label: string }> = [
  { value: "Castles", label: "Castles" },
  { value: "Chess", label: "Chess" },
];

export function isPieceTheme(value: unknown): value is PieceTheme {
  return value === "Castles" || value === "Chess";
}

export function readPreferredPieceTheme(): PieceTheme {
  try {
    const stored = window.localStorage.getItem(PIECE_THEME_STORAGE_KEY);
    return isPieceTheme(stored) ? stored : "Castles";
  } catch {
    return "Castles";
  }
}

export function writePreferredPieceTheme(theme: PieceTheme): void {
  try {
    window.localStorage.setItem(PIECE_THEME_STORAGE_KEY, theme);
  } catch {
    // Piece-set preference is local convenience; storage failures should not block play.
  }
}
