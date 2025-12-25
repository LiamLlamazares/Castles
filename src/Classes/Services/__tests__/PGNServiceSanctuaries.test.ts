import { PGNService } from "../PGNService";
import { Board } from "../../Core/Board";
import { Piece } from "../../Entities/Piece";
import { Sanctuary } from "../../Entities/Sanctuary";
import { Hex } from "../../Entities/Hex";
import { startingBoard, allPieces } from "../../../ConstantImports";
import { SanctuaryType } from "../../../Constants";
import { MoveTree } from "../../Core/MoveTree";

describe("PGNService Sanctuary Persistence", () => {
    it("should preserve sanctuary positions and types after export and import", () => {
        // 1. Setup - Create specific sanctuaries
        const sanctuaries = [
            new Sanctuary(new Hex(0, 2, -2), SanctuaryType.WolfCovenant, 'w'),
            new Sanctuary(new Hex(0, -2, 2), SanctuaryType.WolfCovenant, 'b')
        ];

        // 2. Export PGN
        const pgn = PGNService.generatePGN(startingBoard, allPieces, [], sanctuaries);
        
        // 3. Import PGN
        const { setup, moves } = PGNService.parsePGN(pgn);
        expect(setup).toBeTruthy();
        
        const reconstructed = PGNService.reconstructState(setup!);
        
        // 4. Verify
        expect(reconstructed.sanctuaries.length).toBe(2);
        
        const s1 = reconstructed.sanctuaries.find(s => s.hex.equals(new Hex(0, 2, -2)));
        expect(s1).toBeDefined();
        expect(s1?.type).toBe(SanctuaryType.WolfCovenant);
        expect(s1?.territorySide).toBe('w');

        const s2 = reconstructed.sanctuaries.find(s => s.hex.equals(new Hex(0, -2, 2)));
        expect(s2).toBeDefined();
        expect(s2?.type).toBe(SanctuaryType.WolfCovenant);
        expect(s2?.territorySide).toBe('b');
    });

    it("should replay move history with correct initial sanctuaries", () => {
         const initialSanctuaries = [
            new Sanctuary(new Hex(0, 2, -2), SanctuaryType.WolfCovenant, 'w')
        ];
        
        // Replay with no moves
        const state = PGNService.replayMoveHistory(startingBoard, allPieces, new MoveTree(), initialSanctuaries);
        
        expect(state.sanctuaries.length).toBe(1);
        expect(state.sanctuaries[0].hex.equals(new Hex(0, 2, -2))).toBe(true);
    });
});
