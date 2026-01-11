/**
 * @file PGNGenerator.ts
 * @description Generates PGN strings from game state.
 *
 * Part of the PGN service split for better modularity.
 * Handles:
 * - Converting game state to PGN format
 * - Rendering move trees with variations
 * - Compressing setup data for storage
 *
 * @see PGNParser - For parsing PGN strings
 * @see PGNService - Facade that re-exports both
 */
import { Board } from "../Core/Board";
import { Piece } from "../Entities/Piece";
import { MoveRecord, Color } from "../../Constants";
import { MoveTree, MoveNode } from "../Core/MoveTree";
import { SanctuaryType } from "../../Constants";
import { Sanctuary } from "../Entities/Sanctuary";
import { GameSetup, CompactSetup, CastleSetup, PieceSetup, SanctuarySetup, GameSettings } from "./PGNTypes";

export class PGNGenerator {
  /**
   * Generates a PGN string from the game state.
   */
  public static generatePGN(
    board: Board,
    pieces: Piece[],
    history: MoveRecord[],
    sanctuaries: Sanctuary[] = [],
    gameTags: { [key: string]: string } = {},
    moveTree?: MoveTree,
    gameSettings?: GameSettings
  ): string {
    const setup: GameSetup = {
      boardConfig: board.config,
      castles: board.castles.map((c) => ({
        q: c.hex.q,
        r: c.hex.r,
        s: c.hex.s,
        color: c.color as 'w' | 'b',
      })),
      pieces: pieces.map((p) => ({
        type: p.type,
        q: p.hex.q,
        r: p.hex.r,
        s: p.hex.s,
        color: p.color as 'w' | 'b',
      })),
      sanctuaries: sanctuaries.map((s) => ({
        type: s.type,
        q: s.hex.q,
        r: s.hex.r,
        s: s.hex.s,
        territorySide: s.territorySide as 'w' | 'b',
        cooldown: s.cooldown,
        hasPledgedThisGame: s.hasPledgedThisGame,
      })),
      gameSettings: gameSettings,
    };

    const compactSetup = PGNGenerator.compressSetup(setup);

    const tags = {
      Event: "Castles Game",
      Site: "Local",
      Date: new Date().toISOString().split("T")[0].replace(/-/g, "."),
      Round: "1",
      White: "White",
      Black: "Black",
      Result: "*",
      Setup: "1",
      CustomSetup: btoa(JSON.stringify(compactSetup)), // Base64 encoded compact JSON
      ...gameTags,
    };

    let pgn = "";
    // Write Tags
    for (const [key, value] of Object.entries(tags)) {
      pgn += `[${key} "${value}"]\n`;
    }
    pgn += "\n";

    // Write Moves
    if (moveTree) {
        pgn += this.renderRecursiveHistory(moveTree.rootNode, 1, 'w');
    } else {
        let turn = 1;
        for (let i = 0; i < history.length; i += 2) {
            const whiteMove = history[i];
            const blackMove = history[i+1];
            
            pgn += `${turn}. ${whiteMove.notation} `;
            if (blackMove) {
                pgn += `${blackMove.notation} `;
            }
            turn++;
        }
    }

    return pgn.trim();
  }

  /**
   * Recursively renders move tree nodes to PGN format.
   * Handles main line and variations.
   */
  public static renderRecursiveHistory(node: MoveNode, turnNumber: number, color: Color, forceTurnNumber: boolean = false): string {
    if (node.children.length === 0) return "";

    let pgn = "";
    const selectedIndex = node.selectedChildIndex;
    const mainChild = node.children[selectedIndex] || node.children[0];

    // 1. Render main move
    if (color === 'w') {
        pgn += `${turnNumber}. ${mainChild.move.notation} `;
    } else {
        if (forceTurnNumber) {
            pgn += `${turnNumber}... ${mainChild.move.notation} `;
        } else {
            pgn += `${mainChild.move.notation} `;
        }
    }

    // 2. Render variation branches
    let hadVariations = false;
    for (let i = 0; i < node.children.length; i++) {
        if (i === selectedIndex) continue;
        const variation = node.children[i];
        hadVariations = true;
        
        // Start variation with (
        pgn += `(${this.renderVariationLine(variation, turnNumber, color)}) `;
    }

    // 3. Continue main line
    const nextColor: Color = color === 'w' ? 'b' : 'w';
    const nextTurn = color === 'b' ? turnNumber + 1 : turnNumber;
    
    // If we had variations and the next move is black, we must force the turn number
    pgn += this.renderRecursiveHistory(mainChild, nextTurn, nextColor, hadVariations && nextColor === 'b');

    return pgn;
  }

  /**
   * Renders a single variation line.
   */
  public static renderVariationLine(node: MoveNode, turnNumber: number, color: Color): string {
      let pgn = "";
      
      // Start of variation needs correct numbering
      if (color === 'w') {
          pgn += `${turnNumber}. ${node.move.notation} `;
      } else {
          pgn += `${turnNumber}... ${node.move.notation} `;
      }

      // Continue this variation line by recursing on the variation node itself
      const nextColor: Color = color === 'w' ? 'b' : 'w';
      const nextTurn = color === 'b' ? turnNumber + 1 : turnNumber;
      pgn += this.renderRecursiveHistory(node, nextTurn, nextColor, false);

      return pgn.trim();
  }

  /**
   * Compresses a GameSetup to a more compact format for storage.
   */
  public static compressSetup(setup: GameSetup): CompactSetup {
      const result: CompactSetup = {
          b: setup.boardConfig,
          c: setup.castles.map((c: CastleSetup) => [c.q, c.r, c.s, c.color === 'w' ? 0 : 1]),
          p: setup.pieces.map((p: PieceSetup) => [p.type, p.q, p.r, p.s, p.color === 'w' ? 0 : 1])
      };
      // Only include sanctuaries if present
      if (setup.sanctuaries && setup.sanctuaries.length > 0) {
          result.s = setup.sanctuaries.map((s: SanctuarySetup) => [
              s.type, s.q, s.r, s.s, 
              s.territorySide === 'w' ? 0 : 1, 
              s.cooldown, 
              s.hasPledgedThisGame ? 1 : 0
          ]);
      }
      // Include game settings if present
      if (setup.gameSettings) {
          result.g = [
              setup.gameSettings.sanctuaryUnlockTurn,
              setup.gameSettings.sanctuaryRechargeTurns
          ];
      }
      return result;
  }
}
