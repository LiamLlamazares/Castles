import { act } from "@testing-library/react";
import { canonicalState } from "../../test-utils/gameStateAssertions";
import { PGNService } from "../PGNService";
import { renderGameLogicHook } from "../../../hooks/test-utils/TestGameProviderUtils";
import { GameState } from "../../Core/GameState";
import { NotationService } from "../../Systems/NotationService";
import { Board } from "../../Core/Board";
import { GameEngine } from "../../Core/GameEngine";
import { Hex } from "../../Entities/Hex";
import { PieceFactory } from "../../Entities/PieceFactory";
import { PieceType } from "../../../Constants";
import { MoveTree } from "../../Core/MoveTree";
import { createPieceMap } from "../../../utils/PieceMap";
import { MovementMutator } from "../../Systems/Mutators/MovementMutator";
import { PromotionMutator } from "../../Systems/Mutators/PromotionMutator";
import { Castle } from "../../Entities/Castle";
import { RecruitmentMutator } from "../../Systems/Mutators/RecruitmentMutator";

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

const makeLegalMoveExcept = (
  result: ReturnType<typeof renderGameLogicHook>["result"],
  excludedNotation: string
): string => {
  const movablePieces = result.current.pieces.filter(
    (piece) => piece.color === result.current.currentPlayer && piece.canMove
  );

  for (const piece of movablePieces) {
    act(() => {
      result.current.handlePieceClick(piece);
    });

    for (const targetHexKey of Array.from(result.current.legalMoveSet)) {
      const targetHex = result.current.hexagons.find((hex) => hex.getKey() === targetHexKey);
      if (!targetHex) continue;

      const notation = NotationService.getMoveNotation(piece, targetHex);
      if (notation === excludedNotation) continue;

      act(() => {
        result.current.handleHexClick(targetHex);
      });
      return notation;
    }
  }

  throw new Error(`No legal move found different from ${excludedNotation}`);
};

const loadCurrentPgn = (pgn: string) => {
  const parsed = PGNService.parsePGN(pgn);
  expect(parsed.setup).not.toBeNull();
  const reconstructed = PGNService.reconstructState(parsed.setup!);
  const diagnostics: import("../PGNService").ReplayDiagnostic[] = [];
  const state = PGNService.replayMoveHistory(
    reconstructed.board,
    reconstructed.pieces,
    parsed.moveTree,
    reconstructed.sanctuaries,
    parsed.setup?.gameSettings,
    {
      diagnostics,
      initialSanctuaryPool: parsed.setup?.sanctuaryPool,
      initialTurnCounter: parsed.setup?.turnCounter,
    }
  );

  expect(diagnostics).toEqual([]);
  return { parsed, reconstructed, state };
};

describe("PGN export/import idempotence", () => {
  it("round-trips a live linear game without state drift", () => {
    const { result } = renderGameLogicHook();

    makeFirstLegalMove(result);
    act(() => {
      result.current.handlePass();
    });

    const pgn = result.current.getPGN();
    const { parsed, reconstructed, state } = loadCurrentPgn(pgn);

    expect(parsed.moves).toEqual(
      result.current.moveTree.getHistoryLine().map((move) => move.notation)
    );
    expect(canonicalState(state)).toEqual(canonicalState(result.current as GameState));

    const secondPgn = PGNService.generatePGN(
      reconstructed.board,
      state.moveTree.rootNode.snapshot?.pieces ?? state.pieces,
      state.moveTree.getHistoryLine(),
      state.moveTree.rootNode.snapshot?.sanctuaries ?? state.sanctuaries,
      {},
      state.moveTree,
      state.sanctuarySettings
        ? {
            sanctuaryUnlockTurn: state.sanctuarySettings.unlockTurn,
            sanctuaryRechargeTurns: state.sanctuarySettings.cooldown,
          }
        : undefined
    );

    const secondLoad = loadCurrentPgn(secondPgn);
    expect(canonicalState(secondLoad.state)).toEqual(canonicalState(state));
  });

  it("round-trips a branch created from analysis mode", () => {
    const { result } = renderGameLogicHook({ isAnalysisMode: true });

    makeFirstLegalMove(result);
    makeFirstLegalMove(result);
    const originalSecondMove = result.current.moveTree.getHistoryLine()[1].notation;
    const originalSecondState = canonicalState(result.current as GameState);

    act(() => {
      result.current.stepHistory(-1);
    });

    const branchMove = makeLegalMoveExcept(result, originalSecondMove);

    const pgn = result.current.getPGN();
    const { state } = loadCurrentPgn(pgn);
    const currentParent = state.moveTree.current.parent;

    expect(currentParent).toBeDefined();
    expect(currentParent?.children.length).toBeGreaterThanOrEqual(2);
    expect(state.moveTree.rootNode.children[0].snapshot).toBeDefined();

    const importedBranch = currentParent?.children.find(
      (child) => child.move.notation === branchMove
    );
    const importedMainlineSibling = currentParent?.children.find(
      (child) => child.move.notation === originalSecondMove
    );
    expect(importedBranch?.snapshot).toBeDefined();
    expect(importedMainlineSibling?.snapshot).toBeDefined();
    expect(canonicalState(importedBranch!.snapshot!)).toEqual(
      canonicalState(result.current as GameState)
    );
    expect(canonicalState(importedMainlineSibling!.snapshot!)).toEqual(
      originalSecondState
    );
  });

  it("round-trips a promoted swordsman move without treating it as recruitment", () => {
    const board = new Board({ nSquares: 3 });
    const swordsman = PieceFactory.create(PieceType.Swordsman, new Hex(0, -2, 2), "w");
    const initialState: GameState = {
      pieces: [swordsman],
      pieceMap: createPieceMap([swordsman]),
      castles: board.castles,
      sanctuaries: [],
      sanctuaryPool: [],
      turnCounter: 0,
      movingPiece: null,
      moveTree: new MoveTree(),
      graveyard: [],
      phoenixRecords: [],
      viewNodeId: null,
      promotionPending: null,
    };
    initialState.moveTree.rootNode.snapshot = {
      pieces: [swordsman.clone()],
      pieceMap: createPieceMap([swordsman.clone()]),
      castles: board.castles.map((castle) => castle.clone()),
      sanctuaries: [],
      sanctuaryPool: [],
      turnCounter: 0,
      graveyard: [],
      phoenixRecords: [],
    };

    const moved = MovementMutator.applyMove(initialState, swordsman, new Hex(0, -3, 3), board);
    const promoted = PromotionMutator.promote(moved, moved.promotionPending!, PieceType.Dragon);
    const pgn = PGNService.generatePGN(
      board,
      initialState.pieces,
      promoted.moveTree.getHistoryLine(),
      [],
      {},
      promoted.moveTree
    );

    const { state } = loadCurrentPgn(pgn);

    const replayedPiece = state.pieces.find((piece) => piece.hex.equals(new Hex(0, -3, 3)));
    expect(promoted.moveTree.getHistoryLine()[0].notation).toMatch(/=/);
    expect(replayedPiece?.type).toBe(PieceType.Dragon);
    expect(canonicalState(state)).toEqual(canonicalState(promoted));
  });

  it("round-trips recruitment with recruited type and castle progression intact", () => {
    const board = new Board({ nSquares: 3 });
    const castle = new Castle(new Hex(-3, 3, 0), "b", 1, false, "w");
    const spawnHex = new Hex(-2, 2, 0);
    const initialState: GameState = {
      pieces: [],
      pieceMap: createPieceMap([]),
      castles: [castle],
      sanctuaries: [],
      sanctuaryPool: [],
      turnCounter: 4,
      movingPiece: null,
      moveTree: new MoveTree(),
      graveyard: [],
      phoenixRecords: [],
      viewNodeId: null,
      promotionPending: null,
    };
    initialState.moveTree.rootNode.snapshot = {
      pieces: [],
      pieceMap: createPieceMap([]),
      castles: [castle.clone()],
      sanctuaries: [],
      sanctuaryPool: [],
      turnCounter: 4,
      graveyard: [],
      phoenixRecords: [],
    };

    const recruited = RecruitmentMutator.recruitPiece(initialState, castle, spawnHex, board);
    const pgn = PGNService.generatePGN(
      board,
      initialState.pieces,
      recruited.moveTree.getHistoryLine(),
      [],
      {},
      recruited.moveTree
    );

    const { state } = loadCurrentPgn(pgn);
    const replayedPiece = state.pieces.find((piece) => piece.hex.equals(spawnHex));
    const replayedCastle = state.castles.find((candidate) => candidate.hex.equals(castle.hex));

    expect(recruited.moveTree.getHistoryLine()[0].notation).toBe("H11=Arc");
    expect(replayedPiece?.type).toBe(PieceType.Archer);
    expect(replayedCastle?.turns_controlled).toBe(2);
    expect(replayedCastle?.used_this_turn).toBe(false);
    expect(canonicalState(state)).toEqual(canonicalState(recruited));
  });

  it("renders movetext from the root snapshot turn counter", () => {
    const board = new Board({ nSquares: 3 });
    const blackPiece = PieceFactory.create(PieceType.Archer, new Hex(0, -1, 1), "b");
    const initialState: GameState = {
      pieces: [blackPiece],
      pieceMap: createPieceMap([blackPiece]),
      castles: board.castles,
      sanctuaries: [],
      sanctuaryPool: [],
      turnCounter: 5,
      movingPiece: null,
      moveTree: new MoveTree(),
      graveyard: [],
      phoenixRecords: [],
      viewNodeId: null,
      promotionPending: null,
    };
    initialState.moveTree.rootNode.snapshot = {
      pieces: [blackPiece.clone()],
      pieceMap: createPieceMap([blackPiece]),
      castles: board.castles.map((castle) => castle.clone()),
      sanctuaries: [],
      sanctuaryPool: [],
      turnCounter: 5,
      graveyard: [],
      phoenixRecords: [],
    };

    const moved = MovementMutator.applyMove(initialState, blackPiece, new Hex(1, -2, 1), board);
    const pgn = PGNService.generatePGN(board, initialState.pieces, moved.moveTree.getHistoryLine(), [], {}, moved.moveTree);

    expect(pgn).toContain("1... J9K9");
  });

  it("round-trips pass phase advancement from a non-zero root snapshot", () => {
    const castle = new Castle(new Hex(0, 3, -3), "w", 0, false, "w");
    const board = new Board({ nSquares: 3 }, [castle]);
    const engine = new GameEngine(board);
    const initialState: GameState = {
      pieces: [],
      pieceMap: createPieceMap([]),
      castles: [castle],
      sanctuaries: [],
      sanctuaryPool: [],
      turnCounter: 3,
      movingPiece: null,
      moveTree: new MoveTree(),
      graveyard: [],
      phoenixRecords: [],
      viewNodeId: null,
      promotionPending: null,
    };
    initialState.moveTree.rootNode.snapshot = {
      pieces: [],
      pieceMap: createPieceMap([]),
      castles: [castle.clone()],
      sanctuaries: [],
      sanctuaryPool: [],
      turnCounter: 3,
      graveyard: [],
      phoenixRecords: [],
    };

    const passed = engine.passTurn(initialState);
    const pgn = PGNService.generatePGN(board, [], passed.moveTree.getHistoryLine(), [], {}, passed.moveTree);
    const { state } = loadCurrentPgn(pgn);

    expect(passed.moveTree.getHistoryLine()[0].notation).toBe("Pass");
    expect(state.turnCounter).toBe(passed.turnCounter);
    expect(canonicalState(state)).toEqual(canonicalState(passed));
  });
});
