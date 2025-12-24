import { useEffect, useCallback, useRef } from "react";
import { LayoutService } from "../Classes/Systems/LayoutService";

interface UseInputHandlerProps {
  onPass: () => void;
  onFlipBoard: () => void;
  onTakeback: () => void;
  onResize: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onNewGame?: () => void;
  isNewGameEnabled?: boolean;
  layout: LayoutService;  // Accept the actual layout to update
}

export const useInputHandler = ({
  onPass,
  onFlipBoard,
  onTakeback,
  onResize,
  onNavigate,
  onNewGame,
  isNewGameEnabled = false,
  layout,
}: UseInputHandlerProps) => {
  // Use refs to store callbacks/layout to avoid dependency issues
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  
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
      layoutRef.current.updateDimensions(window.innerWidth - 300, window.innerHeight);
      onResizeRef.current();
    };

    // Initial resize - update dimensions AND trigger re-render
    // This ensures the board renders at full size immediately
    layoutRef.current.updateDimensions(window.innerWidth - 300, window.innerHeight);
    
    // Use setTimeout to trigger resize after initial render completes
    // This avoids state updates during render
    const timeoutId = setTimeout(() => {
      onResizeRef.current();
    }, 0);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [handleKeyDown]);
};
