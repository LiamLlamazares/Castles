import { MoveTree, MoveNode } from "../../Core/MoveTree";
import { PGNGenerator } from "../PGNGenerator";
import { PGNParser } from "../../Systems/PGNParser";
import { Color, MoveRecord, TurnPhase } from "../../../Constants";

const record = (notation: string): MoveRecord => ({
  notation,
  turnNumber: 1,
  color: "w",
  phase: "Movement",
});

const childNotations = (node: MoveNode): string[] =>
  node.children.map((child) => child.move.notation);

const mainLine = (tree: MoveTree): string[] => tree.getHistoryLine().map((move) => move.notation);

describe("PGNParser RAV semantics", () => {
  it("parses a linear sequence into a single main line", () => {
    const tree = PGNParser.parseToTree("1. A B 2. C D");

    expect(childNotations(tree.rootNode)).toEqual(["A"]);
    expect(childNotations(tree.rootNode.children[0])).toEqual(["B"]);
    expect(childNotations(tree.rootNode.children[0].children[0])).toEqual(["C"]);
    expect(childNotations(tree.rootNode.children[0].children[0].children[0])).toEqual(["D"]);
    expect(mainLine(tree)).toEqual(["A", "B", "C", "D"]);
  });

  it("branches a white variation from the root position", () => {
    const tree = PGNParser.parseToTree("1. A (1. X) B");

    expect(childNotations(tree.rootNode)).toEqual(["A", "X"]);
    expect(childNotations(tree.rootNode.children[0])).toEqual(["B"]);
    expect(mainLine(tree)).toEqual(["A", "B"]);
  });

  it("branches a black variation from the position after the white move", () => {
    const tree = PGNParser.parseToTree("1. A B (1... X) 2. C");
    const whiteMove = tree.rootNode.children[0];

    expect(whiteMove.move.notation).toBe("A");
    expect(childNotations(whiteMove)).toEqual(["B", "X"]);
    expect(childNotations(whiteMove.children[0])).toEqual(["C"]);
    expect(mainLine(tree)).toEqual(["A", "B", "C"]);
  });

  it("keeps continuation moves inside variation branches", () => {
    const tree = PGNParser.parseToTree("1. A (1. X Y) B");
    const variation = tree.rootNode.children[1];

    expect(childNotations(tree.rootNode)).toEqual(["A", "X"]);
    expect(childNotations(variation)).toEqual(["Y"]);
    expect(childNotations(tree.rootNode.children[0])).toEqual(["B"]);
    expect(mainLine(tree)).toEqual(["A", "B"]);
  });

  it("treats nested variations as alternatives to the immediately preceding move", () => {
    const tree = PGNParser.parseToTree("1. A B (1... X (1... Y)) 2. C");
    const whiteMove = tree.rootNode.children[0];

    expect(childNotations(whiteMove)).toEqual(["B", "X", "Y"]);
    expect(childNotations(whiteMove.children[0])).toEqual(["C"]);
    expect(mainLine(tree)).toEqual(["A", "B", "C"]);
  });

  it("parses generated PGN back into an equivalent branch shape", () => {
    const tree = new MoveTree();
    tree.addMove(record("A"));
    tree.addMove(record("B"));
    tree.navigateBack();
    tree.addMove(record("X"));
    tree.navigateBack();
    tree.navigateBack();
    tree.addMove(record("Y"));

    const pgn = PGNGenerator.renderRecursiveHistory(tree.rootNode, 1, "w" as Color);
    const parsed = PGNParser.parseToTree(pgn);

    expect(childNotations(parsed.rootNode)).toEqual(["A", "Y"]);
    expect(childNotations(parsed.rootNode.children[0])).toEqual(["B", "X"]);
    expect(mainLine(parsed)).toEqual(["A", "B"]);
  });

  it("ignores comments, results, and move suffix annotations", () => {
    const tree = PGNParser.parseToTree("1. A! {comment} B? 1-0");

    expect(mainLine(tree)).toEqual(["A", "B"]);
  });

  it("branches a later white variation from the preceding black move", () => {
    const tree = PGNParser.parseToTree("1. A B 2. C (2. X) D");
    const blackMove = tree.rootNode.children[0].children[0];

    expect(blackMove.move.notation).toBe("B");
    expect(childNotations(blackMove)).toEqual(["C", "X"]);
    expect(childNotations(blackMove.children[0])).toEqual(["D"]);
    expect(mainLine(tree)).toEqual(["A", "B", "C", "D"]);
  });

  it("restores the correct stack after a nested variation with continuation", () => {
    const tree = PGNParser.parseToTree("1. A B (1... X (1... Y Z)) 2. C");
    const whiteMove = tree.rootNode.children[0];
    const nestedAlternative = whiteMove.children[2];

    expect(childNotations(whiteMove)).toEqual(["B", "X", "Y"]);
    expect(childNotations(nestedAlternative)).toEqual(["Z"]);
    expect(childNotations(whiteMove.children[0])).toEqual(["C"]);
    expect(mainLine(tree)).toEqual(["A", "B", "C"]);
  });
});
