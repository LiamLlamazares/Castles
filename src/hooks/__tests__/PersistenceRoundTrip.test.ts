import { act, renderHook } from "@testing-library/react";
import { MoveTree } from "../../Classes/Core/MoveTree";
import { PGNService } from "../../Classes/Services/PGNService";
import { usePersistence } from "../usePersistence";
import { renderGameLogicHook } from "../test-utils/TestGameProviderUtils";

const makeFirstLegalMove = (result: ReturnType<typeof renderGameLogicHook>["result"]) => {
  const movablePiece = result.current.pieces.find(
    (piece) => piece.color === result.current.currentPlayer && piece.canMove
  );
  expect(movablePiece).toBeDefined();

  act(() => {
    result.current.handlePieceClick(movablePiece!);
  });

  const targetHexKey = Array.from(result.current.legalMoveSet)[0];
  expect(targetHexKey).toBeDefined();
  const targetHex = result.current.hexagons.find((hex) => hex.getKey() === targetHexKey);
  expect(targetHex).toBeDefined();

  act(() => {
    result.current.handleHexClick(targetHex!);
  });
};

describe("PGN persistence round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exports root snapshot setup while replaying to the current state", () => {
    const { result } = renderGameLogicHook();
    const startingPieceKeys = result.current.pieces
      .map((piece) => `${piece.color}:${piece.type}:${piece.hex.getKey()}`)
      .sort();

    makeFirstLegalMove(result);

    const pgn = result.current.getPGN();
    const parsed = PGNService.parsePGN(pgn);
    expect(parsed.setup).not.toBeNull();

    const setupPieceKeys = parsed.setup!.pieces
      .map((piece) => `${piece.color}:${piece.type}:${piece.q},${piece.r},${piece.s}`)
      .sort();
    expect(setupPieceKeys).toEqual(startingPieceKeys);

    const loaded = result.current.loadPGN(pgn);
    expect(loaded).not.toBeNull();
    expect(loaded?.turnCounter).toBe(result.current.turnCounter);
    expect(loaded?.pieces.map((piece) => piece.hex.getKey()).sort()).toEqual(
      result.current.pieces.map((piece) => piece.hex.getKey()).sort()
    );
  });

  it("loadPGN returns all fields required by Game.tsx handoff", () => {
    const { result } = renderGameLogicHook();
    makeFirstLegalMove(result);

    const loaded = result.current.loadPGN(result.current.getPGN());

    expect(loaded).toMatchObject({
      board: expect.any(Object),
      pieces: expect.any(Array),
      castles: expect.any(Array),
      sanctuaries: expect.any(Array),
      moveTree: expect.any(MoveTree),
      turnCounter: expect.any(Number),
      sanctuaryPool: expect.any(Array),
      diagnostics: [],
    });
  });

  it("autosaves parseable PGN when the move tree changes after mount", () => {
    const getPGN = vi.fn(() => `[Event "Castles Game"]\n\n1. A`);
    const loadPGN = vi.fn();
    const emptyTree = new MoveTree();
    const populatedTree = new MoveTree();
    populatedTree.addMove({
      notation: "A",
      turnNumber: 1,
      color: "w",
      phase: "Movement",
    });

    const { rerender } = renderHook(
      ({ tree }) => usePersistence(getPGN, loadPGN, tree),
      { initialProps: { tree: emptyTree } }
    );

    expect(localStorage.getItem("castles_autosave")).toBeNull();

    rerender({ tree: populatedTree });

    const saved = localStorage.getItem("castles_autosave");
    expect(saved).toBe(`[Event "Castles Game"]\n\n1. A`);
    expect(PGNService.parsePGN(saved!).moves).toEqual(["A"]);
  });

  it("shareGame writes the PGN into the URL and clipboard", async () => {
    const getPGN = vi.fn(() => `[Event "Castles Game"]\n\n1. A`);
    const loadPGN = vi.fn();
    const clipboardWrite = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const originalClipboard = navigator.clipboard;
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWrite,
      },
    });
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const replaceState = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => usePersistence(getPGN, loadPGN, new MoveTree()));

    await act(async () => {
      result.current.shareGame();
    });

    const replacedUrl = replaceState.mock.calls[0][2] as string;
    const copiedUrl = clipboardWrite.mock.calls[0][0] as string;
    const replacedPgn = new URL(replacedUrl).searchParams.get("pgn");
    const copiedPgn = new URL(copiedUrl).searchParams.get("pgn");

    expect(replacedPgn).toBe(`[Event "Castles Game"]\n\n1. A`);
    expect(copiedPgn).toBe(`[Event "Castles Game"]\n\n1. A`);

    alert.mockRestore();
    replaceState.mockRestore();
    Object.assign(navigator, { clipboard: originalClipboard });
  });
});
