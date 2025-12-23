import { PGNService } from "../PGNService";
import { MoveTree } from "../../Core/MoveTree";
import { Board } from "../../Core/Board";
import { Hex } from "../../Entities/Hex";
import { Castle } from "../../Entities/Castle";
import { MoveRecord, Color } from "../../../Constants";

describe("PGNService Multiple Variations Export", () => {
    it("should export PGN with multiple siblings and deep nesting", () => {
        // 1. Setup a manual MoveTree with the user's specific scenario
        // 1. G12G11 H12H11 (1... I11I10 2. M8M9 N7N8)
        const tree = new MoveTree();
        const board = new Board({ nSquares: 8 }, [new Castle(new Hex(0,0,0), 'w', 0)]);
        
        const m1w: MoveRecord = { notation: "G12G11", turnNumber: 1, color: "w", phase: "Movement" };
        const m1b_main: MoveRecord = { notation: "H12H11", turnNumber: 1, color: "b", phase: "Movement" };
        const m1b_var: MoveRecord = { notation: "I11I10", turnNumber: 1, color: "b", phase: "Movement" };
        const m2w_var: MoveRecord = { notation: "M8M9", turnNumber: 2, color: "w", phase: "Movement" };
        const m2b_var: MoveRecord = { notation: "N7N8", turnNumber: 2, color: "b", phase: "Movement" };
        
        // Build main line
        tree.addMove(m1w);       // 1. G12G11
        tree.addMove(m1b_main);  // 1... H12H11
        
        // Add variations from the same node (m1w)
        tree.navigateToIndex(0); // Back to G12G11
        tree.addMove(m1b_var);   // 1... I11I10 (variation)
        tree.addMove(m2w_var);   // 2. M8M9
        tree.addMove(m2b_var);   // 2... N7N8
        
        // With the fix, the FIRST move (H12H11) is already the main line.
        // No manual override needed!

        // 2. Generate PGN
        const pgn = PGNService.generatePGN(board, [], [], [], {}, tree);
        
        // 3. Verification
        // Expected: 1. G12G11 H12H11 (1... I11I10 2. M8M9 N7N8)
        expect(pgn).toContain("1. G12G11 H12H11 (1... I11I10 2. M8M9 N7N8)");
    });

    it("should handle multiple sibling variations from the same move", () => {
        const tree = new MoveTree();
        const board = new Board({ nSquares: 8 }, [new Castle(new Hex(0,0,0), 'w', 0)]);
        
        const m1w_main: MoveRecord = { notation: "e4", turnNumber: 1, color: "w" as Color, phase: "Movement" };
        const m1w_var1: MoveRecord = { notation: "d4", turnNumber: 1, color: "w" as Color, phase: "Movement" };
        const m1w_var2: MoveRecord = { notation: "c4", turnNumber: 1, color: "w" as Color, phase: "Movement" };
        
        tree.addMove(m1w_main);
        
        tree.goToRoot();
        tree.addMove(m1w_var1);
        
        tree.goToRoot();
        tree.addMove(m1w_var2);
        
        // Select e4 as main
        tree.goToRoot();
        tree.current.selectedChildIndex = 0;

        const pgn = PGNService.generatePGN(board, [], [], [], {}, tree);
        
        // Expected: 1. e4 (1. d4) (1. c4)
        expect(pgn).toContain("1. e4 (1. d4) (1. c4)");
    });

    it("should handle variations of variations (deep nesting)", () => {
        const tree = new MoveTree();
        const board = new Board({ nSquares: 8 }, [new Castle(new Hex(0,0,0), 'w', 0)]);
        
        // User's exact scenario:
        // 1. Play J11J10 (w), I11I10 (w)  - main line
        // 2. Go back to J11J10
        // 3. Play H12H11 (w) - first variation
        // 4. Play M8M9 (b), N7N8 (b) - continue variation
        // 5. Go back to M8M9
        // 6. Play P6P7 (b) - sub-variation of variation
        // 7. Go back to M8M9 again
        // 8. Play F7F8 (b) - another sub-variation
        
        // Expected: 1. J11J10 I11I10 (1... H12H11 2. M8M9 N7N8 (2... P6P7) (2... F7F8))
        
        // Step 1: Main line
        tree.addMove({ notation: "J11J10", turnNumber: 1, color: "w", phase: "Movement" as any });
        tree.addMove({ notation: "I11I10", turnNumber: 1, color: "w", phase: "Movement" as any });
        
        // Step 2: Go back to J11J10 and create first variation
        tree.navigateToIndex(0); // At J11J10
        tree.addMove({ notation: "H12H11", turnNumber: 1, color: "w", phase: "Movement" as any });
        
        // Step 3: Continue this variation
        tree.addMove({ notation: "M8M9", turnNumber: 2, color: "b", phase: "Movement" as any });
        tree.addMove({ notation: "N7N8", turnNumber: 2, color: "b", phase: "Movement" as any });
        
        // Step 4: Go back to M8M9 and create SUB-variation
        tree.navigateBack(); // At M8M9
        tree.addMove({ notation: "P6P7", turnNumber: 2, color: "b", phase: "Movement" as any });
        
        // Step 5: Go back to M8M9 again and create ANOTHER sub-variation
        tree.navigateBack(); // At M8M9
        tree.addMove({ notation: "F7F8", turnNumber: 2, color: "b", phase: "Movement" as any });
        
        // Generate PGN
        const pgn = PGNService.generatePGN(board, [], [], [], {}, tree);
        
        // Verify: Should have nested variations
        // Main: J11J10 I11I10
        // First variation: (1... H12H11 2. M8M9 N7N8 (2... P6P7) (2... F7F8))
        expect(pgn).toContain("1. J11J10 I11I10");
        expect(pgn).toContain("1... H12H11");
        expect(pgn).toContain("2. M8M9 N7N8");
        expect(pgn).toContain("(2... P6P7)");
        expect(pgn).toContain("(2... F7F8)");
    });
});
