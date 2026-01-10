/**
 * @file StateValidator.test.ts
 * @description Tests for game state validation invariants.
 */
import { StateValidator, StateValidationResult } from "../StateValidator";
import { GameState } from "../../Core/GameState";
import { Board } from "../../Core/Board";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { PieceType } from "../../../Constants";
import { createPieceMap } from "../../../utils/PieceMap";
import { MoveTree } from "../../Core/MoveTree";

function createMinimalState(pieces: Piece[]): GameState {
  return {
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: [],
    sanctuaries: [],
    sanctuaryPool: [],
    turnCounter: 0,
    movingPiece: null,
    history: [],
    moveHistory: [],
    moveTree: new MoveTree(),
    graveyard: [],
    phoenixRecords: [],
  };
}

describe("StateValidator", () => {
  const board = new Board({ nSquares: 8 });

  describe("validateNoDuplicatePieces", () => {
    it("should return no errors for unique positions", () => {
      const pieces = [
        new Piece(new Hex(0, 1, -1), "w", PieceType.Swordsman),
        new Piece(new Hex(1, 0, -1), "b", PieceType.Swordsman),
      ];
      const state = createMinimalState(pieces);
      const errors = StateValidator.validate(state, board);
      
      expect(errors.filter(e => e.code === "DUPLICATE_PIECE_POSITION")).toHaveLength(0);
    });

    it("should detect two pieces on the same hex", () => {
      const sameHex = new Hex(0, 1, -1);
      const pieces = [
        new Piece(sameHex, "w", PieceType.Swordsman),
        new Piece(sameHex, "b", PieceType.Knight),
      ];
      const state = createMinimalState(pieces);
      const errors = StateValidator.validate(state, board);
      
      const duplicateErrors = errors.filter(e => e.code === "DUPLICATE_PIECE_POSITION");
      expect(duplicateErrors).toHaveLength(1);
      expect(duplicateErrors[0].details?.hex).toBe(sameHex.getKey());
    });
  });

  describe("validatePiecesOnBoard", () => {
    it("should return no errors for pieces on valid hexes", () => {
      const pieces = [
        new Piece(new Hex(0, 1, -1), "w", PieceType.Archer),
      ];
      const state = createMinimalState(pieces);
      const errors = StateValidator.validate(state, board);
      
      expect(errors.filter(e => e.code === "PIECE_OFF_BOARD")).toHaveLength(0);
    });

    it("should detect pieces off the board", () => {
      const offBoardHex = new Hex(100, 100, -200); // Way off board
      const pieces = [
        new Piece(offBoardHex, "w", PieceType.Dragon),
      ];
      const state = createMinimalState(pieces);
      const errors = StateValidator.validate(state, board);
      
      const offBoardErrors = errors.filter(e => e.code === "PIECE_OFF_BOARD");
      expect(offBoardErrors).toHaveLength(1);
    });
  });

  describe("validateTurnCounter", () => {
    it("should return no errors for valid turn counter", () => {
      const state = createMinimalState([]);
      state.turnCounter = 10;
      const errors = StateValidator.validate(state, board);
      
      expect(errors.filter(e => e.code === "INVALID_TURN_COUNTER")).toHaveLength(0);
    });

    it("should detect negative turn counter", () => {
      const state = createMinimalState([]);
      (state as any).turnCounter = -5;
      const errors = StateValidator.validate(state, board);
      
      const turnErrors = errors.filter(e => e.code === "INVALID_TURN_COUNTER");
      expect(turnErrors).toHaveLength(1);
    });
  });

  describe("validatePieceMapSync", () => {
    it("should detect desync between pieces and pieceMap", () => {
      const pieces = [
        new Piece(new Hex(0, 1, -1), "w", PieceType.Knight),
      ];
      const state = createMinimalState(pieces);
      // Manually corrupt the pieceMap
      state.pieceMap = createPieceMap([]);
      
      const errors = StateValidator.validate(state, board);
      
      expect(errors.filter(e => e.code === "PIECE_MAP_DESYNC")).toHaveLength(1);
    });
  });

  describe("assertValid", () => {
    it("should throw for invalid state", () => {
      const sameHex = new Hex(0, 1, -1);
      const pieces = [
        new Piece(sameHex, "w", PieceType.Swordsman),
        new Piece(sameHex, "b", PieceType.Knight),
      ];
      const state = createMinimalState(pieces);
      
      expect(() => StateValidator.assertValid(state, board)).toThrow("Invalid game state");
    });

    it("should not throw for valid state", () => {
      const pieces = [
        new Piece(new Hex(0, 1, -1), "w", PieceType.Swordsman),
      ];
      const state = createMinimalState(pieces);
      
      expect(() => StateValidator.assertValid(state, board)).not.toThrow();
    });
  });
});
