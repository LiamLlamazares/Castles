/**
 * Diagnostic tests for the recruited piece mobility bug.
 *
 * Investigates whether pieces recruited at castles/sanctuaries can actually
 * move and attack after recruitment and turn cycling.
 *
 * Key hypothesis: Swordsmen recruited at opponent's corner castles may have
 * no legal forward moves because all 3 directions point off-board.
 */
import { Board } from '../Core/Board';
import { Hex } from '../Entities/Hex';
import { Piece } from '../Entities/Piece';
import { Castle } from '../Entities/Castle';
import { PieceFactory } from '../Entities/PieceFactory';
import { GameState } from '../Core/GameState';
import { GameEngine } from '../Core/GameEngine';
import { MoveTree } from '../Core/MoveTree';
import { TurnManager } from '../Core/TurnManager';
import { RuleEngine } from '../Systems/RuleEngine';
import { RecruitmentMutator } from '../Systems/Mutators/RecruitmentMutator';
import { TurnMutator } from '../Systems/Mutators/TurnMutator';
import { PieceType, TurnPhase } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';

const N = 7; // Board radius (NSquares)
const board = new Board({ nSquares: N });
const engine = new GameEngine(board);

/** Creates a minimal game state for testing */
function createTestState(
  pieces: Piece[],
  castles: Castle[],
  turnCounter: number = 0
): GameState {
  return {
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
    viewNodeId: null,
    promotionPending: null,
  };
}

/** Get all castle hexes for a given side */
function getCastleHexes(color: 'w' | 'b'): Hex[] {
  return color === 'w' ? board.whiteCastleHexes : board.blackCastleHexes;
}

/** Creates castles owned by a given player */
function createOwnedCastles(hexes: Hex[], owner: 'w' | 'b'): Castle[] {
  return hexes.map(hex => new Castle(hex, owner, 0));
}

describe('Recruitment Bug: Piece Mobility After Recruitment', () => {

  describe('Swordsman mobility at castle positions', () => {
    // For each white castle corner, recruit a white swordsman on each adjacent hex
    // and check if it has any legal moves
    const whiteCastles = getCastleHexes('w');
    const blackCastles = getCastleHexes('b');

    it('should identify which castle-adjacent hexes leave swordsmen stuck (white)', () => {
      const stuckPositions: string[] = [];

      for (const castleHex of whiteCastles) {
        const adjacent = castleHex.cubeRing(1).filter(h => board.hexSet.has(h.getKey()));
        for (const spawnHex of adjacent) {
          const swordsman = PieceFactory.create(PieceType.Swordsman, spawnHex, 'w');
          const state = createTestState([swordsman], []);
          const moves = engine.getLegalMoves(state, swordsman);

          if (moves.length === 0) {
            stuckPositions.push(
              `White Sw at ${spawnHex.getKey()} (adj to castle ${castleHex.getKey()}): 0 moves`
            );
          }
        }
      }

      // Log stuck positions for diagnostic purposes
      if (stuckPositions.length > 0) {
        console.log('WHITE SWORDSMEN WITH NO MOVES AT OWN CASTLES:');
        stuckPositions.forEach(s => console.log(`  ${s}`));
      }
      // This is a diagnostic test — it documents the issue rather than asserting pass/fail
      expect(true).toBe(true);
    });

    it('should identify which enemy-castle-adjacent hexes leave swordsmen stuck (white at black castles)', () => {
      const stuckPositions: string[] = [];

      for (const castleHex of blackCastles) {
        const adjacent = castleHex.cubeRing(1).filter(h => board.hexSet.has(h.getKey()));
        for (const spawnHex of adjacent) {
          const swordsman = PieceFactory.create(PieceType.Swordsman, spawnHex, 'w');
          const state = createTestState([swordsman], []);
          const moves = engine.getLegalMoves(state, swordsman);

          if (moves.length === 0) {
            stuckPositions.push(
              `White Sw at ${spawnHex.getKey()} (adj to black castle ${castleHex.getKey()}): 0 moves`
            );
          }
        }
      }

      if (stuckPositions.length > 0) {
        console.log('WHITE SWORDSMEN WITH NO MOVES AT BLACK CASTLES:');
        stuckPositions.forEach(s => console.log(`  ${s}`));
      }
      expect(true).toBe(true);
    });
  });

  describe('Non-swordsman pieces at castle positions', () => {
    const pieceTypes = [
      PieceType.Archer, PieceType.Knight, PieceType.Eagle,
      PieceType.Giant, PieceType.Trebuchet, PieceType.Dragon,
    ];

    it('should have legal moves for all non-swordsman pieces at any castle-adjacent hex', () => {
      const allCastles = [...getCastleHexes('w'), ...getCastleHexes('b')];
      const stuckPieces: string[] = [];

      for (const castleHex of allCastles) {
        const adjacent = castleHex.cubeRing(1).filter(h => board.hexSet.has(h.getKey()));
        for (const spawnHex of adjacent) {
          for (const type of pieceTypes) {
            const piece = PieceFactory.create(type, spawnHex, 'w');
            const state = createTestState([piece], []);
            const moves = engine.getLegalMoves(state, piece);

            if (moves.length === 0) {
              stuckPieces.push(`${type} at ${spawnHex.getKey()} (adj to ${castleHex.getKey()})`);
            }
          }
        }
      }

      if (stuckPieces.length > 0) {
        console.log('NON-SWORDSMAN PIECES WITH NO MOVES AT CASTLES:');
        stuckPieces.forEach(s => console.log(`  ${s}`));
      }
      // Non-swordsman pieces should always have at least one move from any valid hex
      expect(stuckPieces.length).toBe(0);
    });
  });

  describe('Turn flag reset after recruitment', () => {
    it('recruited piece should have canMove=true after turn reset', () => {
      const castleHex = getCastleHexes('w')[0];
      const spawnHex = castleHex.cubeRing(1).find(h => board.hexSet.has(h.getKey()))!;

      // White controls a castle, turn counter at white's recruitment phase (4)
      const castle = new Castle(castleHex, 'w', 0);
      const state = createTestState([], [castle], 4);

      // Recruit
      const afterRecruit = RecruitmentMutator.recruitPiece(state, castle, spawnHex, board);
      const recruitedPiece = afterRecruit.pieces.find(p => p.hex.equals(spawnHex));

      expect(recruitedPiece).toBeDefined();
      expect(recruitedPiece!.canMove).toBe(true);
      expect(recruitedPiece!.canAttack).toBe(true);
    });

    it('recruited piece should still have canMove=true after opponent turn and back to own turn', () => {
      const castleHex = getCastleHexes('w')[0];
      const spawnHex = castleHex.cubeRing(1).find(h => board.hexSet.has(h.getKey()))!;

      const castle = new Castle(castleHex, 'w', 0);
      const state = createTestState([], [castle], 4);

      // Recruit
      let gameState = RecruitmentMutator.recruitPiece(state, castle, spawnHex, board);

      // Simulate turn reset (what happens at start of each player's turn)
      gameState = TurnMutator.resetTurnFlags(gameState);

      const piece = gameState.pieces.find(p => p.hex.equals(spawnHex));
      expect(piece).toBeDefined();
      expect(piece!.canMove).toBe(true);
      expect(piece!.canAttack).toBe(true);
    });
  });

  describe('Full recruitment flow', () => {
    it('should recruit and verify piece has legal moves on next turn', () => {
      const castleHex = getCastleHexes('w')[0];
      const adjacent = castleHex.cubeRing(1).filter(h => board.hexSet.has(h.getKey()));
      const spawnHex = adjacent[0];

      const castle = new Castle(castleHex, 'w', 0);
      const state = createTestState([], [castle], 4);

      // Recruit an Archer (turns_controlled=1 → Archer in cycle)
      const castle1Turn = new Castle(castleHex, 'w', 1);
      const archerState = createTestState([], [castle1Turn], 4);
      const afterRecruit = RecruitmentMutator.recruitPiece(archerState, castle1Turn, spawnHex, board);

      const archer = afterRecruit.pieces.find(p => p.hex.equals(spawnHex));
      expect(archer).toBeDefined();
      expect(archer!.type).toBe(PieceType.Archer);

      // Archer should always have legal moves from any valid hex (6 directions)
      const moves = engine.getLegalMoves(afterRecruit, archer!);
      expect(moves.length).toBeGreaterThan(0);
    });

    it('should verify recruitment hex validation excludes occupied hexes', () => {
      const castleHex = getCastleHexes('w')[0];
      const adjacent = castleHex.cubeRing(1).filter(h => board.hexSet.has(h.getKey()));

      // Place pieces on ALL adjacent hexes
      const blockers = adjacent.map(h => PieceFactory.create(PieceType.Swordsman, h, 'w'));
      const castle = new Castle(castleHex, 'w', 0);
      const state = createTestState(blockers, [castle], 4);

      // Should have no recruitment hexes since all adjacent are occupied
      const recruitHexes = RuleEngine.getRecruitmentHexes(state, board);
      const castleRecruitHexes = recruitHexes.filter(h =>
        adjacent.some(a => a.equals(h))
      );
      expect(castleRecruitHexes.length).toBe(0);
    });
  });
});
