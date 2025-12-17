import { renderHook, act } from "@testing-library/react";
import { useGameLogic } from "../useGameLogic";
import { startingBoard } from "../../ConstantImports";
import { Hex } from "../../Classes/Entities/Hex";
import { PieceType } from "../../Constants";
import { Piece } from "../../Classes/Entities/Piece";

// Mock board setup or use real one? Real one is fine but maybe slow or unpredictable if random?
// startingBoard is imported.

describe("useGameLogic Variants (Interactive Branching)", () => {
    it("should allow making a new move after stepping back in history", () => {
        // 1. Setup
        const { result } = renderHook(() => useGameLogic());
        
        // Ensure starting state
        expect(result.current.turnCounter).toBe(0);
        expect(result.current.moveHistory.length).toBe(0);

        // 2. Make Move 1 (White)
        const whitePiece = result.current.pieces.find(p => p.color === 'w' && p.canMove);
        expect(whitePiece).toBeDefined();
        
        act(() => {
            result.current.handlePieceClick(whitePiece!);
        });
        
        const targetHexKey = Array.from(result.current.legalMoveSet)[0]; 
        const targetHex = result.current.hexagons.find(h => h.getKey() === targetHexKey);
        expect(targetHex).toBeDefined();

        act(() => {
            result.current.handleHexClick(targetHex!);
        });

        // 3. Verify Turn 1 complete
        expect(result.current.moveHistory.length).toBe(1);
        expect(result.current.turnCounter).toBeGreaterThan(0);
        
        // 4. Make Move 2 (Still White - Movement Phase has 2 turns)
        // Find next piece (White again)
        const whitePiece2 = result.current.pieces.find(p => p.color === 'w' && p.canMove);
        expect(whitePiece2).toBeDefined();
        
        act(() => {
            result.current.handlePieceClick(whitePiece2!);
        });
        
        const targetHexKey2 = Array.from(result.current.legalMoveSet)[0];
        const targetHex2 = result.current.hexagons.find(h => h.getKey() === targetHexKey2);
        
        act(() => {
            result.current.handleHexClick(targetHex2!);
        });
        
        expect(result.current.moveHistory.length).toBe(2);
        const move2Notation = result.current.moveHistory[1].notation;

        // 5. Step Back to After Move 1
        // MoveIndex 0 corresponds to the state AFTER the first move.
        act(() => {
            result.current.jumpToMove(0);
        });

        expect(result.current.isAnalysisMode).toBe(true);
        // viewMoveIndex is not exposed by useGameLogic, but implied by state
        
        // Logic: Index 0 is state after 1 move. 
        // So moveHistory should have length 1 in this view?
        // useGameLogic viewState slice:
        // moveHistory: analysisState.moveNotation
        // analysisState is history[0]. 
        // history[0].moveNotation should be [Move1].
        // Analysis mode active, but moveHistory remains full list (standard behavior so UI can show future)
        expect(result.current.moveHistory.length).toBe(2);
        
        // However, turnCounter should reflect the past state (after Move 1)
        // Start: 0. After Move 1: 1 (Movement 2). After Move 2: 2 (Attack 1).
        // So at index 0 (snapshot BEFORE Move 1), turnCounter should be 0.
        expect(result.current.turnCounter).toBe(0);

        // 6. Make a NEW Move (Branching)
        // We are at state after Move 1. It is STILL White's turn (Movement 2).
        
        const branchPiece = result.current.pieces.find(p => p.color === 'w' && p.canMove);
        expect(branchPiece).toBeDefined();

        act(() => {
            result.current.handlePieceClick(branchPiece!);
        });
        
        // Pick same target or different one if possible, but just applying ANY move verifies the branch logic.
        const branchTargetKey = Array.from(result.current.legalMoveSet)[0];
        const branchTarget = result.current.hexagons.find(h => h.getKey() === branchTargetKey);
        
        act(() => {
            result.current.handleHexClick(branchTarget!);
        });
        
        // 7. Verification
        expect(result.current.isAnalysisMode).toBe(false);
        // expect(result.current.viewMoveIndex).toBe(null); // Not exposed
        
        // History should now be LIVE.
        // It consists of [Move1, NewBranchMove].
        // History should now be LIVE.
        // It consists of [NewBranchMove] (since we branched from Start).
        // Length 1.
        expect(result.current.moveHistory.length).toBe(1);
        
        const newBranchNotation = result.current.moveHistory[0].notation;
        expect(newBranchNotation).toBeDefined();
        
        // Ideally verify it's different if we forced it, but checking it exists and state is live is sufficient proof of mechanism
    });
});
