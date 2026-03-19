/**
 * @file SwordsmanPromotion.test.ts
 * @description Tests for Swordsman promotion (Coronation) when reaching the back row.
 */
import { Board } from '../Core/Board';
import { GameState } from '../Core/GameState';
import { Piece } from '../Entities/Piece';
import { Hex } from '../Entities/Hex';
import { Castle } from '../Entities/Castle';
import { PieceFactory } from '../Entities/PieceFactory';
import { MovementMutator } from '../Systems/Mutators/MovementMutator';
import { PromotionMutator } from '../Systems/Mutators/PromotionMutator';
import { RuleEngine } from '../Systems/RuleEngine';
import { PieceType, Color } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';
import { MoveTree } from '../Core/MoveTree';

const BOARD_SIZE = 8;
const createTestBoard = () => new Board({ nSquares: BOARD_SIZE });

const createState = (
  pieces: Piece[],
  turnCounter: number = 0,
  castles: Castle[] = []
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
  viewNodeId: null,
});

describe('Swordsman Promotion (Coronation)', () => {
  let board: Board;

  beforeEach(() => {
    board = createTestBoard();
  });

  describe('Back row detection', () => {
    it('detects white back row at r = -N', () => {
      expect(board.isBackRow(new Hex(0, -BOARD_SIZE, BOARD_SIZE), 'w')).toBe(true);
      expect(board.isBackRow(new Hex(4, -BOARD_SIZE, BOARD_SIZE - 4), 'w')).toBe(true);
    });

    it('does not trigger on non-back-row hexes', () => {
      expect(board.isBackRow(new Hex(0, -BOARD_SIZE + 1, BOARD_SIZE - 1), 'w')).toBe(false);
      expect(board.isBackRow(new Hex(0, 0, 0), 'w')).toBe(false);
    });

    it('detects black back row at r = N', () => {
      expect(board.isBackRow(new Hex(0, BOARD_SIZE, -BOARD_SIZE), 'b')).toBe(true);
    });

    it('white back row is not black back row and vice versa', () => {
      expect(board.isBackRow(new Hex(0, -BOARD_SIZE, BOARD_SIZE), 'b')).toBe(false);
      expect(board.isBackRow(new Hex(0, BOARD_SIZE, -BOARD_SIZE), 'w')).toBe(false);
    });
  });

  describe('Promotion triggering on movement', () => {
    it('white Swordsman reaching r=-N triggers promotionPending', () => {
      // Place white Swordsman one row before back row
      const startHex = new Hex(0, -(BOARD_SIZE - 1), BOARD_SIZE - 1);
      const backRowHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const swordsman = PieceFactory.create(PieceType.Swordsman, startHex, 'w');

      // Need an enemy so the turn doesn't skip all the way
      const enemy = PieceFactory.create(PieceType.Archer, new Hex(4, -4, 0), 'b');
      const castles = board.castles;
      const state = createState([swordsman, enemy], 0, castles);

      const newState = MovementMutator.applyMove(state, swordsman, backRowHex, board);

      expect(newState.promotionPending).toBeDefined();
      expect(newState.promotionPending!.pieceHex.equals(backRowHex)).toBe(true);
      expect(newState.promotionPending!.options.length).toBeGreaterThan(0);
      // Monarch should NOT be in options
      expect(newState.promotionPending!.options).not.toContain(PieceType.Monarch);
    });

    it('black Swordsman reaching r=N triggers promotionPending', () => {
      const startHex = new Hex(0, BOARD_SIZE - 1, -(BOARD_SIZE - 1));
      const backRowHex = new Hex(0, BOARD_SIZE, -BOARD_SIZE);
      const swordsman = PieceFactory.create(PieceType.Swordsman, startHex, 'b');

      const enemy = PieceFactory.create(PieceType.Archer, new Hex(-4, 4, 0), 'w');
      const castles = board.castles;
      // Black movement phase: turnCounter=5
      const state = createState([swordsman, enemy], 5, castles);

      const newState = MovementMutator.applyMove(state, swordsman, backRowHex, board);

      expect(newState.promotionPending).toBeDefined();
      expect(newState.promotionPending!.pieceHex.equals(backRowHex)).toBe(true);
    });

    it('non-Swordsman moving to back row does NOT trigger promotion', () => {
      const startHex = new Hex(0, -(BOARD_SIZE - 1), BOARD_SIZE - 1);
      const backRowHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const archer = PieceFactory.create(PieceType.Archer, startHex, 'w');

      const enemy = PieceFactory.create(PieceType.Archer, new Hex(4, -4, 0), 'b');
      const castles = board.castles;
      const state = createState([archer, enemy], 0, castles);

      const newState = MovementMutator.applyMove(state, archer, backRowHex, board);

      expect(newState.promotionPending).toBeUndefined();
    });

    it('Swordsman moving to non-back-row does NOT trigger promotion', () => {
      const startHex = new Hex(0, 2, -2);
      const targetHex = new Hex(1, 1, -2);
      const swordsman = PieceFactory.create(PieceType.Swordsman, startHex, 'w');

      const enemy = PieceFactory.create(PieceType.Archer, new Hex(4, -4, 0), 'b');
      const castles = board.castles;
      const state = createState([swordsman, enemy], 0, castles);

      const newState = MovementMutator.applyMove(state, swordsman, targetHex, board);

      expect(newState.promotionPending).toBeUndefined();
    });
  });

  describe('Applying promotion', () => {
    it('promotes Swordsman to selected type', () => {
      const backRowHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const swordsman = PieceFactory.create(PieceType.Swordsman, backRowHex, 'w')
        .with({ canMove: false });

      const state: GameState = {
        ...createState([swordsman], 1),
        promotionPending: {
          pieceHex: backRowHex,
          options: [PieceType.Archer, PieceType.Knight, PieceType.Eagle,
                    PieceType.Giant, PieceType.Trebuchet, PieceType.Assassin, PieceType.Dragon],
        },
      };

      const promoted = PromotionMutator.applyPromotion(state, PieceType.Dragon);

      // Piece should now be a Dragon
      const piece = promoted.pieces.find(p => p.hex.equals(backRowHex));
      expect(piece).toBeDefined();
      expect(piece!.type).toBe(PieceType.Dragon);
      expect(piece!.color).toBe('w'); // Same color
      expect(promoted.promotionPending).toBeNull();
    });

    it('promoted piece has correct strength for new type', () => {
      const backRowHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const swordsman = PieceFactory.create(PieceType.Swordsman, backRowHex, 'w');

      const state: GameState = {
        ...createState([swordsman], 1),
        promotionPending: {
          pieceHex: backRowHex,
          options: [PieceType.Giant],
        },
      };

      const promoted = PromotionMutator.applyPromotion(state, PieceType.Giant);

      const piece = promoted.pieces.find(p => p.hex.equals(backRowHex));
      expect(piece!.Strength).toBe(2); // Giant has strength 2
    });

    it('promoted piece has correct movement for new type', () => {
      const backRowHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const swordsman = PieceFactory.create(PieceType.Swordsman, backRowHex, 'w');

      const state: GameState = {
        ...createState([swordsman], 10), // White Movement
        promotionPending: {
          pieceHex: backRowHex,
          options: [PieceType.Archer],
        },
      };

      const promoted = PromotionMutator.applyPromotion(state, PieceType.Archer);

      // The promoted piece should now have Archer movement (1 hex any dir)
      const piece = promoted.pieces.find(p => p.hex.equals(backRowHex));
      expect(piece!.type).toBe(PieceType.Archer);

      // Verify it has legal moves (Archer can move in any direction, unlike Swordsman)
      const promotedState = { ...promoted, turnCounter: 10 }; // Ensure Movement phase
      const resetState = { ...promotedState, pieces: promotedState.pieces.map(p => p.with({ canMove: true })), pieceMap: createPieceMap(promotedState.pieces.map(p => p.with({ canMove: true }))) };
      const moves = RuleEngine.getLegalMoves(
        resetState.pieces.find(p => p.hex.equals(backRowHex))!,
        resetState,
        board
      );
      expect(moves.length).toBeGreaterThan(0);
    });

    it('rejects invalid promotion type', () => {
      const backRowHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const swordsman = PieceFactory.create(PieceType.Swordsman, backRowHex, 'w');

      const state: GameState = {
        ...createState([swordsman], 1),
        promotionPending: {
          pieceHex: backRowHex,
          options: [PieceType.Archer, PieceType.Knight],
        },
      };

      expect(() => {
        PromotionMutator.applyPromotion(state, PieceType.Monarch);
      }).toThrow();
    });

    it('rejects promotion when no promotion is pending', () => {
      const state = createState([], 0);
      expect(() => {
        PromotionMutator.applyPromotion(state, PieceType.Archer);
      }).toThrow();
    });

    it('PieceMap is updated after promotion', () => {
      const backRowHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const swordsman = PieceFactory.create(PieceType.Swordsman, backRowHex, 'w');

      const state: GameState = {
        ...createState([swordsman], 1),
        promotionPending: {
          pieceHex: backRowHex,
          options: [PieceType.Knight],
        },
      };

      const promoted = PromotionMutator.applyPromotion(state, PieceType.Knight);

      const fromMap = promoted.pieceMap.get(backRowHex);
      expect(fromMap).toBeDefined();
      expect(fromMap!.type).toBe(PieceType.Knight);
    });
  });

  describe('Promotion options', () => {
    it('includes standard piece types but not Monarch or Swordsman', () => {
      const startHex = new Hex(0, -(BOARD_SIZE - 1), BOARD_SIZE - 1);
      const backRowHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const swordsman = PieceFactory.create(PieceType.Swordsman, startHex, 'w');
      const enemy = PieceFactory.create(PieceType.Archer, new Hex(4, -4, 0), 'b');
      const castles = board.castles;
      const state = createState([swordsman, enemy], 0, castles);

      const newState = MovementMutator.applyMove(state, swordsman, backRowHex, board);

      const options = newState.promotionPending!.options;
      expect(options).toContain(PieceType.Archer);
      expect(options).toContain(PieceType.Knight);
      expect(options).toContain(PieceType.Eagle);
      expect(options).toContain(PieceType.Giant);
      expect(options).toContain(PieceType.Trebuchet);
      expect(options).toContain(PieceType.Assassin);
      expect(options).toContain(PieceType.Dragon);
      expect(options).not.toContain(PieceType.Monarch);
      expect(options).not.toContain(PieceType.Swordsman);
    });
  });
});
