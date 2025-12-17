import { Board, BoardConfig } from "../Core/Board";
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { MoveRecord, Color } from "../../Constants";
import { Hex } from "../Entities/Hex";
import { GameEngine, GameState } from "../Core/GameEngine";
import { createPieceMap } from "../../utils/PieceMap";
import { NotationService } from "../Systems/NotationService";
import { TurnManager } from "../Core/TurnManager";

import { PieceType } from "../../Constants";

// We define a Setup interface for serialization
export interface GameSetup {
  boardConfig: BoardConfig;
  castles: { q: number; r: number; s: number; color: 'w' | 'b' }[];
  pieces: { type: PieceType; q: number; r: number; s: number; color: 'w' | 'b' }[];
}

// Compact types for serialization
interface CompactSetup {
  b: BoardConfig;
  c: [number, number, number, 0 | 1][]; // q, r, s, color (0=w, 1=b)
  p: [PieceType, number, number, number, 0 | 1][]; // type, q, r, s, color
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
        color: p.color as 'w' | 'b',
      })),
    };

    const compactSetup = PGNService.compressSetup(setup);

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
    // Normalize newlines and whitespace slightly to ensure clean parsing if it came in as one blob
    // But be careful not to corrupt the Base64 if it has spaces (though our generator doesn't put spaces in b64)
    
    // We use a regex loop to find all tags regardless of line breaks.
    const tagRegex = /\[(\w+)\s+"([^"]*)"\]/g;
    let match;
    let lastIndex = 0;
    
    let setup: GameSetup | null = null; // Declare here so it is available in scope

    while ((match = tagRegex.exec(pgn)) !== null) {
        const tagName = match[1];
        const tagValue = match[2];
        lastIndex = tagRegex.lastIndex;

        if (tagName === 'CustomSetup') {
            try {
                let parsedData: any;
                // Try parsing as JSON first (backward compat for V1 w/o Base64)
                if (tagValue.trim().startsWith('{')) {
                        parsedData = JSON.parse(tagValue);
                } else {
                        // Assume Base64 - strip all whitespace first to be safe against line wrapping
                        const base64 = tagValue.replace(/\s/g, '');
                        // Check for valid Base64 chars mostly to avoid trying to parse garbage
                        const decoded = atob(base64);
                        parsedData = JSON.parse(decoded.trim());
                }

                // Determine if it is Compact or Legacy format
                if (parsedData.b && parsedData.c && parsedData.p) {
                    setup = PGNService.decompressSetup(parsedData);
                } else {
                    setup = parsedData; // Legacy format
                }

            } catch (e) {
                console.error("Failed to parse CustomSetup JSON", e);
            }
        }
    }

    // The rest of the string after the last tag is the moves
    const movesString = pgn.substring(lastIndex);

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

  private static compressSetup(setup: GameSetup): CompactSetup {
      return {
          b: setup.boardConfig,
          c: setup.castles.map(c => [c.q, c.r, c.s, c.color === 'w' ? 0 : 1]),
          p: setup.pieces.map(p => [p.type, p.q, p.r, p.s, p.color === 'w' ? 0 : 1])
      };
  }

  private static decompressSetup(compact: CompactSetup): GameSetup {
      return {
          boardConfig: compact.b,
          castles: compact.c.map(c => ({
              q: c[0],
              r: c[1],
              s: c[2],
              color: c[3] === 0 ? 'w' : 'b'
          })),
          pieces: compact.p.map(p => ({
              type: p[0],
              q: p[1],
              r: p[2],
              s: p[3],
              color: p[4] === 0 ? 'w' : 'b'
          }))
      };
  }

  public static reconstructState(setup: GameSetup): { board: Board; pieces: Piece[] } {
        // Reconstruct Board
        // Convert setup.castles to Castle objects
        const castles = setup.castles.map(c => new Castle(new Hex(c.q, c.r, c.s), c.color, 0));
        
        const board = new Board(setup.boardConfig, castles);
        
        // Convert setup.pieces to Piece objects
        const pieces = setup.pieces.map(p => new Piece(new Hex(p.q, p.r, p.s), p.color, p.type));
        
        return { board, pieces };
  }

  /**
   * Replays the parsed moves on top of the initial state to produce the final GameState and History.
   */
  public static replayMoveHistory(
      board: Board, 
      initialPieces: Piece[], 
      moves: string[]
  ): GameState {
      // Initialize fresh engine and state
      const engine = new GameEngine(board);
      const castles = board.castles as Castle[]; // Castles from board are effectively the list for now

      let currentState: GameState = {
          pieces: initialPieces.map(p => p.clone()), // Clone to start fresh
          pieceMap: createPieceMap(initialPieces),
          castles: castles.map(c => c.clone()),
          turnCounter: 0,
          movingPiece: null,
          history: [],
          moveHistory: []
      };

      // Loop through moves and apply them
      for (const token of moves) {
          try {
              if (token === "Pass") {
                  // Save history before move
                  currentState = PGNService.saveHistoryEntry(currentState, token);
                  currentState = engine.passTurn(currentState);
                  continue;
              }

              // Attack: J10xK11
              if (token.includes('x')) {
                  const parts = token.split('x');
                  const startHex = NotationService.fromCoordinate(parts[0]);
                  const targetHex = NotationService.fromCoordinate(parts[1]);

                  const attacker = currentState.pieces.find(p => p.hex.equals(startHex));
                  if (!attacker) throw new Error(`Attacker not found at ${parts[0]}`);

                  currentState = PGNService.saveHistoryEntry(currentState, token);

                  // Check if target is a piece or castle
                  const targetPiece = currentState.pieces.find(p => p.hex.equals(targetHex));
                  if (targetPiece) {
                      currentState = engine.applyAttack(currentState, attacker, targetHex);
                  } else {
                      // Assume castle attack
                      currentState = engine.applyCastleAttack(currentState, attacker, targetHex);
                  }
                  continue;
              }

              // Recruitment: B2=Kni
              if (token.includes('=')) {
                   const parts = token.split('=');
                   const spawnHex = NotationService.fromCoordinate(parts[0]);
                   const pieceCode = parts[1];
                   
                   // Find piece type
                   let pieceType: PieceType | undefined;
                   // Reverse lookup from code... naive approach or need helper
                   // Codes: Swo, Arc, Kni, Tre, Eag, Gia, Asn, Dra, Mon
                   switch(pieceCode) {
                       case "Swo": pieceType = PieceType.Swordsman; break;
                       case "Arc": pieceType = PieceType.Archer; break;
                       case "Kni": pieceType = PieceType.Knight; break;
                       case "Tre": pieceType = PieceType.Trebuchet; break;
                       case "Eag": pieceType = PieceType.Eagle; break;
                       case "Gia": pieceType = PieceType.Giant; break;
                       case "Asn": pieceType = PieceType.Assassin; break;
                       case "Dra": pieceType = PieceType.Dragon; break;
                       case "Mon": pieceType = PieceType.Monarch; break;
                   }

                   if (!pieceType) throw new Error(`Unknown piece code ${pieceCode}`);

                   // Find which castle can recruit here.
                   // Must be: adjacent, owned by current player, AND a captured castle (not a starting castle)
                   const currentPlayer = engine.getCurrentPlayer(currentState.turnCounter);
                   
                   // DEBUG: Log all castles and their properties
                   console.log(`Looking for castle adjacent to ${parts[0]} (${spawnHex.q},${spawnHex.r},${spawnHex.s}) for player ${currentPlayer}`);
                   currentState.castles.forEach((c, i) => {
                       const adj = c.isAdjacent(spawnHex);
                       console.log(`  Castle ${i}: (${c.hex.q},${c.hex.r},${c.hex.s}) color=${c.color} owner=${c.owner} adjacent=${adj}`);
                   });
                   
                   const castle = currentState.castles.find(c => 
                       c.isAdjacent(spawnHex) && 
                       c.owner === currentPlayer &&
                       c.color !== currentPlayer
                   );
                   if (!castle) throw new Error(`No castle found to recruit at ${parts[0]}`);

                   currentState = PGNService.saveHistoryEntry(currentState, token);
                   currentState = engine.recruitPiece(currentState, castle, spawnHex);
                   
                   // Force the type of the newly created piece to match PGN, just in case
                   // The new piece is the last one in the array
                   const recruitedPieceIndex = currentState.pieces.length - 1;
                   if (recruitedPieceIndex >= 0) {
                       const actualType = currentState.pieces[recruitedPieceIndex].type;
                       if (actualType !== pieceType) {
                           console.warn(`PGN Replay: Recruitment type mismatch. Expected ${pieceType}, got ${actualType}. Correcting...`);
                           const correctedPiece = currentState.pieces[recruitedPieceIndex].with({ type: pieceType });
                           const newPieces = [...currentState.pieces];
                           newPieces[recruitedPieceIndex] = correctedPiece;
                           // Update currentState with corrected piece
                           currentState = {
                               ...currentState,
                               pieces: newPieces,
                               pieceMap: createPieceMap(newPieces)
                           };
                       }
                   }
                   continue;
              }

              // Movement: J10K11
              // Parse using Regex
              const moveMatch = token.match(/^([A-Z]\d+)([A-Z]\d+)$/);
              if (moveMatch) {
                   const startHex = NotationService.fromCoordinate(moveMatch[1]);
                   const endHex = NotationService.fromCoordinate(moveMatch[2]);
                   
                   const mover = currentState.pieces.find(p => p.hex.equals(startHex));
                   if (!mover) throw new Error(`Mover not found at ${moveMatch[1]}`);

                   currentState = PGNService.saveHistoryEntry(currentState, token);
                   currentState = engine.applyMove(currentState, mover, endHex);
                   continue;
              }

          } catch (e) {
              console.error(`Failed to replay move ${token}:`, e);
              break; // Stop replaying on error
          }
      }
      return currentState;
  }

  private static saveHistoryEntry(state: GameState, notation: string): GameState {
      // Helper to push to history before mutation
      const historyEntry = {
          pieces: state.pieces.map(p => p.clone()),
          castles: state.castles.map(c => c.clone()),
          turnCounter: state.turnCounter,
          moveNotation: state.moveHistory, // Snapshot of history so far
      };
      
      return {
          ...state,
          history: [...state.history, historyEntry]
      };
  }
}
