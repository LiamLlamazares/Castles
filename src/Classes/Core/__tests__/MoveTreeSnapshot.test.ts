import { MoveTree } from "../MoveTree";
import { MoveRecord } from "../../../Constants";
import { createHistorySnapshot } from "../../../utils/GameStateUtils";
import { createPieceMap } from "../../../utils/PieceMap";
import { Board } from "../Board";
import { GameState } from "../GameState";
import { Hex } from "../../Entities/Hex";
import { Piece } from "../../Entities/Piece";
import { PieceType } from "../../../Constants";

const record = (notation: string): MoveRecord => ({
  notation,
  turnNumber: 1,
  color: "w",
  phase: "Movement",
});

const stateWithPieceAt = (hex: Hex): GameState => {
  const board = new Board({ nSquares: 3 });
  const pieces = [new Piece(hex, "w", PieceType.Swordsman)];

  return {
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: board.castles,
    sanctuaries: [],
    sanctuaryPool: [],
    turnCounter: 0,
    movingPiece: null,
    moveTree: new MoveTree(),
    graveyard: [],
    phoenixRecords: [],
    viewNodeId: null,
  };
};

describe("MoveTree snapshot safety", () => {
  it("clones tree nodes without sharing node references", () => {
    const tree = new MoveTree();
    tree.addMove(record("A"), createHistorySnapshot(stateWithPieceAt(new Hex(0, 1, -1))));
    tree.addMove(record("B"), createHistorySnapshot(stateWithPieceAt(new Hex(1, 0, -1))));

    const clone = tree.clone();

    expect(clone.rootNode.id).toBe(tree.rootNode.id);
    expect(clone.current.id).toBe(tree.current.id);
    expect(clone.rootNode).not.toBe(tree.rootNode);
    expect(clone.current).not.toBe(tree.current);
    expect(clone.current.parent).not.toBe(tree.current.parent);
    expect(clone.current.snapshot).not.toBe(tree.current.snapshot);
    expect(clone.current.snapshot?.pieces).not.toBe(tree.current.snapshot?.pieces);
    expect(clone.current.snapshot?.pieces[0]).not.toBe(tree.current.snapshot?.pieces[0]);
    expect(clone.current.snapshot?.pieceMap).not.toBe(tree.current.snapshot?.pieceMap);
  });

  it("does not mutate an existing branch snapshot when a sibling branch is added", () => {
    const tree = new MoveTree();
    const firstState = stateWithPieceAt(new Hex(0, 1, -1));
    const mainBranchState = stateWithPieceAt(new Hex(1, 0, -1));
    const siblingBranchState = stateWithPieceAt(new Hex(-1, 1, 0));

    tree.addMove(record("A"), createHistorySnapshot(firstState));
    tree.addMove(record("B"), createHistorySnapshot(mainBranchState));

    const originalMainSnapshot = tree.current.snapshot;
    expect(originalMainSnapshot).toBeDefined();

    tree.navigateBack();
    tree.addMove(record("X"), createHistorySnapshot(siblingBranchState));

    const parent = tree.current.parent;
    const mainBranch = parent?.children.find((child) => child.move.notation === "B");
    const siblingBranch = parent?.children.find((child) => child.move.notation === "X");

    expect(parent?.children).toHaveLength(2);
    expect(mainBranch?.snapshot).toBe(originalMainSnapshot);
    expect(mainBranch?.snapshot?.pieces[0].hex.equals(new Hex(1, 0, -1))).toBe(true);
    expect(siblingBranch?.snapshot?.pieces[0].hex.equals(new Hex(-1, 1, 0))).toBe(true);
  });
});
