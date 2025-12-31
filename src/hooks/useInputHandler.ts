import { useEffect, useCallback, useRef } from "react";

interface UseInputHandlerProps {
  onPass: () => void;
  onFlipBoard: () => void;
  onTakeback: () => void;
  onResize: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onNewGame?: () => void;
  isNewGameEnabled?: boolean;
}

export const useInputHandler = ({
  onPass,
  onFlipBoard,
  onTakeback,
  onResize,
  onNavigate,
  onNewGame,
  isNewGameEnabled = false,
}: UseInputHandlerProps) => {
  // Use refs to store callbacks to avoid dependency issues
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.code) {
      case "Space":
        event.preventDefault(); // Prevent scrolling
        onPass();
        break;
      case "KeyR":
        onFlipBoard();
        break;
      case "KeyZ":
        onTakeback();
        break;
      case "KeyQ":
        onPass();
        break;
      case "KeyN":
        if (isNewGameEnabled && onNewGame) {
          onNewGame();
        }
        break;
      case "ArrowLeft":
        onNavigate(-1);
        break;
      case "ArrowRight":
        onNavigate(1);
        break;
    }
  }, [onPass, onFlipBoard, onTakeback, onNavigate, onNewGame, isNewGameEnabled]);

  // Set up keyboard and resize handlers
  // NOTE: We no longer call updateDimensions because we use viewBox-based scaling.
  // The layout stays at VIRTUAL_CANVAS_SIZE and SVG viewBox scales it automatically.
  useEffect(() => {
    const handleResize = () => {
      // Just trigger a re-render, no dimension updates needed with viewBox scaling
      onResizeRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [handleKeyDown]);
};

