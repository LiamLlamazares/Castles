import { Board, BoardConfig } from "../Core/Board";
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { MoveRecord } from "../../Constants";
import { Hex } from "../Entities/Hex";

import { PieceType } from "../../Constants";

// We define a Setup interface for serialization
export interface GameSetup {
  boardConfig: BoardConfig;
  castles: { q: number; r: number; s: number; color: 'w' | 'b' }[];
  pieces: { type: PieceType; q: number; r: number; s: number; color: 'w' | 'b' }[];
}

export class PGNService {
  /**
   * Generates a PGN string from the game state.
   */
  public static generatePGN(
    board: Board,
    pieces: Piece[],
    history: MoveRecord[],
    gameTags: { [key: string]: string } = {}
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
        color: p.color as 'w' | 'b', // Cast generic string to specific union if needed
      })),
    };

    const tags = {
      Event: "Castles Game",
      Site: "Local",
      Date: new Date().toISOString().split("T")[0].replace(/-/g, "."),
      Round: "1",
      White: "White",
      Black: "Black",
      Result: "*",
      Setup: "1",
      CustomSetup: btoa(JSON.stringify(setup)), // Base64 encode to avoid PGN string escaping issues
      ...gameTags,
    };

    let pgn = "";
    // Write Tags
    for (const [key, value] of Object.entries(tags)) {
      pgn += `[${key} "${value}"]\n`;
    }
    pgn += "\n";

    // Write Moves
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

    return pgn.trim();
  }

  /**
   * Parses a PGN string to recover the GameSetup and Move list.
   * Note: This does NOT replay the moves. It just extracts the initial state and the move strings.
   * You must replay the moves on the Engine to get the final state.
   */
  public static parsePGN(pgn: string): { setup: GameSetup | null; moves: string[] } {
    const lines = pgn.split('\n');
    let setup: GameSetup | null = null;
    let movesString = "";

    for (const line of lines) {
      if (line.startsWith('[')) {
        // Tag
        const match = line.match(/^\[(\w+) "(.+)"\]$/);
        if (match) {
            const tagName = match[1];
            const tagValue = match[2];
            if (tagName === 'CustomSetup') {
                try {
                    // Try parsing as JSON first (backward compat for V1 w/o Base64)
                    if (tagValue.trim().startsWith('{')) {
                         setup = JSON.parse(tagValue);
                    } else {
                         // Assume Base64
                         setup = JSON.parse(atob(tagValue));
                    }
                } catch (e) {
                    console.error("Failed to parse CustomSetup JSON", e);
                }
            }
        }
      } else {
        // Body or empty line
        movesString += line + " ";
      }
    }

    // Parse moves from movesString
    // Remove "1.", "2." etc and extra spaces
    // Regex to find move tokens? 
    // Matches standard chess moves (e.g. J10K11, J10xK11, Pass)
    // Simple tokenizer: split by space, ignore numbers with dots.
    const tokens = movesString.split(/\s+/).filter(t => t.trim() !== '');
    const cleanMoves: string[] = [];
    
    for (const token of tokens) {
        if (/^\d+\.$/.test(token)) continue; // Skip "1.", "2."
        if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) continue; // Skip result
        cleanMoves.push(token);
    }

    return { setup, moves: cleanMoves };
  }

  public static reconstructState(setup: GameSetup): { board: Board; pieces: Piece[] } {
        // Reconstruct Board
        // We need to map the raw castle data back into Castle objects
        // But Board constructor expects Castle[]? 
        // Let's modify Board constructor or map it here.
        // Board logic: if custom castles are provided, use them.
        
        // Convert setup.castles to Castle objects
        const castles = setup.castles.map(c => new Castle(new Hex(c.q, c.r, c.s), c.color, 0));
        
        const board = new Board(setup.boardConfig, castles);
        
        // Convert setup.pieces to Piece objects
        const pieces = setup.pieces.map(p => new Piece(new Hex(p.q, p.r, p.s), p.color, p.type));
        
        return { board, pieces };
  }
}
