import { Board } from "../../Core/Board";
import { GameEngine } from "../../Core/GameEngine";
import { GameState } from "../../Core/GameState";
import { MoveTree } from "../../Core/MoveTree";
import { Castle } from "../../Entities/Castle";
import { Hex } from "../../Entities/Hex";
import { PieceFactory } from "../../Entities/PieceFactory";
import { RecruitCommand } from "../RecruitCommand";
import { PieceType } from "../../../Constants";
import { createPieceMap } from "../../../utils/PieceMap";

const createState = (pieces: ReturnType<typeof PieceFactory.create>[], castles: Castle[], turnCounter = 4): GameState => ({
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
});

describe("RecruitCommand", () => {
  const board = new Board({ nSquares: 3 });
  const gameEngine = new GameEngine(board);
  const context = { gameEngine, board };

  it("rejects an occupied spawn hex", () => {
    const castle = new Castle(new Hex(0, 3, -3), "b", 0, false, "w");
    const spawnHex = new Hex(0, 2, -2);
    const blocker = PieceFactory.create(PieceType.Swordsman, spawnHex, "w");
    const state = createState([blocker], [castle]);
    const command = new RecruitCommand(castle, spawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.error).toBe("Invalid recruitment hex");
  });

  it("rejects a stale castle object when the live castle has already recruited", () => {
    const staleCastle = new Castle(new Hex(0, 3, -3), "b", 0, false, "w");
    const usedCastle = new Castle(new Hex(0, 3, -3), "b", 0, true, "w");
    const spawnHex = new Hex(0, 2, -2);
    const state = createState([], [usedCastle]);
    const command = new RecruitCommand(staleCastle, spawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.error).toBe("Castle has already recruited this turn");
  });

  it("rejects a stale castle object when the live castle is cooling down", () => {
    const staleCastle = new Castle(new Hex(0, 3, -3), "b", 0, false, "w");
    const coolingCastle = new Castle(new Hex(0, 3, -3), "b", 0, false, "w", 2);
    const spawnHex = new Hex(0, 2, -2);
    const state = createState([], [coolingCastle]);
    const command = new RecruitCommand(staleCastle, spawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.error).toBe("Castle is cooling down");
  });

  it("rejects recruitment outside the Recruitment phase", () => {
    const castle = new Castle(new Hex(0, 3, -3), "w", 0, false, "w");
    const spawnHex = new Hex(0, 2, -2);
    const state = createState([], [castle], 0);
    const command = new RecruitCommand(castle, spawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.error).toBe("Recruitment is only available during Recruitment phase");
  });

  it("rejects a stale castle object when the live castle is controlled by another player", () => {
    const staleCastle = new Castle(new Hex(0, 3, -3), "w", 0, false, "w");
    const enemyOwnedCastle = new Castle(new Hex(0, 3, -3), "w", 0, false, "b");
    const spawnHex = new Hex(0, 2, -2);
    const state = createState([], [enemyOwnedCastle]);
    const command = new RecruitCommand(staleCastle, spawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.error).toBe("Castle is not controlled by the active player");
  });

  it("rejects a stale castle object that is no longer in the live state", () => {
    const staleCastle = new Castle(new Hex(0, 3, -3), "w", 0, false, "w");
    const spawnHex = new Hex(0, 2, -2);
    const state = createState([], []);
    const command = new RecruitCommand(staleCastle, spawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.error).toBe("Castle not found");
  });

  it("rejects recruitment from the active player's own-origin castle", () => {
    const ownOriginCastle = new Castle(new Hex(0, 3, -3), "w", 0, false, "w");
    const spawnHex = new Hex(0, 2, -2);
    const state = createState([], [ownOriginCastle]);
    const command = new RecruitCommand(ownOriginCastle, spawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.error).toBe("Castle does not grant recruitment to its original owner");
  });

  it("allows recruitment from an enemy-origin castle captured by the active player", () => {
    const capturedEnemyCastle = new Castle(new Hex(0, 3, -3), "b", 0, false, "w");
    const spawnHex = new Hex(0, 2, -2);
    const state = createState([], [capturedEnemyCastle]);
    const command = new RecruitCommand(capturedEnemyCastle, spawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(true);
    expect(result.newState.pieces.some(piece => piece.hex.equals(spawnHex))).toBe(true);
  });

  it("rejects recruitment onto river hexes adjacent to a captured castle", () => {
    const castle = new Castle(new Hex(-3, 0, 3), "b", 0, false, "w");
    const riverSpawnHex = new Hex(-2, 0, 2);
    const state = createState([], [castle]);
    const command = new RecruitCommand(castle, riverSpawnHex, context);

    const result = command.execute(state);

    expect(result.success).toBe(false);
    expect(result.newState).toBe(state);
    expect(result.error).toBe("Invalid recruitment hex");
  });
});
