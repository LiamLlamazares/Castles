import { useCallback, useEffect } from "react";
import { MoveTree } from "../Classes/Core/MoveTree";

const PERSISTENCE_KEY = "castles_autosave";

/**
 * Hook for managing game persistence (localStorage and URL sharing).
 */
export const usePersistence = (
  getPGN: () => string,
  loadPGN: (pgn: string) => any,
  moveTree: MoveTree | undefined
) => {
  /**
   * Save current game to localStorage.
   */
  const saveToLocalStorage = useCallback((pgn: string) => {
    try {
      localStorage.setItem(PERSISTENCE_KEY, pgn);
    } catch (e) {
      console.error("Failed to save game to localStorage", e);
    }
  }, []);

  /**
   * Load game from localStorage.
   */
  const loadFromLocalStorage = useCallback(() => {
    try {
      const saved = localStorage.getItem(PERSISTENCE_KEY);
      return saved || null;
    } catch (e) {
      console.error("Failed to load game from localStorage", e);
      return null;
    }
  }, []);

  /**
   * Get game from URL query params.
   */
  const getGameFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("pgn") || params.get("game");
  }, []);

  /**
   * Share current game by updating the URL and copying to clipboard.
   */
  const shareGame = useCallback(() => {
    const pgn = getPGN();
    if (!pgn) return;

    // Create shareable URL
    const url = new URL(window.location.href);
    url.searchParams.set("pgn", pgn);
    
    // Update browser history without reloading
    window.history.replaceState({}, "", url.toString());

    // Copy to clipboard
    navigator.clipboard.writeText(url.toString())
      .then(() => alert("Game link copied to clipboard!"))
      .catch(err => console.error("Failed to copy URL", err));
  }, [getPGN]);

  /**
   * Clear game parameters from URL.
   */
  const clearUrlParams = useCallback(() => {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has("pgn")) {
      url.searchParams.delete("pgn");
      changed = true;
    }
    if (url.searchParams.has("game")) {
      url.searchParams.delete("game");
      changed = true;
    }
    if (changed) {
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  /**
   * Clear saved game.
   */
  const clearSave = useCallback(() => {
    localStorage.removeItem(PERSISTENCE_KEY);
  }, []);

  // Auto-save on every move
  useEffect(() => {
    const history = moveTree?.getHistoryLine() || [];
    if (history.length > 0) {
        const pgn = getPGN();
        if (pgn) {
            console.log("Auto-saving game state...");
            saveToLocalStorage(pgn);
        }
    }
  }, [moveTree, getPGN, saveToLocalStorage]);

  return {
    saveToLocalStorage,
    loadFromLocalStorage,
    getGameFromUrl,
    shareGame,
    clearUrlParams,
    clearSave
  };
};
