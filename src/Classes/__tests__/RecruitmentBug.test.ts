/**
 * @file RecruitmentBug.test.ts
 * @description Diagnostic tests for the reported bug where pieces recruited
 * from castles (and sanctuaries) sometimes cannot move or attack.
 *
 * Hypothesis: Swordsmen recruited at captured enemy castles face "forward"
 * toward the board edge, leaving no legal moves. Other piece types should
 * be fine due to omnidirectional movement.
 */
import { Board } from '../Core/Board';
import { GameState } from '../Core/GameState';
import { Piece } from '../Entities/Piece';
import { Hex } from '../Entities/Hex';
import { Castle } from '../Entities/Castle';
import { PieceFactory } from '../Entities/PieceFactory';
import { RuleEngine } from '../Systems/RuleEngine';
import { RecruitmentMutator } from '../Systems/Mutators/RecruitmentMutator';
import { TurnMutator } from '../Systems/Mutators/TurnMutator';
import { PieceType, Color } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';
import { MoveTree } from '../Core/MoveTree';

// Board size matching production
const BOARD_SIZE = 8;

const createTestBoard = () => new Board({ nSquares: BOARD_SIZE });

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
  viewNodeId: null,
});

// Helper: get castle positions for the board
const getWhiteCastleHexes = (N: number): Hex[] => [
  new Hex(0, N, -N),     // bottom center
  new Hex(N, 0, -N),     // right (r=0, s<0 = white)
  new Hex(-N, N, 0),     // bottom-left
];

const getBlackCastleHexes = (N: number): Hex[] => [
  new Hex(0, -N, N),     // top center
  new Hex(-N, 0, N),     // left (r=0, s>0 = black)
  new Hex(N, -N, 0),     // top-right
];

// Helper: create castles for testing recruitment
const createCastles = (N: number): Castle[] => {
  const whiteCastles = getWhiteCastleHexes(N).map(h => new Castle(h, 'w', 0));
  const blackCastles = getBlackCastleHexes(N).map(h => new Castle(h, 'b', 0));
  return [...whiteCastles, ...blackCastles];
};

// Helper: find a valid spawn hex adjacent to a castle
const findSpawnHex = (castleHex: Hex, board: Board, occupiedHexes: Hex[] = []): Hex | null => {
  const occupiedSet = new Set(occupiedHexes.map(h => h.getKey()));
  const neighbors = castleHex.cubeRing(1);
  for (const n of neighbors) {
    if (board.hexSet.has(n.getKey()) && !occupiedSet.has(n.getKey())) {
      return n;
    }
  }
  return null;
};

describe('Recruitment Bug Diagnostics', () => {
  let board: Board;

  beforeEach(() => {
    board = createTestBoard();
  });

  // ================================================================
  // TEST GROUP 1: Piece initialization after recruitment
  // ================================================================
  describe('Piece initialization after recruitment', () => {
    it('recruited piece has canMove=true and canAttack=true', () => {
      const castles = createCastles(BOARD_SIZE);
      // Capture a black castle for white
      const capturedCastle = castles.find(c => c.color === 'b')!;
      const ownedCastle = capturedCastle.with({ owner: 'w', turns_controlled: 1 });
      const allCastles = castles.map(c =>
        c.hex.equals(capturedCastle.hex) ? ownedCastle : c
      );

      const spawnHex = findSpawnHex(ownedCastle.hex, board)!;
      expect(spawnHex).not.toBeNull();

      // Set up state at White's Recruitment phase (turnCounter=4)
      const state = createMockState([], allCastles, 4);
      const newState = RecruitmentMutator.recruitPiece(state, ownedCastle, spawnHex, board);

      // Find the newly recruited piece
      const recruited = newState.pieces.find(p => p.hex.equals(spawnHex));
      expect(recruited).toBeDefined();
      expect(recruited!.canMove).toBe(true);
      expect(recruited!.canAttack).toBe(true);
      expect(recruited!.damage).toBe(0);
    });

    it('recruited piece retains correct flags after turn reset', () => {
      const castles = createCastles(BOARD_SIZE);
      const capturedCastle = castles.find(c => c.color === 'b')!;
      const ownedCastle = capturedCastle.with({ owner: 'w', turns_controlled: 1 });
      const allCastles = castles.map(c =>
        c.hex.equals(capturedCastle.hex) ? ownedCastle : c
      );

      const spawnHex = findSpawnHex(ownedCastle.hex, board)!;

      // Simulate: White recruits at phase 4, turn advances to 5 (Black Movement)
      // Then simulate turn advancing to 10 (White Movement again)
      const state = createMockState([], allCastles, 4);
      const afterRecruit = RecruitmentMutator.recruitPiece(state, ownedCastle, spawnHex, board);

      // Simulate resetting at White's next turn start (turnCounter=10)
      const stateAtWhiteTurn = { ...afterRecruit, turnCounter: 10 };
      const afterReset = TurnMutator.resetTurnFlags(stateAtWhiteTurn);

      const recruited = afterReset.pieces.find(p => p.hex.equals(spawnHex));
      expect(recruited).toBeDefined();
      expect(recruited!.canMove).toBe(true);
      expect(recruited!.canAttack).toBe(true);
      expect(recruited!.damage).toBe(0);
    });
  });

  // ================================================================
  // TEST GROUP 2: Swordsman movement at enemy castles (KEY HYPOTHESIS)
  // ================================================================
  describe('Swordsman movement at enemy castle positions', () => {
    // White Swordsman recruited at captured BLACK castle — "forward" is toward r < 0 (off board)
    it('white Swordsman recruited at black castle (0, -N, N) has limited or no forward moves', () => {
      const castleHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE); // top center black castle
      const spawnHex = findSpawnHex(castleHex, board)!;
      expect(spawnHex).not.toBeNull();

      const swordsman = PieceFactory.create(PieceType.Swordsman, spawnHex, 'w');
      const castles = createCastles(BOARD_SIZE);
      const state = createMockState([swordsman], castles, 0); // White Movement phase

      const legalMoves = RuleEngine.getLegalMoves(swordsman, state, board);

      // Log which moves are available for diagnostic purposes
      console.log(`White Swordsman at ${spawnHex.getKey()} near black castle ${castleHex.getKey()}`);
      console.log(`Legal moves: ${legalMoves.map(h => h.getKey()).join(', ') || 'NONE'}`);
      console.log(`Number of legal moves: ${legalMoves.length}`);

      // This test documents the behavior — Swordsmen at enemy back row may have 0 moves
      // If 0 moves, this confirms the root cause of the reported bug
      if (legalMoves.length === 0) {
        console.warn('CONFIRMED: Swordsman has no legal moves at enemy back row. Promotion feature needed.');
      }
    });

    it('black Swordsman recruited at white castle (0, N, -N) has limited or no forward moves', () => {
      const castleHex = new Hex(0, BOARD_SIZE, -BOARD_SIZE); // bottom center white castle
      const spawnHex = findSpawnHex(castleHex, board)!;

      const swordsman = PieceFactory.create(PieceType.Swordsman, spawnHex, 'b');
      const castles = createCastles(BOARD_SIZE);
      // Black movement: turnCounter=5
      const state = createMockState([swordsman], castles, 5);

      const legalMoves = RuleEngine.getLegalMoves(swordsman, state, board);
      console.log(`Black Swordsman at ${spawnHex.getKey()} near white castle ${castleHex.getKey()}`);
      console.log(`Legal moves: ${legalMoves.map(h => h.getKey()).join(', ') || 'NONE'}`);

      if (legalMoves.length === 0) {
        console.warn('CONFIRMED: Black Swordsman has no legal moves at enemy back row.');
      }
    });

    // Test ALL 3 black castle positions for white swordsman
    it.each([
      { desc: 'top center', hex: new Hex(0, -BOARD_SIZE, BOARD_SIZE) },
      { desc: 'left', hex: new Hex(-BOARD_SIZE, 0, BOARD_SIZE) },
      { desc: 'top-right', hex: new Hex(BOARD_SIZE, -BOARD_SIZE, 0) },
    ])('white Swordsman at captured black castle ($desc)', ({ hex }) => {
      const spawnHex = findSpawnHex(hex, board);
      if (!spawnHex) {
        console.warn(`No spawn hex found adjacent to ${hex.getKey()}`);
        return;
      }

      const swordsman = PieceFactory.create(PieceType.Swordsman, spawnHex, 'w');
      const castles = createCastles(BOARD_SIZE);
      const state = createMockState([swordsman], castles, 0);
      const moves = RuleEngine.getLegalMoves(swordsman, state, board);

      console.log(`Castle ${hex.getKey()}, spawn ${spawnHex.getKey()}: ${moves.length} moves`);
    });
  });

  // ================================================================
  // TEST GROUP 3: Other piece types at enemy castles (should work fine)
  // ================================================================
  describe('Non-Swordsman pieces at enemy castle positions', () => {
    const piecesToTest: PieceType[] = [
      PieceType.Archer,
      PieceType.Knight,
      PieceType.Eagle,
      PieceType.Giant,
      PieceType.Trebuchet,
      PieceType.Assassin,
      PieceType.Dragon,
      PieceType.Monarch,
    ];

    it.each(piecesToTest.map(t => ({ type: t })))(
      '$type recruited at enemy castle has legal moves',
      ({ type }) => {
        const castleHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE); // black castle
        const spawnHex = findSpawnHex(castleHex, board)!;
        expect(spawnHex).not.toBeNull();

        const piece = PieceFactory.create(type, spawnHex, 'w');
        const castles = createCastles(BOARD_SIZE);
        const state = createMockState([piece], castles, 0); // White Movement

        const moves = RuleEngine.getLegalMoves(piece, state, board);

        // All non-Swordsman pieces should have at least 1 legal move
        // since they move in multiple/all directions
        expect(moves.length).toBeGreaterThan(0);
        console.log(`${type} at ${spawnHex.getKey()}: ${moves.length} moves`);
      }
    );
  });

  // ================================================================
  // TEST GROUP 4: Swordsman attack at enemy castles
  // ================================================================
  describe('Swordsman attack capability at enemy castle positions', () => {
    it('white Swordsman at enemy back row can attack enemy castles in forward diagonals', () => {
      const castleHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const spawnHex = findSpawnHex(castleHex, board)!;

      const swordsman = PieceFactory.create(PieceType.Swordsman, spawnHex, 'w');
      const castles = createCastles(BOARD_SIZE);
      // White Attack phase: turnCounter=2
      const state = createMockState([swordsman], castles, 2);

      const attacks = RuleEngine.getLegalAttacks(swordsman, state, board);
      console.log(`White Swordsman attacks at ${spawnHex.getKey()}: ${attacks.length}`);
      // May find enemy castle hexes in forward diagonals (castles are attackable targets)
      console.log(`Targets: ${attacks.map(h => h.getKey()).join(', ')}`);
    });

    it('white Swordsman at enemy back row CAN attack if enemy is in a forward diagonal', () => {
      const castleHex = new Hex(0, -BOARD_SIZE, BOARD_SIZE);
      const spawnHex = findSpawnHex(castleHex, board)!;

      const swordsman = PieceFactory.create(PieceType.Swordsman, spawnHex, 'w');

      // Place an enemy in a forward diagonal (toward r < 0 for white)
      // White swordsman forward attack dirs: (1, -1, 0), (0, -1, 1), (-1, 0, 1)
      const enemyHex = new Hex(
        spawnHex.q + 1,
        spawnHex.r - 1,
        spawnHex.s
      );

      let hasEnemy = false;
      if (board.hexSet.has(enemyHex.getKey())) {
        const enemy = PieceFactory.create(PieceType.Archer, enemyHex, 'b');
        const castles = createCastles(BOARD_SIZE);
        const state = createMockState([swordsman, enemy], castles, 2);

        const attacks = RuleEngine.getLegalAttacks(swordsman, state, board);
        console.log(`White Swordsman attacks with enemy at ${enemyHex.getKey()}: ${attacks.length}`);

        if (board.hexSet.has(enemyHex.getKey())) {
          hasEnemy = true;
          // Should be able to attack the enemy in forward diagonal
          expect(attacks.length).toBeGreaterThan(0);
        }
      }

      if (!hasEnemy) {
        console.warn(`Enemy hex ${enemyHex.getKey()} is off the board — attack test skipped`);
      }
    });
  });

  // ================================================================
  // TEST GROUP 5: Full recruitment flow with turn cycling
  // ================================================================
  describe('Full recruitment + turn cycle flow', () => {
    it('piece recruited by white is movable on whites next turn', () => {
      const castles = createCastles(BOARD_SIZE);
      // White captures a black castle
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({ owner: 'w', turns_controlled: 2 }); // Will recruit Archer (index 2 = Knight)
      const allCastles = castles.map(c =>
        c.hex.equals(blackCastle.hex) ? captured : c
      );

      const spawnHex = findSpawnHex(captured.hex, board)!;

      // White Recruitment phase (turnCounter=4)
      const state = createMockState([], allCastles, 4);
      const afterRecruit = RecruitmentMutator.recruitPiece(state, captured, spawnHex, board);

      const recruited = afterRecruit.pieces.find(p => p.hex.equals(spawnHex));
      expect(recruited).toBeDefined();

      // The piece should be a Knight (turns_controlled=2, RECRUITMENT_CYCLE[2] = Knight)
      expect(recruited!.type).toBe(PieceType.Knight);

      // Simulate: advance to White's next Movement phase (turnCounter=10)
      const stateAtNextWhiteTurn = { ...afterRecruit, turnCounter: 10 };
      const afterReset = TurnMutator.resetTurnFlags(stateAtNextWhiteTurn);

      const recruitedAfterReset = afterReset.pieces.find(p => p.hex.equals(spawnHex));
      expect(recruitedAfterReset!.canMove).toBe(true);

      // Verify the piece has legal moves
      const moves = RuleEngine.getLegalMoves(recruitedAfterReset!, afterReset, board);
      expect(moves.length).toBeGreaterThan(0);
    });

    it('multiple pieces recruited in same phase are all movable next turn', () => {
      const castles = createCastles(BOARD_SIZE);
      // Capture 2 black castles
      const blackCastles = castles.filter(c => c.color === 'b');
      const captured1 = blackCastles[0].with({ owner: 'w', turns_controlled: 1 });
      const captured2 = blackCastles[1].with({ owner: 'w', turns_controlled: 1 });

      const allCastles = castles.map(c => {
        if (c.hex.equals(captured1.hex)) return captured1;
        if (c.hex.equals(captured2.hex)) return captured2;
        return c;
      });

      const spawn1 = findSpawnHex(captured1.hex, board)!;
      const spawn2 = findSpawnHex(captured2.hex, board, [spawn1])!;

      // Recruit from first castle
      const state = createMockState([], allCastles, 4);
      const afterFirst = RecruitmentMutator.recruitPiece(state, captured1, spawn1, board);

      // Recruit from second castle (if turn counter allows — increment might be 0)
      const updatedCastle2 = afterFirst.castles.find(c => c.hex.equals(captured2.hex))!;

      // Check if we're still in Recruitment phase
      if (afterFirst.turnCounter % 5 === 4) {
        const afterSecond = RecruitmentMutator.recruitPiece(afterFirst, updatedCastle2, spawn2, board);

        // Simulate White's next turn
        const nextTurnState = { ...afterSecond, turnCounter: 10 };
        const afterReset = TurnMutator.resetTurnFlags(nextTurnState);

        const piece1 = afterReset.pieces.find(p => p.hex.equals(spawn1));
        const piece2 = afterReset.pieces.find(p => p.hex.equals(spawn2));

        expect(piece1!.canMove).toBe(true);
        expect(piece2!.canMove).toBe(true);

        // Both should be Archer (turns_controlled=1)
        expect(piece1!.type).toBe(PieceType.Archer);
        expect(piece2!.type).toBe(PieceType.Archer);
      }
    });
  });

  // ================================================================
  // TEST GROUP 6: PieceMap consistency after recruitment
  // ================================================================
  describe('PieceMap consistency', () => {
    it('PieceMap contains recruited piece after recruitment', () => {
      const castles = createCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({ owner: 'w', turns_controlled: 0 });
      const allCastles = castles.map(c =>
        c.hex.equals(blackCastle.hex) ? captured : c
      );

      const spawnHex = findSpawnHex(captured.hex, board)!;
      const state = createMockState([], allCastles, 4);
      const afterRecruit = RecruitmentMutator.recruitPiece(state, captured, spawnHex, board);

      // PieceMap should have the new piece
      const fromMap = afterRecruit.pieceMap.get(spawnHex);
      expect(fromMap).toBeDefined();
      expect(fromMap!.type).toBe(PieceType.Swordsman); // turns_controlled=0 → Swordsman
      expect(fromMap!.hex.equals(spawnHex)).toBe(true);
    });

    it('PieceMap and pieces array are in sync after recruitment', () => {
      const castles = createCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({ owner: 'w', turns_controlled: 3 });
      const allCastles = castles.map(c =>
        c.hex.equals(blackCastle.hex) ? captured : c
      );

      const existingPiece = PieceFactory.create(PieceType.Archer, new Hex(0, 1, -1), 'w');
      const spawnHex = findSpawnHex(captured.hex, board, [existingPiece.hex])!;
      const state = createMockState([existingPiece], allCastles, 4);
      const afterRecruit = RecruitmentMutator.recruitPiece(state, captured, spawnHex, board);

      // Every piece in pieces array should be in pieceMap
      for (const piece of afterRecruit.pieces) {
        const fromMap = afterRecruit.pieceMap.get(piece.hex);
        expect(fromMap).toBeDefined();
        expect(fromMap!.type).toBe(piece.type);
      }

      // PieceMap size should equal pieces array length
      expect(afterRecruit.pieces.length).toBe(2); // existing + recruited
    });
  });

  // ================================================================
  // TEST GROUP 7: Recruitment cycle correctness
  // ================================================================
  describe('Recruitment cycle piece types', () => {
    const RECRUITMENT_CYCLE = [
      PieceType.Swordsman,
      PieceType.Archer,
      PieceType.Knight,
      PieceType.Eagle,
      PieceType.Giant,
      PieceType.Trebuchet,
      PieceType.Assassin,
      PieceType.Dragon,
      PieceType.Monarch,
    ];

    it.each(
      RECRUITMENT_CYCLE.map((type, i) => ({ type, turnsControlled: i }))
    )('turns_controlled=$turnsControlled recruits $type', ({ type, turnsControlled }) => {
      const castles = createCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({ owner: 'w', turns_controlled: turnsControlled });
      const allCastles = castles.map(c =>
        c.hex.equals(blackCastle.hex) ? captured : c
      );

      const spawnHex = findSpawnHex(captured.hex, board)!;
      const state = createMockState([], allCastles, 4);
      const afterRecruit = RecruitmentMutator.recruitPiece(state, captured, spawnHex, board);

      const recruited = afterRecruit.pieces.find(p => p.hex.equals(spawnHex));
      expect(recruited).toBeDefined();
      expect(recruited!.type).toBe(type);
    });

    it('recruitment cycle wraps after 9 turns', () => {
      const castles = createCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({ owner: 'w', turns_controlled: 9 }); // 9 % 9 = 0
      const allCastles = castles.map(c =>
        c.hex.equals(blackCastle.hex) ? captured : c
      );

      const spawnHex = findSpawnHex(captured.hex, board)!;
      const state = createMockState([], allCastles, 4);
      const afterRecruit = RecruitmentMutator.recruitPiece(state, captured, spawnHex, board);

      const recruited = afterRecruit.pieces.find(p => p.hex.equals(spawnHex));
      expect(recruited!.type).toBe(PieceType.Swordsman); // wraps back to index 0
    });
  });
});
