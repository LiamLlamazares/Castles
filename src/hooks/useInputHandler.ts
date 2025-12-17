import { useEffect, useCallback } from "react";
import { startingLayout } from "../ConstantImports";

interface UseInputHandlerProps {
  onPass: () => void;
  onFlipBoard: () => void;
  onTakeback: () => void;
  onResize: () => void;
  onNavigate: (direction: -1 | 1) => void;
}

export const useInputHandler = ({
  onPass,
  onFlipBoard,
  onTakeback,
  onResize,
  onNavigate,
}: UseInputHandlerProps) => {
  
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
      case "ArrowLeft":
        onNavigate(-1);
        break;
      case "ArrowRight":
        onNavigate(1);
        break;
    }
  }, [onPass, onFlipBoard, onTakeback, onNavigate]);

  const handleResize = useCallback(() => {
    // Subtract sidebar width (200px) AND Right HUD width (~280px)
    startingLayout.updateDimensions(window.innerWidth - 550, window.innerHeight);
    onResize();
  }, [onResize]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    
    // Initial resize to set correct dimensions immediately
    handleResize();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [handleKeyDown, handleResize]);
};
