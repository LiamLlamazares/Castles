import { PGNService } from "../PGNService";
import { Board, BoardConfig } from "../../Core/Board";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { Castle } from "../../Entities/Castle";
import { Color, PieceType } from "../../../Constants";
import { NotationService } from "../../Systems/NotationService";

describe("PGNService", () => {
    test("replays recruitment and overrides piece type if needed", () => {
        // Setup: Board with 1 White Castle
        // Castle at 0,-1,1 (adjacent to 0,0,0)
        // We want to recruit an Archer (Index 1) but Castle is new (Index 0 = Swordsman)
        // PGN Notation for recruiting at 0,0,0: "J10=Arc" (Assuming J10 is 0,0,0)
        
        const castleHex = new Hex(0, -1, 1);
        const spawnHex = new Hex(0, 0, 0); 
        const spawnCoord = NotationService.toCoordinate(spawnHex); // "J10"
        
        // Create PGN string - Ensure we use a valid notation
        // 1. J10=Arc
        const pgn = `[CustomSetup ""]\n\n1. ${spawnCoord}=Arc`;
        
        const castles = [new Castle(castleHex, "w", 0)]; // turns_controlled 0 -> Expect Swordsman
        const board = new Board({ nSquares: 2 }, castles);
        
        // Parse
        const { moves } = PGNService.parsePGN(pgn);
        
        // Replay
        const finalState = PGNService.replayMoveHistory(board, [], moves);
        
        // Assert
        const newlyRecruited = finalState.pieces.find(p => p.hex.equals(spawnHex));
        expect(newlyRecruited).toBeDefined();
        // The key assertion: Is it an Archer (from PGN) or Swordsman (from default logic)?
        expect(newlyRecruited?.type).toBe(PieceType.Archer); 
      });
});
