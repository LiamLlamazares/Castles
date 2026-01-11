/**
 * @file useTooltip.ts
 * @description Consolidates tooltip state management for Game.tsx.
 * 
 * Manages:
 * - Piece tooltips (right-click on piece)
 * - Hex/terrain tooltips (right-click on empty hex)
 * - Sanctuary preview tooltips
 * - Hover tooltips for sanctuaries
 */
import { useState, useCallback } from "react";
import { Hex } from "../Classes/Entities/Hex";
import { Piece } from "../Classes/Entities/Piece";

interface TooltipState {
  /** Piece to show tooltip for (right-click) */
  piece: Piece | null;
  /** Hex to show terrain tooltip for */
  hex: Hex | null;
  /** Currently hovered hex (for sanctuary hover) */
  hoveredHex: Hex | null;
  /** Mouse position for tooltip positioning */
  mousePosition: { x: number; y: number };
  /** Whether the piece tooltip is a sanctuary preview */
  isSanctuaryPreview: boolean;
}

interface UseTooltipResult extends TooltipState {
  /** Show piece tooltip */
  showPieceTooltip: (piece: Piece, isPreview?: boolean) => void;
  /** Show hex/terrain tooltip */
  showHexTooltip: (hex: Hex) => void;
  /** Toggle hex tooltip (right-click behavior) */
  toggleHexTooltip: (hex: Hex) => void;
  /** Toggle piece tooltip (right-click behavior) */
  togglePieceTooltip: (piece: Piece) => void;
  /** Update hovered hex and mouse position */
  setHovered: (hex: Hex | null, event?: React.MouseEvent) => void;
  /** Clear all tooltips */
  clearAll: () => void;
  /** Clear piece tooltip only */
  clearPiece: () => void;
  /** Clear hex tooltip only */
  clearHex: () => void;
}

/**
 * Hook for managing tooltip state in the game board.
 * Consolidates 5 state variables into a single cohesive API.
 */
export function useTooltip(): UseTooltipResult {
  const [piece, setPiece] = useState<Piece | null>(null);
  const [hex, setHex] = useState<Hex | null>(null);
  const [hoveredHex, setHoveredHex] = useState<Hex | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isSanctuaryPreview, setIsSanctuaryPreview] = useState(false);

  const showPieceTooltip = useCallback((p: Piece, isPreview = false) => {
    setPiece(p);
    setHex(null);
    setIsSanctuaryPreview(isPreview);
  }, []);

  const showHexTooltip = useCallback((h: Hex) => {
    setHex(h);
    setPiece(null);
    setIsSanctuaryPreview(false);
  }, []);

  const toggleHexTooltip = useCallback((h: Hex) => {
    setHex(prev => prev?.equals(h) ? null : h);
    setPiece(null);
    setIsSanctuaryPreview(false);
  }, []);

  const togglePieceTooltip = useCallback((p: Piece) => {
    setPiece(prev => prev?.hex.equals(p.hex) ? null : p);
    setHex(null);
    setIsSanctuaryPreview(false);
  }, []);

  const setHovered = useCallback((h: Hex | null, event?: React.MouseEvent) => {
    setHoveredHex(h);
    if (event) {
      setMousePosition({ x: event.clientX, y: event.clientY });
    }
  }, []);

  const clearAll = useCallback(() => {
    setPiece(null);
    setHex(null);
    setIsSanctuaryPreview(false);
  }, []);

  const clearPiece = useCallback(() => {
    setPiece(null);
    setIsSanctuaryPreview(false);
  }, []);

  const clearHex = useCallback(() => {
    setHex(null);
  }, []);

  return {
    piece,
    hex,
    hoveredHex,
    mousePosition,
    isSanctuaryPreview,
    showPieceTooltip,
    showHexTooltip,
    toggleHexTooltip,
    togglePieceTooltip,
    setHovered,
    clearAll,
    clearPiece,
    clearHex,
  };
}
