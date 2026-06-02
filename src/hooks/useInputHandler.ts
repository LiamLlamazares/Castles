import { useEffect, useCallback, useRef } from "react";

interface UseInputHandlerProps {
  onPass: () => void;
  onFlipBoard: () => void;
  onTakeback: () => void;
  onResize: () => void;
  onNavigate: (direction: -1 | 1) => void;
  isHistoryNavigationEnabled?: boolean;
  onNewGame?: () => void;
  isNewGameEnabled?: boolean;
}

function isKeyboardManagedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    !!target.closest(
      '[contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="radiogroup"], [role="slider"], [role="spinbutton"], [role="textbox"]'
    )
  );
}

export const useInputHandler = ({
  onPass,
  onFlipBoard,
  onTakeback,
  onResize,
  onNavigate,
  isHistoryNavigationEnabled = false,
  onNewGame,
  isNewGameEnabled = false,
}: UseInputHandlerProps) => {
  // Use refs to store callbacks to avoid dependency issues
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isKeyboardManagedTarget(event.target)) {
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
        if (isHistoryNavigationEnabled) {
          event.preventDefault();
          onNavigate(-1);
        }
        break;
      case "ArrowRight":
        if (isHistoryNavigationEnabled) {
          event.preventDefault();
          onNavigate(1);
        }
        break;
    }
  }, [
    onPass,
    onFlipBoard,
    onTakeback,
    onNavigate,
    isHistoryNavigationEnabled,
    onNewGame,
    isNewGameEnabled
  ]);

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

