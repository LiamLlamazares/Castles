/**
 * @file RandomAgent.test.ts
 * @description Tests for RandomAgent AI baseline.
 *
 * Validates that RandomAgent:
 * - Returns only legal actions
 * - Returns null when no actions available
 * - Can complete games without crashes or illegal moves
 */

import { RandomAgent } from "../Agents/RandomAgent";
import { AIContextBuilder } from "../AIContextBuilder";
import { GameEngine } from "../../Core/GameEngine";
import { GameState } from "../../Core/GameState";
import { Board } from "../../Core/Board";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { Castle } from "../../Entities/Castle";
import { MoveTree } from "../../Core/MoveTree";
import { RuleEngine } from "../../Systems/RuleEngine";
import { createPieceMap } from "../../../utils/PieceMap";
import { PieceType, Color } from "../../../Constants";

// Helper to create a minimal board for testing
const createTestBoard = (nSquares: number = 7) => {
  return new Board({ nSquares });
};

// Helper to create mock game state
const createMockState = (
  pieces: Piece[],
  castles: Castle[] = [],
  turnCounter: number = 0
): GameState => ({
  pieces,
  pieceMap: createPieceMap(pieces),
  castles,
  sanctuaries: [],
  sanctuaryPool: [],
  turnCounter,
  movingPiece: null,
  moveTree: new MoveTree(),
  graveyard: [],
  phoenixRecords: [],
  viewNodeId: null
});

describe("RandomAgent", () => {
  let board: Board;
  let gameEngine: GameEngine;
  let agent: RandomAgent;

  beforeEach(() => {
    board = createTestBoard();
    gameEngine = new GameEngine(board);
    agent = new RandomAgent(gameEngine, board);
  });

  describe("getNextAction", () => {
    it("returns a MoveCommand during Movement phase", async () => {
      // Place a white piece in the center
      const piece = new Piece(new Hex(0, 1, -1), "w", PieceType.Archer);
      const state = createMockState([piece], [], 0); // Turn 0 = Movement phase

      const action = await agent.getNextAction(state, board, "w");

      expect(action).not.toBeNull();
      expect(action?.type).toBe("MOVE");
    });

    it("returns null when no pieces can move", async () => {
      // Place a white piece that has already moved
      const piece = new Piece(new Hex(0, 1, -1), "w", PieceType.Archer, false); // canMove = false
      const state = createMockState([piece], [], 0);

      const action = await agent.getNextAction(state, board, "w");

      expect(action).toBeNull();
    });

    it("returns an AttackCommand during Attack phase when enemy is in range", async () => {
      // Setup: White archer at center, Black piece adjacent
      const attacker = new Piece(new Hex(0, 0, 0), "w", PieceType.Swordsman);
      // Swordsman attacks diagonally forward: (1, -1, 0) for white
      const victim = new Piece(new Hex(1, -1, 0), "b", PieceType.Archer);
      const state = createMockState([attacker, victim], [], 2); // Turn 2 = Attack phase

      const action = await agent.getNextAction(state, board, "w");

      expect(action).not.toBeNull();
      expect(action?.type).toBe("ATTACK");
    });

    it("returns null during Attack phase when no enemies in range", async () => {
      // White archer with no enemies nearby
      const piece = new Piece(new Hex(0, 1, -1), "w", PieceType.Archer);
      const state = createMockState([piece], [], 2); // Turn 2 = Attack phase

      const action = await agent.getNextAction(state, board, "w");

      expect(action).toBeNull();
    });

    it("returns a RecruitCommand during Recruitment phase with captured castle", async () => {
      // Setup a captured castle (originally black, now owned by white)
      const castleHex = new Hex(0, -7, 7);
      const castle = new Castle(castleHex, "b", 0, false, "w");
      const state = createMockState([], [castle], 4); // Turn 4 = Recruitment phase

      const action = await agent.getNextAction(state, board, "w");

      expect(action).not.toBeNull();
      expect(action?.type).toBe("RECRUIT");
    });

    it("does not return a RecruitCommand during Recruitment phase with controlled own-origin castle", async () => {
      const castleHex = new Hex(0, 7, -7);
      const castle = new Castle(castleHex, "w", 0, false, "w");
      const state = createMockState([], [castle], 4);

      const action = await agent.getNextAction(state, board, "w");

      expect(action).toBeNull();
    });
  });

  describe("AIContextBuilder integration", () => {
    it("builds context with correct phase", () => {
      const piece = new Piece(new Hex(0, 1, -1), "w", PieceType.Archer);
      const state = createMockState([piece], [], 0);

      const context = AIContextBuilder.build(state, board, gameEngine, "w");

      expect(context.phase).toBe("Movement");
      expect(context.myColor).toBe("w");
    });

    it("counts legal moves correctly", () => {
      // Archer at center should have 6 legal moves (all neighbors)
      const piece = new Piece(new Hex(0, 0, 0), "w", PieceType.Archer);
      const state = createMockState([piece], [], 0);

      const context = AIContextBuilder.build(state, board, gameEngine, "w");
      const count = AIContextBuilder.countActions(context);

      expect(count).toBe(6); // 6 neighbors for archer
    });

    it("returns empty maps for wrong phase", () => {
      const piece = new Piece(new Hex(0, 1, -1), "w", PieceType.Archer);
      const state = createMockState([piece], [], 2); // Attack phase

      const context = AIContextBuilder.build(state, board, gameEngine, "w");

      // Should have no moves during attack phase
      expect(context.legalMoves.size).toBe(0);
    });

    it("does not build actions for a non-active player", () => {
      const castle = new Castle(new Hex(0, -7, 7), "b", 0, false, "b");
      const state = createMockState([], [castle], 4); // White recruitment phase

      const context = AIContextBuilder.build(state, board, gameEngine, "b");

      expect(context.recruitOptions).toEqual([]);
      expect(AIContextBuilder.countActions(context)).toBe(0);
    });

    it("uses RuleEngine recruitment legality for AI spawn options", () => {
      const castle = new Castle(new Hex(0, -7, 7), "b", 0, false, "w");
      const blockingHex = new Hex(0, -6, 6);
      const blocker = new Piece(blockingHex, "w", PieceType.Swordsman);
      const state = createMockState([blocker], [castle], 4);
      const legalHexSet = new Set(
        RuleEngine.getRecruitmentHexes(state, board).map((hex) => hex.getKey())
      );

      const context = AIContextBuilder.build(state, board, gameEngine, "w");
      const aiSpawnHexes = context.recruitOptions.flatMap((option) => option.spawnHexes);

      expect(aiSpawnHexes.length).toBeGreaterThan(0);
      expect(aiSpawnHexes.every((hex) => legalHexSet.has(hex.getKey()))).toBe(true);
      expect(aiSpawnHexes.some((hex) => hex.equals(blockingHex))).toBe(false);
    });
  });
});
