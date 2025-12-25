import { PGNService } from "../PGNService";
import { startingBoard } from "../../../ConstantImports";
import { allPieces } from "../../../ConstantImports";

describe("PGN Tree Structure", () => {
    it("should have correct tree structure after replayMoveHistory", () => {
        // Simple 4-move game
        const moves = ["G12G11", "H12H11", "L8L9", "M8M9"];
        const moveString = moves.join(" ");
        const { moveTree } = PGNService.parsePGN(moveString);
        
        const finalState = PGNService.replayMoveHistory(startingBoard, allPieces, moveTree, []);
        
        const tree = finalState.moveTree!;
        const root = tree.rootNode;
        
        // Root should have exactly 1 child
        expect(root.children.length).toBe(1);
        
        const firstMove = root.children[0];
        expect(firstMove.move.notation).toBe("G12G11");
        
        // First move should have exactly 1 child (the second move)
        expect(firstMove.children.length).toBe(1);
        expect(firstMove.children[0].move.notation).toBe("H12H11");
        
        // NOT G12G11 again!
        expect(firstMove.children[0].move.notation).not.toBe("G12G11");
        
        // Verify full history line
        const historyLine = tree.getHistoryLine();
        const notations = historyLine.map(m => m.notation);
        
        console.log("History line:", notations);
        
        // Should be: ["Start", "G12G11", "H12H11", "L8L9", "M8M9"] or similar
        expect(notations).toContain("G12G11");
        expect(notations.filter(n => n === "G12G11").length).toBe(1); // Only ONE G12G11!
    });
});
