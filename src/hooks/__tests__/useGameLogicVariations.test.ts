import { renderHook, act } from "@testing-library/react";
import { useGameLogic } from "../useGameLogic";
import { Hex } from "../../Classes/Entities/Hex";

describe("useGameLogic Nested Variations Integration", () => {
    it("should correctly create nested variations when navigating back in history", () => {
        const { result } = renderHook(() => useGameLogic());
        
        // Helper to make a move
        const makeMove = (fromHex: Hex, toHex: Hex) => {
            const piece = result.current.pieces.find(p => p.hex.equals(fromHex));
            if (!piece) throw new Error(`No piece at ${fromHex.toString()}`);
            
            act(() => {
                result.current.handlePieceClick(piece);
            });
            
            act(() => {
                result.current.handleHexClick(toHex);
            });
        };
        
        // 1. Play some moves
        // White move
        // Find a white piece
        const whitePiece = result.current.pieces.find(p => p.color === 'w' && p.canMove)!;
        const validMove = Array.from(result.current.legalMoveSet)[0]; // string key
        const targetHex = result.current.hexagons.find(h => h.getKey() === validMove)!;
        
        act(() => {
            result.current.handlePieceClick(whitePiece);
        });
        
        act(() => {
            result.current.handleHexClick(targetHex);
        });
        
        expect(result.current.moveHistory.length).toBe(1);
        
        // 2. Play Black move
        const blackPiece = result.current.pieces.find(p => p.color === 'b' && p.canMove)!;
        act(() => {
            result.current.handlePieceClick(blackPiece);
        });
        const validBlackMove = Array.from(result.current.legalMoveSet)[0];
        const targetBlackHex = result.current.hexagons.find(h => h.getKey() === validBlackMove)!;
        
        act(() => {
            result.current.handleHexClick(targetBlackHex);
        });
        
        expect(result.current.moveHistory.length).toBe(2);
        
        // 3. Step back 1 move (Undo Black's move)
        // Current View Index: 1 (Move 2). Step back -> Index 0 (Move 1).
        // stepsBack = 2 - 0 = 2? No.
        // history length = 2 (start, after move 1). moveHistory length = 2.
        // Wait, history array is length 3? [Start, After M1, After M2]
        
        act(() => {
            result.current.stepHistory(-1);
        });
        
        expect(result.current.isAnalysisMode).toBe(true);
        // We are viewing state after Move 1.
        
        // 4. Play DIFFERENT Black move (Variation)
        const anotherBlackPiece = result.current.pieces.find(p => p.color === 'b' && p.canMove && !p.hex.equals(blackPiece.hex));
        // Fallback if same piece
        const usePiece = anotherBlackPiece || blackPiece;
        
        act(() => {
            result.current.handlePieceClick(usePiece);
        });
        
        // Find a valid move for this piece
        const newTargetKey = Array.from(result.current.legalMoveSet)[0];
        const newTargetHex = result.current.hexagons.find(h => h.getKey() === newTargetKey)!;
        
        act(() => {
            result.current.handleHexClick(newTargetHex);
        });
        
        // 5. Verification
        // Should have created a variation at move 1.
        const tree = result.current.moveTree;
        const root = tree?.rootNode;
        const move1Node = root?.children[0]; // The white move
        
        expect(move1Node).toBeDefined();
        // Move 1 should have 2 children: Original Black Move, and New Variation Black Move
        expect(move1Node?.children.length).toBe(2);
        
        // Current head should be the NEW variation
        expect(tree?.currentNode.move.notation).not.toBe(targetBlackHex.toString()); 
        // (Depends on notation, but basically checking it's the new branch)
        
        // 6. Nested Variation
        // We are currently at variation (Move 1w, Move 1b-Var). history length 2? [Start, M1w, M1b-Var] ?
        // MoveTree has 2 linear moves in this branch? No.
        
        // Let's step back again to Move 1w.
        act(() => {
            result.current.stepHistory(-1); // Go back 1 step
        });
        
        // Play THIRD alternative for Black
        const thirdPiece = result.current.pieces.find(p => p.color === 'b' && p.canMove)!;
        
        act(() => {
            result.current.handlePieceClick(thirdPiece);
        });
        
        // Just make any valid move
        const thirdTargetKey = Array.from(result.current.legalMoveSet)[1] || Array.from(result.current.legalMoveSet)[0];
        const thirdTargetHex = result.current.hexagons.find(h => h.getKey() === thirdTargetKey)!;
        
        act(() => {
            result.current.handleHexClick(thirdTargetHex);
        });
        
        // Verify Move 1w now has 3 children
        expect(move1Node?.children.length).toBe(3);
    });
});
