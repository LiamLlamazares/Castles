/**
 * @file useInputController.ts
 * @description Decouples Input Interpretation from Execution.
 *
 * This hook analyzes the current Game State (Phase, Selected Piece, etc.) and the User Input (Click)
 * to determine WHICH Command should be generated.
 *
 * It does NOT execute the command. It only fabricates it.
 */
import { useCallback, useMemo } from "react";
import { GameCommand, MoveCommand, AttackCommand, CastleAttackCommand, RecruitCommand } from "../Classes/Commands";
import { Hex } from "../Classes/Entities/Hex";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { GameEngine } from "../Classes/Core/GameEngine";
import { TurnPhase } from "../Constants";

interface InputControllerProps {
    gameEngine: GameEngine;
    turnPhase: TurnPhase;
    movingPiece: Piece | null;
    castles: Castle[];
    isLegalMove: (hex: Hex) => boolean;
    isLegalAttack: (hex: Hex) => boolean;
    isRecruitmentSpot: (hex: Hex) => boolean;
    getPieces: () => Piece[]; // Getter mainly for finding attack targets
}

export const useInputController = ({
    gameEngine,
    turnPhase,
    movingPiece,
    castles,
    isLegalMove,
    isLegalAttack,
    isRecruitmentSpot,
    getPieces
}: InputControllerProps) => {

    const commandContext = useMemo(() => ({
        gameEngine,
        board: gameEngine.board
    }), [gameEngine]);

    const resolveCommand = useCallback((hex: Hex): GameCommand | null => {
        // 1. MOVEMENT PHASE
        if (turnPhase === "Movement" && movingPiece?.canMove && isLegalMove(hex)) {
            return new MoveCommand(movingPiece, hex, commandContext);
        }

        // 2. ATTACK PHASE
        if (turnPhase === "Attack" && movingPiece?.canAttack && isLegalAttack(hex)) {
            // Determine target type
            const targetPiece = getPieces().find(p => p.hex.equals(hex));
            
            if (targetPiece) {
                return new AttackCommand(movingPiece, hex, commandContext);
            } else {
                return new CastleAttackCommand(movingPiece, hex, commandContext);
            }
        }

        // 3. RECRUITMENT (Any Phase usually, or specific phase depending on rules)
        // Usually handled during "Recruitment" phase or restricted times, but logic here relies on isRecruitmentSpot
        if (isRecruitmentSpot(hex)) {
            const castle = castles.find(c => c.isAdjacent(hex));
            if (castle) {
                return new RecruitCommand(castle, hex, commandContext);
            }
        }

        return null;

    }, [
        turnPhase, 
        movingPiece, 
        isLegalMove, 
        isLegalAttack, 
        isRecruitmentSpot, 
        castles, 
        getPieces, 
        commandContext
    ]);

    return {
        resolveCommand
    };
};
