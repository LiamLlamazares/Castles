import { startingBoard, allPieces } from "../../../ConstantImports";
import { PGNService } from "../PGNService";
import { PGNParser } from "../../Systems/PGNParser";
import { ReplayDiagnostic } from "../PGNImporter";

describe("PGN replay hydration diagnostics", () => {
  it("throws the replay failure in strict mode", () => {
    const moveTree = PGNParser.parseToTree("1. Z99Z98");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() =>
      (PGNService.replayMoveHistory as any)(
        startingBoard,
        allPieces,
        moveTree,
        [],
        undefined,
        { strict: true }
      )
    ).toThrow(/Mover not found at Z99/);

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("collects replay diagnostics in non-strict mode without logging", () => {
    const moveTree = PGNParser.parseToTree("1. Z99Z98");
    const diagnostics: ReplayDiagnostic[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const state = PGNService.replayMoveHistory(
      startingBoard,
      allPieces,
      moveTree,
      [],
      undefined,
      { diagnostics }
    );

    expect(state.turnCounter).toBe(0);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      notation: "Z99Z98",
      message: "Mover not found at Z99",
    });
    expect(diagnostics[0].nodeId).toBeDefined();
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("diagnoses unrecognized tokens instead of hydrating no-op snapshots", () => {
    const moveTree = PGNParser.parseToTree("1. BADTOKEN");
    const diagnostics: ReplayDiagnostic[] = [];

    PGNService.replayMoveHistory(
      startingBoard,
      allPieces,
      moveTree,
      [],
      undefined,
      { diagnostics }
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      notation: "BADTOKEN",
      message: "Unrecognized PGN replay token BADTOKEN",
    });
  });

  it("throws unknown ability codes in strict mode", () => {
    const moveTree = PGNParser.parseToTree("1. WX:J10K11");

    expect(() =>
      PGNService.replayMoveHistory(
        startingBoard,
        allPieces,
        moveTree,
        [],
        undefined,
        { strict: true }
      )
    ).toThrow(/Unknown ability code WX/);
  });

  it("only strips trailing annotation suffixes before hydration", () => {
    const moveTree = PGNParser.parseToTree("1. Z?99Z98!");

    expect(() =>
      PGNService.replayMoveHistory(
        startingBoard,
        allPieces,
        moveTree,
        [],
        undefined,
        { strict: true }
      )
    ).toThrow(/Unrecognized PGN replay token Z\?99Z98/);
  });
});
