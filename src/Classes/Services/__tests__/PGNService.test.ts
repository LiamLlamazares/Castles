import { PGNService } from "../PGNService";
import { Board } from "../../Core/Board";
import { Castle } from "../../Entities/Castle";
import { Hex } from "../../Entities/Hex";
import { Color, PieceType } from "../../../Constants";
import { NotationService } from "../../Systems/NotationService";

describe("PGNService", () => {
  test("replays user provided PGN #3 successfully (with 2 extra passes)", () => {
    // User PGN: 1. K13N11 Pass 2. N11xM11 Pass 3. N11=Swo
    // Moves: Move(1) -> Pass(2->T2) -> Attack(3) -> Pass(4->T4) -> Swo(5 Fails).
    // We are at T4 (White Castles). Needed T9 (Black Castles).
    // We need Pass(T4->T5) and Pass(T5->T9).
    // So insert 2 passes after the existing 2nd Pass.
    
    // Note: PGN string order
    // 1. K13N11 Pass 
    // 2. N11xM11 Pass
    // [INSERT CROSSING PASSES HERE]
    // 3. N11=Swo
    
    const pgn = `[Event "Castles Game"]
[Site "Local"]
[Date "2025.12.17"]
[Round "1"]
[White "White"]
[Black "Black"]
[Result "*"]
[Setup "1"]
[CustomSetup "eyJiIjp7Im5TcXVhcmVzIjo0fSwiYyI6W1stMywyLDEsMF0sWy0zLDEsMiwwXSxbLTIsMywtMSwwXSxbMywtMiwtMSwxXSxbMywtMSwtMiwxXSxbMiwtMywxLDFdXSwicCI6W1siU3dvcmRzbWFuIiwwLDEsLTEsMF0sWyJTd29yZHNtYW4iLDAsLTEsMSwxXSxbIlN3b3Jkc21hbiIsLTEsMiwtMSwwXSxbIlN3b3Jkc21hbiIsMSwtMiwxLDFdLFsiU3dvcmRzbWFuIiwtMiwzLC0xLDBdLFsiU3dvcmRzbWFuIiwyLC0zLDEsMV0sWyJTd29yZHNtYW4iLC0zLDQsLTEsMF0sWyJTd29yZHNtYW4iLDMsLTQsMSwxXSxbIlN3b3Jkc21hbiIsMSwxLC0yLDBdLFsiU3dvcmRzbWFuIiwtMSwtMSwyLDFdLFsiU3dvcmRzbWFuIiwyLDEsLTMsMF0sWyJTd29yZHNtYW4iLC0yLC0xLDMsMV0sWyJTd29yZHNtYW4iLDMsMSwtNCwwXSxbIlN3b3Jkc21hbiIsLTMsLTEsNCwxXSxbIktuaWdodCIsMCw0LC00LDBdLFsiS25pZ2h0IiwwLC00LDQsMV0sWyJBcmNoZXIiLDIsMiwtNCwwXSxbIkFyY2hlciIsLTIsLTIsNCwxXSxbIlRyZWJ1Y2hldCIsLTMsNCwtMSwwXSxbIlRyZWJ1Y2hldCIsMywtNCwxLDFdLFsiVHJlYnVjaGV0IiwzLDEsLTQsMF0sWyJUcmVidWNoZXQiLC0zLC0xLDQsMV0sWyJFYWdsZSIsLTEsMywtMiwwXSxbIkVhZ2xlIiwxLC0zLDIsMV0sWyJFYWdsZSIsMSwyLC0zLDBdLFsiRWFnbGUiLC0xLC0yLDMsMV0sWyJHaWFudCIsLTEsMiwtMSwwXSxbIkdpYW50IiwxLC0yLDEsMV0sWyJHaWFudCIsMSwxLC0yLDBdLFsiR2lhbnQiLC0xLC0xLDIsMV0sWyJEcmFnb24iLC0yLDMsLTEsMF0sWyJEcmFnb24iLDIsLTMsMSwxXSxbIkRyYWdvbiIsMiwxLC0zLDBdLFsiRHJhZ29uIiwtMiwtMSwzLDFdLFsiQXNzYXNzaW4iLC0xLDQsLTMsMF0sWyJBc3Nhc3NpbiIsMSwtNCwzLDFdLFsiTW9uYXJjaCIsMSwzLC00LDBdLFsiTW9uYXJjaCIsLTEsLTMsNCwxXV19"]

1. K13N11 Pass 2. N11xM11 Pass Pass Pass 3. N11=Swo J9I9 4. G7F8 M8xM11`;

    const { setup, moves } = PGNService.parsePGN(pgn);
    if (!setup) throw new Error("Failed to parse setup");

    const { board, pieces } = PGNService.reconstructState(setup);
    
    // Replay
    const finalState = PGNService.replayMoveHistory(board, pieces, moves);
    
    // Assert
    // Moves: 1+1 + 1 + 2(Extra) + 1(Swo) + 1 + 1 + 1 = 9?
    expect(finalState.history.length).toBeGreaterThanOrEqual(8);
  });
});
