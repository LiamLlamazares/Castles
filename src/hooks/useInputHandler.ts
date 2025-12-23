import { useEffect, useCallback, useRef } from "react";
import { startingLayout } from "../ConstantImports";

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
  // Use ref to store callbacks to avoid dependency issues
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

  // Set up resize handler once
  useEffect(() => {
    const handleResize = () => {
      startingLayout.updateDimensions(window.innerWidth - 300, window.innerHeight);
      onResizeRef.current();
    };

    // Initial resize
    startingLayout.updateDimensions(window.innerWidth - 300, window.innerHeight);
    // DON'T call onResize on initial mount - it causes unnecessary re-renders

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [handleKeyDown]);
};
