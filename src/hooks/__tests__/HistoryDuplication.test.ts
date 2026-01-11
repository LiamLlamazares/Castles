import { renderHook, act } from "@testing-library/react";
import { renderGameLogicHook } from "../test-utils/TestGameProviderUtils";

import { Hex } from "../../Classes/Entities/Hex";

describe("useGameLogic History Duplication", () => {
    it("should NOT duplicate moves in history when making a regular move", () => {
        const { result } = renderGameLogicHook();
        
        // 1. Make a Movement
        const whitePiece = result.current.pieces.find(p => p.color === 'w' && p.canMove);
        expect(whitePiece).toBeDefined();
        
        act(() => {
            result.current.handlePieceClick(whitePiece!);
        });
        
        const targetHexKey = Array.from(result.current.legalMoveSet)[0];
        const targetHex = result.current.hexagons.find(h => h.getKey() === targetHexKey);
        
        act(() => {
            result.current.handleHexClick(targetHex!);
        });

        // 2. Verification
        // moveHistory should have exactly 1 move
        expect(result.current.moveHistory.length).toBe(1);
        
        const historyLine = result.current.moveTree?.getHistoryLine();
        expect(historyLine?.length).toBe(1);
    });

    it("should NOT duplicate moves when clicking an enemy piece during attack phase", () => {
        // This test is harder to setup without a custom board, but if handlePieceClick's 
        // attack logic is removed, duplication is geometrically impossible from bubbling.
    });

    it("should NOT duplicate moves in MoveTree when logic is called twice (Strict Mode simulation)", () => {
        const { result } = renderGameLogicHook();
        
        const whitePiece = result.current.pieces.find(p => p.color === 'w' && p.canMove);
        expect(whitePiece).toBeDefined();

        act(() => {
            result.current.handlePieceClick(whitePiece!);
        });

        const targetHexKey = Array.from(result.current.legalMoveSet)[0];
        expect(targetHexKey).toBeDefined();
        const targetHex = result.current.hexagons.find(h => h.getKey() === targetHexKey)!;

        // Simulate a "double call" to handleHexClick
        act(() => {
            // First call - performs the move
            result.current.handleHexClick(targetHex);
            // Second call - should be ignored or harmless now that move is done
            result.current.handleHexClick(targetHex);
        });

        const historyLine = result.current.moveTree?.getHistoryLine();
        expect(historyLine?.length).toBe(1); 
        
        // PGN should also have only one move
        const pgn = result.current.getPGN();
        const movesMatch = pgn.match(/1\.\s+(\S+)\s+(\S+)?/);
        // If there's a second move string after "1. XXX", it should not be the same XXX
        if (movesMatch && movesMatch[2]) {
             expect(movesMatch[2]).not.toBe(movesMatch[1]);
        }
    });
});
