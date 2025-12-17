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
        const board = new Board({ radius: 8 }, [new Castle(new Hex(0,0,0), 'w', 0)]);
        
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
        // The service renders variations in parentheses.
        // d4 was main, but e4 was added later to root -> root has [d4, e4]. root.selected=1 (e4).
        // d4 has children [e5, c5]. d4.selected=1 (c5).
        // Since e4 is selected at root, main line starts with 1. e4.
        // d4 is a variation (1. d4).
        // inside d4 variation, c5 is selected, so d4 c5 is main. e5 is variation (e5).
        
        expect(pgn).toContain("1. e4 (1. d4 (1. e5 2. c4) c5)");
    });
});
