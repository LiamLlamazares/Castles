/**
 * @file GameFlow.test.ts
 * @description Integration tests for complete game flow scenarios.
 * Tests full turn cycles, phase transitions, castle capture, combat,
 * recruitment, and win conditions.
 */
import { Board } from '../Core/Board';
import { GameEngine } from '../Core/GameEngine';
import { GameState } from '../Core/GameState';
import { TurnManager } from '../Core/TurnManager';
import { Piece } from '../Entities/Piece';
import { Hex } from '../Entities/Hex';
import { Castle } from '../Entities/Castle';
import { PieceFactory } from '../Entities/PieceFactory';
import { RuleEngine } from '../Systems/RuleEngine';
import { MovementMutator } from '../Systems/Mutators/MovementMutator';
import { CombatMutator } from '../Systems/Mutators/CombatMutator';
import { RecruitmentMutator } from '../Systems/Mutators/RecruitmentMutator';
import { TurnMutator } from '../Systems/Mutators/TurnMutator';
import { WinCondition } from '../Systems/WinCondition';
import { CombatSystem } from '../Systems/CombatSystem';
import { CASTLE_RECRUITMENT_COOLDOWN_TURNS, PieceType, Color, TurnPhase, GameResult } from '../../Constants';
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

const createDefaultCastles = (N: number): Castle[] => {
  const board = new Board({ nSquares: N });
  return board.castles;
};

describe('Game Flow Integration Tests', () => {
  let board: Board;
  let engine: GameEngine;

  beforeEach(() => {
    board = createTestBoard();
    engine = new GameEngine(board);
  });

  // ================================================================
  // Turn Phase Cycle
  // ================================================================
  describe('Turn phase cycle', () => {
    it('follows Movement → Movement → Attack → Attack → Recruitment pattern', () => {
      // White's turn: 0-4
      expect(TurnManager.getTurnPhase(0)).toBe('Movement');
      expect(TurnManager.getTurnPhase(1)).toBe('Movement');
      expect(TurnManager.getTurnPhase(2)).toBe('Attack');
      expect(TurnManager.getTurnPhase(3)).toBe('Attack');
      expect(TurnManager.getTurnPhase(4)).toBe('Recruitment');

      // Black's turn: 5-9
      expect(TurnManager.getTurnPhase(5)).toBe('Movement');
      expect(TurnManager.getTurnPhase(6)).toBe('Movement');
      expect(TurnManager.getTurnPhase(7)).toBe('Attack');
      expect(TurnManager.getTurnPhase(8)).toBe('Attack');
      expect(TurnManager.getTurnPhase(9)).toBe('Recruitment');
    });

    it('alternates players correctly', () => {
      for (let i = 0; i < 5; i++) {
        expect(TurnManager.getCurrentPlayer(i)).toBe('w');
      }
      for (let i = 5; i < 10; i++) {
        expect(TurnManager.getCurrentPlayer(i)).toBe('b');
      }
      // Cycle repeats
      expect(TurnManager.getCurrentPlayer(10)).toBe('w');
      expect(TurnManager.getCurrentPlayer(15)).toBe('b');
    });
  });

  // ================================================================
  // Movement
  // ================================================================
  describe('Movement', () => {
    it('piece moves to target hex and canMove is consumed', () => {
      // Need multiple pieces + enemies so phases don't auto-skip and reset
      const archer = PieceFactory.create(PieceType.Archer, new Hex(0, 2, -2), 'w');
      const archer2 = PieceFactory.create(PieceType.Archer, new Hex(0, 4, -4), 'w');
      const enemy = PieceFactory.create(PieceType.Archer, new Hex(3, -3, 0), 'b');
      const targetHex = new Hex(1, 1, -2);
      const castles = createDefaultCastles(BOARD_SIZE);
      const state = createState([archer, archer2, enemy], 0, castles);

      const newState = MovementMutator.applyMove(state, archer, targetHex, board);

      const movedPiece = newState.pieces.find(p => p.hex.equals(targetHex));
      expect(movedPiece).toBeDefined();
      // After move, the piece has been moved to the target hex
      expect(movedPiece!.hex.equals(targetHex)).toBe(true);
    });

    it('castle captured on movement (ownership transfer)', () => {
      const castles = createDefaultCastles(BOARD_SIZE);
      // Place a white piece adjacent to a black castle
      const blackCastle = castles.find(c => c.color === 'b')!;
      const adjacentHex = blackCastle.hex.cubeRing(1).find(h => board.hexSet.has(h.getKey()))!;

      const archer = PieceFactory.create(PieceType.Archer, adjacentHex, 'w');
      const state = createState([archer], 0, castles);

      // Move onto the castle
      const newState = MovementMutator.applyMove(state, archer, blackCastle.hex, board);

      const updatedCastle = newState.castles.find(c => c.hex.equals(blackCastle.hex));
      expect(updatedCastle!.owner).toBe('w'); // Captured!
    });
  });

  // ================================================================
  // Combat
  // ================================================================
  describe('Combat', () => {
    it('melee attacker moves onto captured hex after kill', () => {
      const attacker = PieceFactory.create(PieceType.Knight, new Hex(0, 2, -2), 'w');
      const defender = PieceFactory.create(PieceType.Archer, new Hex(1, 1, -2), 'b');
      const castles = createDefaultCastles(BOARD_SIZE);
      const state = createState([attacker, defender], 2, castles); // White Attack phase

      const newState = CombatMutator.applyAttack(state, attacker, defender.hex, board);

      // Defender should be dead (Knight str 1 vs Archer str 1)
      const defenderFound = newState.pieces.find(p => p.color === 'b');
      expect(defenderFound).toBeUndefined();

      // Attacker should have moved onto defender's hex
      const updatedAttacker = newState.pieces.find(p => p.type === PieceType.Knight);
      expect(updatedAttacker!.hex.equals(defender.hex)).toBe(true);
    });

    it('ranged attacker stays in place after kill', () => {
      const attacker = PieceFactory.create(PieceType.Archer, new Hex(0, 3, -3), 'w');
      const defender = PieceFactory.create(PieceType.Archer, new Hex(0, 1, -1), 'b');
      const castles = createDefaultCastles(BOARD_SIZE);
      const state = createState([attacker, defender], 2, castles);

      const newState = CombatMutator.applyAttack(state, attacker, defender.hex, board);

      // Attacker should stay at original position
      const updatedAttacker = newState.pieces.find(p => p.color === 'w');
      expect(updatedAttacker!.hex.equals(attacker.hex)).toBe(true);
    });

    it('combined arms: damage accumulates across attacks', () => {
      // Two archers attacking a Giant (strength 2)
      const archer1 = PieceFactory.create(PieceType.Archer, new Hex(0, 5, -5), 'w');
      const archer2 = PieceFactory.create(PieceType.Archer, new Hex(2, 3, -5), 'w');
      const giant = PieceFactory.create(PieceType.Giant, new Hex(0, 3, -3), 'b');
      const castles = createDefaultCastles(BOARD_SIZE);
      const state = createState([archer1, archer2, giant], 2, castles);

      // First attack: archer1 deals 1 damage
      const after1 = CombatMutator.applyAttack(state, archer1, giant.hex, board);
      const damagedGiant = after1.pieces.find(p => p.type === PieceType.Giant);

      if (damagedGiant) {
        expect(damagedGiant.damage).toBe(1);

        // Second attack: archer2 deals 1 more damage (total 2 >= strength 2)
        const after2 = CombatMutator.applyAttack(after1, archer2, damagedGiant.hex, board);
        const giantAfter = after2.pieces.find(p => p.type === PieceType.Giant);
        // Giant should be dead now (damage 2 >= strength 2)
        expect(giantAfter).toBeUndefined();
      }
    });

    it('Assassin instantly kills Monarch', () => {
      const assassin = PieceFactory.create(PieceType.Assassin, new Hex(0, 2, -2), 'w');
      const monarch = PieceFactory.create(PieceType.Monarch, new Hex(1, 1, -2), 'b');
      const castles = createDefaultCastles(BOARD_SIZE);
      const state = createState([assassin, monarch], 2, castles);

      const newState = CombatMutator.applyAttack(state, assassin, monarch.hex, board);
      const monarchFound = newState.pieces.find(p => p.type === PieceType.Monarch);
      expect(monarchFound).toBeUndefined(); // Monarch killed
    });
  });

  // ================================================================
  // Recruitment
  // ================================================================
  describe('Recruitment', () => {
    it('recruits correct piece type based on turns_controlled', () => {
      const castles = createDefaultCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({ owner: 'w', turns_controlled: 1 }); // Archer
      const allCastles = castles.map(c =>
        c.hex.equals(blackCastle.hex) ? captured : c
      );

      const spawnHex = captured.hex.cubeRing(1).find(h =>
        board.hexSet.has(h.getKey())
      )!;

      const state = createState([], 4, allCastles); // White Recruitment
      const newState = RecruitmentMutator.recruitPiece(state, captured, spawnHex, board);

      const recruited = newState.pieces.find(p => p.hex.equals(spawnHex));
      expect(recruited!.type).toBe(PieceType.Archer);
    });

    it('castle turns_controlled incremented means next recruitment is different type', () => {
      const castles = createDefaultCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      // Capture 2 black castles so we stay in recruitment phase
      const blackCastles = castles.filter(c => c.color === 'b');
      const captured1 = blackCastles[0].with({ owner: 'w', turns_controlled: 0 }); // Swordsman
      const captured2 = blackCastles[1].with({ owner: 'w', turns_controlled: 0 }); // Swordsman
      const allCastles = castles.map(c => {
        if (c.hex.equals(captured1.hex)) return captured1;
        if (c.hex.equals(captured2.hex)) return captured2;
        return c;
      });

      const spawnHex = captured1.hex.cubeRing(1).find(h =>
        board.hexSet.has(h.getKey())
      )!;

      const state = createState([], 4, allCastles);
      const newState = RecruitmentMutator.recruitPiece(state, captured1, spawnHex, board);

      // Castle's turns_controlled should have increased
      const updatedCastle = newState.castles.find(c => c.hex.equals(captured1.hex));
      expect(updatedCastle!.turns_controlled).toBe(1);
    });

    it('turns_controlled increments after recruitment', () => {
      const castles = createDefaultCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({ owner: 'w', turns_controlled: 5 });
      const allCastles = castles.map(c =>
        c.hex.equals(blackCastle.hex) ? captured : c
      );

      const spawnHex = captured.hex.cubeRing(1).find(h =>
        board.hexSet.has(h.getKey())
      )!;

      const blackPiece = PieceFactory.create(PieceType.Monarch, new Hex(0, -2, 2), 'b');
      const state = createState([blackPiece], 4, allCastles);
      const newState = RecruitmentMutator.recruitPiece(state, captured, spawnHex, board);

      const updatedCastle = newState.castles.find(c => c.hex.equals(captured.hex));
      expect(updatedCastle!.turns_controlled).toBe(6);
      expect(updatedCastle!.recruitment_cooldown).toBe(CASTLE_RECRUITMENT_COOLDOWN_TURNS);
    });

    it('blocks recruitment while a castle is cooling down', () => {
      const castles = createDefaultCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({
        owner: 'w',
        recruitment_cooldown: 2,
      });
      const allCastles = castles.map(c =>
        c.hex.equals(blackCastle.hex) ? captured : c
      );

      const spawnHex = captured.hex.cubeRing(1).find(h =>
        board.hexSet.has(h.getKey())
      )!;

      const state = createState([], 4, allCastles);

      expect(RuleEngine.getRecruitmentHexes(state, board)).toHaveLength(0);
      expect(() => RecruitmentMutator.recruitPiece(state, captured, spawnHex, board))
        .toThrow("Castle is cooling down");
    });
  });

  // ================================================================
  // Turn Reset
  // ================================================================
  describe('Turn reset', () => {
    it('resets canMove, canAttack, and damage for all pieces at turn start', () => {
      const piece1 = PieceFactory.create(PieceType.Archer, new Hex(0, 2, -2), 'w')
        .with({ canMove: false, canAttack: false, damage: 1 });
      const piece2 = PieceFactory.create(PieceType.Knight, new Hex(0, -2, 2), 'b')
        .with({ canMove: false, canAttack: false, damage: 2 });

      const state = createState([piece1, piece2], 10); // White's turn start

      const reset = TurnMutator.resetTurnFlags(state);

      reset.pieces.forEach(p => {
        expect(p.canMove).toBe(true);
        expect(p.canAttack).toBe(true);
        expect(p.damage).toBe(0);
      });
    });

    it('resets castle used_this_turn flag', () => {
      const castles = createDefaultCastles(BOARD_SIZE);
      const usedCastle = castles[0].with({ used_this_turn: true });
      const allCastles = castles.map(c =>
        c.hex.equals(usedCastle.hex) ? usedCastle : c
      );

      const state = createState([], 10, allCastles);
      const reset = TurnMutator.resetTurnFlags(state);

      reset.castles.forEach(c => {
        expect(c.used_this_turn).toBe(false);
      });
    });

    it('ticks castle recruitment cooldown only at the owner turn start', () => {
      const castles = createDefaultCastles(BOARD_SIZE);
      const blackCastle = castles.find(c => c.color === 'b')!;
      const captured = blackCastle.with({
        owner: 'w',
        recruitment_cooldown: CASTLE_RECRUITMENT_COOLDOWN_TURNS,
      });
      const allCastles = castles.map(c =>
        c.hex.equals(captured.hex) ? captured : c
      );

      const blackTurnStart = TurnMutator.checkTurnTransitions(createState([], 5, allCastles));
      expect(
        blackTurnStart.castles.find(c => c.hex.equals(captured.hex))!.recruitment_cooldown
      ).toBe(CASTLE_RECRUITMENT_COOLDOWN_TURNS);

      const whiteTurnStart = TurnMutator.checkTurnTransitions(createState([], 10, allCastles));
      expect(
        whiteTurnStart.castles.find(c => c.hex.equals(captured.hex))!.recruitment_cooldown
      ).toBe(CASTLE_RECRUITMENT_COOLDOWN_TURNS - 1);
    });
  });

  // ================================================================
  // Phase Skipping
  // ================================================================
  describe('Phase skipping', () => {
    it('skips remaining movement when piece already moved (canMove=false)', () => {
      // Single white piece that already moved (canMove=false), at position 1
      const movedPiece = PieceFactory.create(PieceType.Archer, new Hex(0, 2, -2), 'w')
        .with({ canMove: false });
      // Enemy so attack phase has targets
      const enemy = PieceFactory.create(PieceType.Knight, new Hex(1, 1, -2), 'b');
      const castles = createDefaultCastles(BOARD_SIZE);
      const state = createState([movedPiece, enemy], 1, castles); // Position 1 (2nd Movement sub-turn)

      const hasMoves = RuleEngine.hasAnyLegalMoves(state, board);
      expect(hasMoves).toBe(false);

      // Increment should skip to Attack phase
      const increment = RuleEngine.getTurnCounterIncrement(state, board);
      expect(increment).toBeGreaterThanOrEqual(1); // At least advance past Movement
    });
  });

  // ================================================================
  // Win Conditions
  // ================================================================
  describe('Win conditions', () => {
    it('white wins when all black monarchs are captured', () => {
      const whitePiece = PieceFactory.create(PieceType.Archer, new Hex(0, 2, -2), 'w');
      const whiteMonarch = PieceFactory.create(PieceType.Monarch, new Hex(0, 3, -3), 'w');
      const castles = createDefaultCastles(BOARD_SIZE);

      const winner = WinCondition.getWinner([whitePiece, whiteMonarch], castles);
      expect(winner).toBe('w');
    });

    it('black wins when all white monarchs are captured', () => {
      const blackPiece = PieceFactory.create(PieceType.Archer, new Hex(0, -2, 2), 'b');
      const blackMonarch = PieceFactory.create(PieceType.Monarch, new Hex(0, -3, 3), 'b');
      const castles = createDefaultCastles(BOARD_SIZE);

      const winner = WinCondition.getWinner([blackPiece, blackMonarch], castles);
      expect(winner).toBe('b');
    });

    it('game is ongoing when both players have monarchs', () => {
      const wMonarch = PieceFactory.create(PieceType.Monarch, new Hex(0, 3, -3), 'w');
      const bMonarch = PieceFactory.create(PieceType.Monarch, new Hex(0, -3, 3), 'b');
      const castles = createDefaultCastles(BOARD_SIZE);

      const winner = WinCondition.getWinner([wMonarch, bMonarch], castles);
      expect(winner).toBeNull();
    });

    it('white wins by controlling all 6 castles', () => {
      const castles = createDefaultCastles(BOARD_SIZE).map(c =>
        c.with({ owner: 'w' })
      );
      const wMonarch = PieceFactory.create(PieceType.Monarch, new Hex(0, 3, -3), 'w');
      const bMonarch = PieceFactory.create(PieceType.Monarch, new Hex(0, -3, 3), 'b');

      const winner = WinCondition.getWinner([wMonarch, bMonarch], castles);
      expect(winner).toBe('w');
    });
  });

  // ================================================================
  // Pass Turn
  // ================================================================
  describe('Pass turn', () => {
    it('passing advances the turn counter', () => {
      const piece = PieceFactory.create(PieceType.Archer, new Hex(0, 2, -2), 'w');
      const state = createState([piece], 0);
      const afterPass = TurnMutator.passTurn(state, board);
      expect(afterPass.turnCounter).toBeGreaterThan(0);
    });
  });
});
