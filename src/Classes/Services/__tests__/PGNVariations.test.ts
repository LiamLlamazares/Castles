import { PGNService } from "../PGNService";
import { MoveTree } from "../../Core/MoveTree";
import { Board } from "../../Core/Board";
import { Hex } from "../../Entities/Hex";
import { Castle } from "../../Entities/Castle";
import { MoveRecord } from "../../../Constants";

describe("PGNService Variations Export", () => {
    it("should export PGN with nested variations (RAV format)", () => {
        // 1. Setup a manual MoveTree with variations
        const tree = new MoveTree();
        const board = new Board({ nSquares: 8 }, [new Castle(new Hex(0,0,0), 'w', 0)]);
        
        // Main line: 1. d4 e5 2. c4
        const m1w: MoveRecord = { notation: "d4", turnNumber: 1, color: "w", phase: "Movement" };
        const m1b: MoveRecord = { notation: "e5", turnNumber: 1, color: "b", phase: "Movement" };
        const m2w: MoveRecord = { notation: "c4", turnNumber: 2, color: "w", phase: "Movement" };
        
        tree.addMove(m1w);
        tree.addMove(m1b);
        tree.addMove(m2w);
        
        // Variation at move 1 (White): (1. e4)
        tree.goToRoot();
        const m1w_var: MoveRecord = { notation: "e4", turnNumber: 1, color: "w", phase: "Movement" };
        tree.addMove(m1w_var);
        
        // Variation at move 1 (Black): (1... c5)
        tree.goToRoot();
        tree.addMove(m1w); // navigate to d4
        const m1b_var: MoveRecord = { notation: "c5", turnNumber: 1, color: "b", phase: "Movement" };
        tree.addMove(m1b_var);
        
        // 2. Generate PGN
        const pgn = PGNService.generatePGN(board, [], [], [], {}, tree);
        
        // 3. Verification
        // With the fix: The FIRST move added becomes the main line.
        // d4 was added first at root -> d4 is main. e4 is a variation.
        // e5 was added first after d4 -> e5 is main. c5 is a variation.
        // Note: After a variation, black moves get explicit "1..." numbering (PGN standard)
        // Expected: 1. d4 (1. e4) 1... e5 (1... c5) 2. c4
        
        expect(pgn).toContain("1. d4 (1. e4) 1... e5 (1... c5) 2. c4");
    });
});
