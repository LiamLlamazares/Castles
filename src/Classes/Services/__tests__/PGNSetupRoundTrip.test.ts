import { Board, BoardConfig } from "../../Core/Board";
import { Castle } from "../../Entities/Castle";
import { Hex } from "../../Entities/Hex";
import { Piece } from "../../Entities/Piece";
import { Sanctuary } from "../../Entities/Sanctuary";
import { PieceType, SanctuaryType } from "../../../Constants";
import { PGNGenerator } from "../PGNGenerator";
import { PGNImporter } from "../PGNImporter";
import { PGNService } from "../PGNService";
import { GameSettings, GameSetup } from "../PGNTypes";
import { MoveTree } from "../../Core/MoveTree";
import { createPieceMap } from "../../../utils/PieceMap";

const boardConfig: BoardConfig = {
  nSquares: 5,
  riverCrossingLength: 1,
  riverSegmentLength: 3,
  hasHighGround: false,
};

const castles = [
  new Castle(new Hex(-5, 5, 0), "w", 2, true, "w"),
  new Castle(new Hex(5, -5, 0), "b", 1, false, "b"),
];

const pieces = [
  new Piece(new Hex(0, 1, -1), "w", PieceType.Swordsman),
  new Piece(new Hex(0, -1, 1), "b", PieceType.Archer),
  new Piece(new Hex(1, -1, 0), "w", PieceType.Wizard, true, true, 0, true),
];

const sanctuaries = [
  new Sanctuary(new Hex(-1, 1, 0), SanctuaryType.WolfCovenant, "w", "w", 2, true),
  new Sanctuary(new Hex(1, -1, 0), SanctuaryType.ArcaneRefuge, "b", null, 0, false),
];

const gameSettings: GameSettings = {
  sanctuaryUnlockTurn: 7,
  sanctuaryRechargeTurns: 4,
};

const setup: GameSetup = {
  boardConfig,
  castles: castles.map((castle) => ({
    q: castle.hex.q,
    r: castle.hex.r,
    s: castle.hex.s,
    color: castle.color,
    turns_controlled: castle.turns_controlled,
    used_this_turn: castle.used_this_turn,
    owner: castle.owner,
  })),
  pieces: pieces.map((piece) => ({
    type: piece.type,
    q: piece.hex.q,
    r: piece.hex.r,
    s: piece.hex.s,
    color: piece.color,
  })),
  sanctuaries: sanctuaries.map((sanctuary) => ({
    type: sanctuary.type,
    q: sanctuary.hex.q,
    r: sanctuary.hex.r,
    s: sanctuary.hex.s,
    territorySide: sanctuary.territorySide,
    cooldown: sanctuary.cooldown,
    hasPledgedThisGame: sanctuary.hasPledgedThisGame,
  })),
  gameSettings,
  sanctuaryPool: [SanctuaryType.PyreEternal, SanctuaryType.WardensWatch],
  turnCounter: 0,
};

const escapePgnTagValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const moveTreeWithSetupPool = () => {
  const tree = new MoveTree();
  tree.rootNode.snapshot = {
    pieces: pieces.map((piece) => piece.clone()),
    pieceMap: createPieceMap(pieces),
    castles: castles.map((castle) => castle.clone()),
    sanctuaries: sanctuaries.map((sanctuary) => sanctuary.clone()),
    turnCounter: 0,
    sanctuaryPool: setup.sanctuaryPool ?? [],
    graveyard: [],
    phoenixRecords: [],
  };
  return tree;
};

describe("PGN setup round-trip", () => {
  it("round-trips compact setup compression", () => {
    const compact = PGNGenerator.compressSetup(setup);
    const restored = PGNImporter.decompressSetup(compact);

    expect(restored).toEqual(setup);
  });

  it("round-trips generated PGN setup tags through parse and reconstruct", () => {
    const board = new Board(boardConfig, castles);
    const pgn = PGNService.generatePGN(
      board,
      pieces,
      [],
      sanctuaries,
      {},
      moveTreeWithSetupPool(),
      gameSettings
    );

    const parsed = PGNService.parsePGN(pgn);
    expect(parsed.setup).toEqual(setup);

    const reconstructed = PGNService.reconstructState(parsed.setup!);
    expect(reconstructed.board.config).toEqual(boardConfig);
    expect(reconstructed.board.castles.map(c => ({
      q: c.hex.q,
      r: c.hex.r,
      s: c.hex.s,
      color: c.color,
      turns_controlled: c.turns_controlled,
      used_this_turn: c.used_this_turn,
      owner: c.owner,
    }))).toEqual(setup.castles);
    expect(reconstructed.pieces.map(p => ({ type: p.type, q: p.hex.q, r: p.hex.r, s: p.hex.s, color: p.color }))).toEqual(setup.pieces);
    expect(reconstructed.sanctuaries.map(s => ({
      type: s.type,
      q: s.hex.q,
      r: s.hex.r,
      s: s.hex.s,
      territorySide: s.territorySide,
      cooldown: s.cooldown,
      hasPledgedThisGame: s.hasPledgedThisGame,
    }))).toEqual(setup.sanctuaries);
  });

  it("parses base64 compact setup with embedded whitespace", () => {
    const board = new Board(boardConfig, castles);
    const pgn = PGNService.generatePGN(board, pieces, [], sanctuaries, {}, moveTreeWithSetupPool(), gameSettings);
    const withWhitespace = pgn.replace(/\[CustomSetup "([^"]+)"\]/, (_match, base64) => {
      const split = Math.floor(base64.length / 2);
      return `[CustomSetup "${base64.slice(0, split)}\n ${base64.slice(split)}"]`;
    });

    const parsed = PGNService.parsePGN(withWhitespace);

    expect(parsed.setup).toEqual(setup);
  });

  it("parses escaped raw JSON custom setup tags", () => {
    const rawJson = JSON.stringify(PGNGenerator.compressSetup(setup));
    const pgn = `[Event "Castles Game"]\n[CustomSetup "${escapePgnTagValue(rawJson)}"]\n\n*`;

    const parsed = PGNService.parsePGN(pgn);

    expect(parsed.setup).toEqual(setup);
  });

  it("does not treat tag-shaped movetext comments as header tags", () => {
    const board = new Board(boardConfig, castles);
    const header = PGNService.generatePGN(
      board,
      pieces,
      [],
      sanctuaries,
      {},
      moveTreeWithSetupPool(),
      gameSettings
    ).split("\n\n")[0];
    const pgn = `${header}\n\n1. J10J11 { [Event "not a header"] } Pass`;

    const parsed = PGNService.parsePGN(pgn);

    expect(parsed.setup).toEqual(setup);
    expect(parsed.moves).toEqual(["J10J11", "Pass"]);
  });

  it("returns null setup for invalid custom setup without crashing", () => {
    const pgn = `[Event "Castles Game"]\n[CustomSetup "not-valid-json-or-base64"]\n\n*`;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const parsed = PGNService.parsePGN(pgn);

    expect(parsed.setup).toBeNull();
    expect(parsed.moves).toEqual([]);
    expect(parsed.moveTree.rootNode.move.notation).toBe("Start");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
