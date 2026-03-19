/**
 * Tests for Swordsman promotion (Coronation).
 *
 * Rules:
 * - Swordsman promotes when reaching the opponent's back row
 * - Back row = two outermost edges on opponent's side (r=±N or s=∓N), excluding river (r=0)
 * - Can promote to any standard piece except Monarch
 */
import { Board } from '../Core/Board';
import { Hex } from '../Entities/Hex';
import { Piece } from '../Entities/Piece';
import { PieceFactory } from '../Entities/PieceFactory';
import { GameState } from '../Core/GameState';
import { MoveTree } from '../Core/MoveTree';
import { MovementMutator } from '../Systems/Mutators/MovementMutator';
import { PromotionMutator } from '../Systems/Mutators/PromotionMutator';
import { PieceType, PROMOTABLE_TYPES } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';

// Helper to create a minimal GameState for testing
function createTestState(pieces: Piece[], turnCounter: number = 0): GameState {
  return {
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: [],
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

describe('Board.isPromotionHex', () => {
  const board = new Board({ nSquares: 7 });

  describe('white swordsman promotion (black back row)', () => {
    it('should detect r=-N hexes as promotion hexes', () => {
      // Top-right edge: r = -7
      expect(board.isPromotionHex(new Hex(0, -7, 7), 'w')).toBe(true);
      expect(board.isPromotionHex(new Hex(3, -7, 4), 'w')).toBe(true);
      expect(board.isPromotionHex(new Hex(7, -7, 0), 'w')).toBe(true);
    });

    it('should detect s=N hexes as promotion hexes', () => {
      // Top-left edge: s = 7
      expect(board.isPromotionHex(new Hex(-6, -1, 7), 'w')).toBe(true);
      expect(board.isPromotionHex(new Hex(-3, -4, 7), 'w')).toBe(true);
    });

    it('should exclude river hexes (r=0)', () => {
      // (-7, 0, 7) is on the edge but at r=0 (river)
      expect(board.isPromotionHex(new Hex(-7, 0, 7), 'w')).toBe(false);
    });

    it('should NOT trigger for interior hexes', () => {
      expect(board.isPromotionHex(new Hex(0, -3, 3), 'w')).toBe(false);
      expect(board.isPromotionHex(new Hex(0, 0, 0), 'w')).toBe(false);
    });
  });

  describe('black swordsman promotion (white back row)', () => {
    it('should detect r=N hexes as promotion hexes', () => {
      // Bottom-left edge: r = 7
      expect(board.isPromotionHex(new Hex(0, 7, -7), 'b')).toBe(true);
      expect(board.isPromotionHex(new Hex(-3, 7, -4), 'b')).toBe(true);
    });

    it('should detect s=-N hexes as promotion hexes', () => {
      // Bottom-right edge: s = -7
      expect(board.isPromotionHex(new Hex(3, 4, -7), 'b')).toBe(true);
      expect(board.isPromotionHex(new Hex(6, 1, -7), 'b')).toBe(true);
    });

    it('should exclude river hexes (r=0)', () => {
      expect(board.isPromotionHex(new Hex(7, 0, -7), 'b')).toBe(false);
    });
  });

  it('should work for different board sizes', () => {
    const smallBoard = new Board({ nSquares: 4 });
    expect(smallBoard.isPromotionHex(new Hex(0, -4, 4), 'w')).toBe(true);
    expect(smallBoard.isPromotionHex(new Hex(-3, -1, 4), 'w')).toBe(true);
    expect(smallBoard.isPromotionHex(new Hex(0, -3, 3), 'w')).toBe(false);
  });
});

describe('MovementMutator promotion detection', () => {
  const board = new Board({ nSquares: 7 });

  it('should set promotionPending when swordsman reaches back row', () => {
    const swordsman = PieceFactory.create(PieceType.Swordsman, new Hex(0, -6, 6), 'w');
    const state = createTestState([swordsman]);
    const targetHex = new Hex(0, -7, 7); // back row

    const newState = MovementMutator.applyMove(state, swordsman, targetHex, board);

    expect(newState.promotionPending).not.toBeNull();
    expect(newState.promotionPending!.hex.equals(targetHex)).toBe(true);
  });

  it('should NOT set promotionPending for non-swordsman pieces', () => {
    const knight = PieceFactory.create(PieceType.Knight, new Hex(0, -6, 6), 'w');
    const state = createTestState([knight]);
    const targetHex = new Hex(0, -7, 7);

    const newState = MovementMutator.applyMove(state, knight, targetHex, board);

    expect(newState.promotionPending).toBeFalsy();
  });

  it('should NOT set promotionPending for moves that do not reach back row', () => {
    const swordsman = PieceFactory.create(PieceType.Swordsman, new Hex(0, -4, 4), 'w');
    const state = createTestState([swordsman]);
    const targetHex = new Hex(0, -5, 5); // not back row

    const newState = MovementMutator.applyMove(state, swordsman, targetHex, board);

    expect(newState.promotionPending).toBeFalsy();
  });
});

describe('PromotionMutator', () => {
  it('should replace swordsman with promoted piece type', () => {
    const swordsman = PieceFactory.create(PieceType.Swordsman, new Hex(0, -7, 7), 'w');
    const state = createTestState([swordsman]);
    state.promotionPending = swordsman;

    const newState = PromotionMutator.promote(state, swordsman, PieceType.Dragon);

    expect(newState.promotionPending).toBeNull();
    const promoted = newState.pieces.find(p => p.hex.equals(new Hex(0, -7, 7)));
    expect(promoted).toBeDefined();
    expect(promoted!.type).toBe(PieceType.Dragon);
    expect(promoted!.color).toBe('w');
  });

  it('should preserve piece color after promotion', () => {
    const swordsman = PieceFactory.create(PieceType.Swordsman, new Hex(0, 7, -7), 'b');
    const state = createTestState([swordsman]);

    const newState = PromotionMutator.promote(state, swordsman, PieceType.Knight);

    const promoted = newState.pieces[0];
    expect(promoted.color).toBe('b');
    expect(promoted.type).toBe(PieceType.Knight);
  });

  it('should allow promotion to all PROMOTABLE_TYPES', () => {
    for (const type of PROMOTABLE_TYPES) {
      const swordsman = PieceFactory.create(PieceType.Swordsman, new Hex(0, -7, 7), 'w');
      const state = createTestState([swordsman]);

      const newState = PromotionMutator.promote(state, swordsman, type);
      expect(newState.pieces[0].type).toBe(type);
    }
  });

  it('should reject promotion to Monarch', () => {
    const swordsman = PieceFactory.create(PieceType.Swordsman, new Hex(0, -7, 7), 'w');
    const state = createTestState([swordsman]);

    const newState = PromotionMutator.promote(state, swordsman, PieceType.Monarch);

    // Should be unchanged — promotion rejected
    expect(newState.pieces[0].type).toBe(PieceType.Swordsman);
  });

  it('should reject promotion of non-swordsman pieces', () => {
    const knight = PieceFactory.create(PieceType.Knight, new Hex(0, -7, 7), 'w');
    const state = createTestState([knight]);

    const newState = PromotionMutator.promote(state, knight, PieceType.Dragon);

    expect(newState.pieces[0].type).toBe(PieceType.Knight);
  });

  it('should update PieceMap after promotion', () => {
    const swordsman = PieceFactory.create(PieceType.Swordsman, new Hex(0, -7, 7), 'w');
    const state = createTestState([swordsman]);

    const newState = PromotionMutator.promote(state, swordsman, PieceType.Eagle);

    const fromMap = newState.pieceMap.getByKey(new Hex(0, -7, 7).getKey());
    expect(fromMap).toBeDefined();
    expect(fromMap!.type).toBe(PieceType.Eagle);
  });
});
