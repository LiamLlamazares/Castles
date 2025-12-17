import { Board, BoardConfig } from "../Core/Board";
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { MoveRecord, Color } from "../../Constants";
import { Hex } from "../Entities/Hex";
import { GameEngine, GameState } from "../Core/GameEngine";
import { MoveTree, MoveNode } from "../Core/MoveTree";
import { PGNParser } from "../Systems/PGNParser";
import { createPieceMap } from "../../utils/PieceMap";
import { NotationService } from "../Systems/NotationService";

import { PieceType, SanctuaryType } from "../../Constants";
import { Sanctuary } from "../Entities/Sanctuary";

// We define a Setup interface for serialization
export interface GameSetup {
  boardConfig: BoardConfig;
  castles: { q: number; r: number; s: number; color: 'w' | 'b' }[];
  pieces: { type: PieceType; q: number; r: number; s: number; color: 'w' | 'b' }[];
  sanctuaries?: { type: SanctuaryType; q: number; r: number; s: number; territorySide: 'w' | 'b'; cooldown: number; hasPledgedThisGame: boolean }[];
}

// Compact types for serialization
interface CompactSetup {
  b: BoardConfig;
  c: [number, number, number, 0 | 1][]; // q, r, s, color (0=w, 1=b)
  p: [PieceType, number, number, number, 0 | 1][]; // type, q, r, s, color
  s?: [SanctuaryType, number, number, number, 0 | 1, number, 0 | 1][]; // type, q, r, s, territorySide, cooldown, hasPledgedThisGame
}

export class PGNService {
  /**
   * Generates a PGN string from the game state.
   */
  public static generatePGN(
    board: Board,
    pieces: Piece[],
    history: MoveRecord[],
    sanctuaries: Sanctuary[] = [],
    gameTags: { [key: string]: string } = {},
    moveTree?: MoveTree
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

  private static renderRecursiveHistory(node: MoveNode, turnNumber: number, color: Color): string {
    if (node.children.length === 0) return "";

    let pgn = "";
    const selectedIndex = node.selectedChildIndex;
    const mainChild = node.children[selectedIndex] || node.children[0];

    // 1. Render main move
    if (color === 'w') {
        pgn += `${turnNumber}. ${mainChild.move.notation} `;
    } else {
        // For black's move, we usually just put the notation.
        // If it's the first move of a variation, we might need 1...
        pgn += `${mainChild.move.notation} `;
    }

    // 2. Render variation branches
    for (let i = 0; i < node.children.length; i++) {
        if (i === selectedIndex) continue;
        const variation = node.children[i];
        
        // Start variation with (
        pgn += `(${this.renderVariationLine(variation, turnNumber, color)}) `;
    }

    // 3. Continue main line
    const nextColor: Color = color === 'w' ? 'b' : 'w';
    const nextTurn = color === 'b' ? turnNumber + 1 : turnNumber;
    pgn += this.renderRecursiveHistory(mainChild, nextTurn, nextColor);

    return pgn;
  }

  private static renderVariationLine(node: MoveNode, turnNumber: number, color: Color): string {
      let pgn = "";
      
      // Start of variation needs correct numbering
      if (color === 'w') {
          pgn += `${turnNumber}. ${node.move.notation} `;
      } else {
          pgn += `${turnNumber}... ${node.move.notation} `;
      }

      // Recursive part for variations of THIS variation
      for (let i = 0; i < node.children.length; i++) {
          if (i === node.selectedChildIndex) continue;
          pgn += `(${this.renderVariationLine(node.children[i], turnNumber, color)}) `;
      }

      // Continue this variation line
      if (node.children.length > 0) {
          const mainNext = node.children[node.selectedChildIndex] || node.children[0];
          const nextColor: Color = color === 'w' ? 'b' : 'w';
          const nextTurn = color === 'b' ? turnNumber + 1 : turnNumber;
          pgn += this.renderRecursiveHistory(mainNext, nextTurn, nextColor);
      }

      return pgn.trim();
  }

  /**
   * Parses a PGN string to recover the GameSetup and Move list.
   * Note: This does NOT replay the moves. It just extracts the initial state and the move strings.
   * You must replay the moves on the Engine to get the final state.
   */
  public static parsePGN(pgn: string): { setup: GameSetup | null; moves: string[]; moveTree: MoveTree } {
    // Normalize newlines and whitespace
    
    // We use a regex loop to find all tags regardless of line breaks.
    const tagRegex = /\[(\w+)\s+"([^"]*)"\]/g;
    let match;
    let lastIndex = 0;
    
    let setup: GameSetup | null = null; 

    while ((match = tagRegex.exec(pgn)) !== null) {
        const tagName = match[1];
        const tagValue = match[2];
        lastIndex = tagRegex.lastIndex;

        if (tagName === 'CustomSetup') {
            try {
                let parsedData: any;
                if (tagValue.trim().startsWith('{')) {
                        parsedData = JSON.parse(tagValue);
                } else {
                        const base64 = tagValue.replace(/\s/g, '');
                        const decoded = atob(base64);
                        parsedData = JSON.parse(decoded.trim());
                }

                if (parsedData.b && parsedData.c && parsedData.p) {
                    setup = PGNService.decompressSetup(parsedData);
                } else {
                    setup = parsedData; 
                }

            } catch (e) {
                console.error("Failed to parse CustomSetup JSON", e);
            }
        }
    }

    // The rest of the string after the last tag is the moves
    const movesString = pgn.substring(lastIndex);

    // Parse into Tree
    const moveTree = PGNParser.parseToTree(movesString);

    // Extract main line for compatibility
    const historyLine = moveTree.getHistoryLine();
    const cleanMoves = historyLine.map(m => m.notation).filter(n => n !== "Start");

    return { setup, moves: cleanMoves, moveTree };
  }
  private static compressSetup(setup: GameSetup): CompactSetup {
      const result: CompactSetup = {
          b: setup.boardConfig,
          c: setup.castles.map(c => [c.q, c.r, c.s, c.color === 'w' ? 0 : 1]),
          p: setup.pieces.map(p => [p.type, p.q, p.r, p.s, p.color === 'w' ? 0 : 1])
      };
      // Only include sanctuaries if present
      if (setup.sanctuaries && setup.sanctuaries.length > 0) {
          result.s = setup.sanctuaries.map(s => [
              s.type, s.q, s.r, s.s, 
              s.territorySide === 'w' ? 0 : 1, 
              s.cooldown, 
              s.hasPledgedThisGame ? 1 : 0
          ]);
      }
      return result;
  }

  private static decompressSetup(compact: CompactSetup): GameSetup {
      const result: GameSetup = {
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
      // Decompress sanctuaries if present
      if (compact.s && compact.s.length > 0) {
          result.sanctuaries = compact.s.map(s => ({
              type: s[0],
              q: s[1],
              r: s[2],
              s: s[3],
              territorySide: s[4] === 0 ? 'w' : 'b',
              cooldown: s[5],
              hasPledgedThisGame: s[6] === 1
          }));
      }
      return result;
  }

  public static reconstructState(setup: GameSetup): { board: Board; pieces: Piece[]; sanctuaries: Sanctuary[] } {
        // Reconstruct Board
        // Convert setup.castles to Castle objects
        const castles = setup.castles.map(c => new Castle(new Hex(c.q, c.r, c.s), c.color, 0));
        
        const board = new Board(setup.boardConfig, castles);
        
        // Convert setup.pieces to Piece objects
        const pieces = setup.pieces.map(p => new Piece(new Hex(p.q, p.r, p.s), p.color, p.type));
        
        // Convert setup.sanctuaries to Sanctuary objects (if present)
        const sanctuaries = setup.sanctuaries?.map(s => new Sanctuary(
            new Hex(s.q, s.r, s.s),
            s.type,
            s.territorySide,
            null, // controller - will be determined by game state
            s.cooldown,
            s.hasPledgedThisGame
        )) || [];
        
        return { board, pieces, sanctuaries };
  }

  public static replayMoveHistory(
      board: Board, 
      initialPieces: Piece[], 
      moves: string[] | MoveTree,
      initialSanctuaries: Sanctuary[] = []
  ): GameState {
      // Initialize fresh engine and state
      const engine = new GameEngine(board);
      const castles = board.castles as Castle[]; 

      let moveTree: MoveTree;
      let moveList: string[] = [];

      if (moves instanceof MoveTree) {
          moveTree = moves;
          // Get main line to replay
          const history = moveTree.getHistoryLine();
          moveList = history.map(h => h.notation).filter(n => n !== "Start");
          // Reset tree to root so we can traverse it during replay
          moveTree.goToRoot();
      } else {
          moveTree = new MoveTree();
          moveList = moves;
      }

      let currentState: GameState = {
          pieces: initialPieces.map(p => p.clone()), 
          pieceMap: createPieceMap(initialPieces),
          castles: castles.map(c => c.clone()),
          sanctuaries: initialSanctuaries.map(s => s.clone()),
          moveTree: moveTree,
          turnCounter: 0, 
          movingPiece: null,
          history: [],
          moveHistory: [],
          graveyard: [],
          phoenixRecords: []
      };

      // Loop through moves and apply them
      for (const token of moveList) {
          try {
              if (token === "Pass") {
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

                  const targetPiece = currentState.pieces.find(p => p.hex.equals(targetHex));
                  if (targetPiece) {
                      currentState = engine.applyAttack(currentState, attacker, targetHex);
                  } else {
                      currentState = engine.applyCastleAttack(currentState, attacker, targetHex);
                  }
                  continue;
              }

              // Recruitment: B2=Kni
              if (token.includes('=')) {
                   const parts = token.split('=');
                   const spawnHex = NotationService.fromCoordinate(parts[0]);
                   const pieceCode = parts[1];
                   
                   let pieceType: PieceType | undefined;
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

                   const currentPlayer = engine.getCurrentPlayer(currentState.turnCounter);
                   const castle = currentState.castles.find(c => 
                       c.isAdjacent(spawnHex) && 
                       c.owner === currentPlayer &&
                       c.color !== currentPlayer
                   );
                   if (!castle) {
                       throw new Error(`No castle found to recruit at ${parts[0]}`);
                   }

                   currentState = PGNService.saveHistoryEntry(currentState, token);
                   currentState = engine.recruitPiece(currentState, castle, spawnHex);
                   
                   const recruitedPieceIndex = currentState.pieces.length - 1;
                   if (recruitedPieceIndex >= 0) {
                       const actualType = currentState.pieces[recruitedPieceIndex].type;
                       if (actualType !== pieceType) {
                           const correctedPiece = currentState.pieces[recruitedPieceIndex].with({ type: pieceType });
                           const newPieces = [...currentState.pieces];
                           newPieces[recruitedPieceIndex] = correctedPiece;
                           currentState = {
                               ...currentState,
                               pieces: newPieces,
                               pieceMap: createPieceMap(newPieces)
                           };
                       }
                   }
                   continue;
              }

              // Pledge: P:WlfK11
              if (token.startsWith('P:')) {
                   const pledgeData = token.substring(2); 
                   const pieceCode = pledgeData.substring(0, 3);
                   const spawnCoord = pledgeData.substring(3);
                   const spawnHex = NotationService.fromCoordinate(spawnCoord);
                   
                   let pieceType: PieceType | undefined;
                   switch(pieceCode) {
                       case "Wlf": pieceType = PieceType.Wolf; break;
                       case "Hea": pieceType = PieceType.Healer; break;
                       case "Rng": pieceType = PieceType.Ranger; break;
                       case "Wiz": pieceType = PieceType.Wizard; break;
                       case "Nec": pieceType = PieceType.Necromancer; break;
                       case "Phx": pieceType = PieceType.Phoenix; break;
                   }
                   
                   if (!pieceType) throw new Error(`Unknown pledge piece code ${pieceCode}`);
                   
                   const currentPlayer = engine.getCurrentPlayer(currentState.turnCounter);
                   const newPiece = new Piece(spawnHex, currentPlayer, pieceType);
                   const newPieces = [...currentState.pieces, newPiece];
                   
                   currentState = PGNService.saveHistoryEntry(currentState, token);
                   currentState = {
                       ...currentState,
                       pieces: newPieces,
                       pieceMap: createPieceMap(newPieces)
                   };
                   
                   currentState = engine.passTurn(currentState);
                   continue;
              }

              // Movement: J10K11
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
              break; 
          }
      }
      return currentState;
  }

  private static saveHistoryEntry(state: GameState, notation: string): GameState {
      // Helper to push to history before mutation
      const historyEntry = {
          pieces: state.pieces.map(p => p.clone()),
          castles: state.castles.map(c => c.clone()),
          sanctuaries: state.sanctuaries.map(s => s.clone()), // Clone sanctuaries too
          turnCounter: state.turnCounter,
          moveNotation: state.moveHistory, // Snapshot of history so far
      };
      
      return {
          ...state,
          history: [...state.history, historyEntry]
      };
  }
}
