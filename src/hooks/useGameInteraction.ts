/**
 * @file useGameInteraction.ts
 * @description Handles user interactions for the game, primarily piece selection and resignation.
 */
import { useCallback } from "react";
import { Piece } from "../Classes/Entities/Piece";
import { GameState } from "../Classes/Core/GameState";
import { GameEngine } from "../Classes/Core/GameEngine";
import { Color, TurnPhase } from "../Constants";
import { GameBoardState } from "./useCoreGame";

interface UseGameInteractionProps {
  state: GameBoardState;
  setState: React.Dispatch<React.SetStateAction<GameBoardState>>;
  gameEngine: GameEngine;
  turnPhase: TurnPhase;
  currentPlayer: Color;
  handleHexClick: (hex: import("../Classes/Entities/Hex").Hex) => void;
  movingPiece: Piece | null;
}

export const useGameInteraction = ({
  state,
  setState,
  gameEngine,
  turnPhase,
  currentPlayer,
  handleHexClick,
  movingPiece
}: UseGameInteractionProps) => {

  const handlePieceClick = useCallback((pieceClicked: Piece) => {
    // Check if clicking an enemy piece during Attack phase - delegate to handleHexClick for attack
    const isEnemyPiece = pieceClicked.color !== currentPlayer;
    if (turnPhase === "Attack" && isEnemyPiece && movingPiece?.canAttack) {
      // Delegate to hex click handler which will process the attack
      handleHexClick(pieceClicked.hex);
      return;
    }

    setState(prev => {
        // 1. Unlocking Logic: Delegate to GameEngine
        const newPool = gameEngine.tryUnlockSanctuary(prev as unknown as GameState, pieceClicked);

        // 2. Selection Logic
        let newMovingPiece = prev.movingPiece; // Default to current

        // Standard selection rules
        if (prev.movingPiece === pieceClicked) {
            newMovingPiece = null;
        } else if (prev.movingPiece && pieceClicked.color === currentPlayer) {
            newMovingPiece = pieceClicked;
        } else {
            const canSelectForMovement = turnPhase === "Movement" && pieceClicked.canMove;
            const canSelectForAttack = turnPhase === "Attack" && pieceClicked.canAttack;
            const isOwnPiece = pieceClicked.color === currentPlayer;
            
            if (isOwnPiece && (canSelectForMovement || canSelectForAttack)) {
                newMovingPiece = pieceClicked;
            } else {
                newMovingPiece = null;
            }
        }

        // Optimization: return prev if no changes
        if (newPool === prev.sanctuaryPool && newMovingPiece === prev.movingPiece) {
            return prev;
        }

        return {
            ...prev,
            sanctuaryPool: newPool,
            movingPiece: newMovingPiece
        };
    });
  }, [currentPlayer, turnPhase, movingPiece, handleHexClick, setState, gameEngine]);

  const handleResign = useCallback((player: Color) => {
    // Reset to live game state before resigning (in case viewing history)
    setState(prev => {
        // First reset viewNodeId to exit history view
        // Then find and remove the resigning player's monarch from the ACTUAL state
        const myMonarch = prev.pieces.find(p => p.type === "Monarch" && p.color === player);
        if (myMonarch) {
            const newPieces = prev.pieces.filter(p => p !== myMonarch);
            return { ...prev, pieces: newPieces, viewNodeId: null, movingPiece: null };
        }
        return { ...prev, viewNodeId: null, movingPiece: null };
    });
  }, [setState]);

  return {
    handlePieceClick,
    handleResign
  };
};
