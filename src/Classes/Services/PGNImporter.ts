/**
 * @file PGNImporter.ts
 * @description Parses PGN strings and reconstructs game state.
 *
 * Part of the PGN service split for better modularity.
 * Handles:
 * - Parsing PGN format to extract setup and moves
 * - Decompressing setup data
 * - Reconstructing Board, Pieces, and Sanctuaries
 * - Replaying move history to rebuild full game state
 *
 * @see PGNGenerator - For generating PGN strings
 * @see PGNService - Facade that re-exports both
 */
import { Board } from "../Core/Board";
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Color } from "../../Constants";
import { Hex } from "../Entities/Hex";
import { GameEngine, GameState } from "../Core/GameEngine";
import { MoveTree } from "../Core/MoveTree";
import { PGNParser } from "../Systems/PGNParser";
import { createPieceMap } from "../../utils/PieceMap";
import { NotationService } from "../Systems/NotationService";
import { PieceType } from "../../Constants";
import { Sanctuary } from "../Entities/Sanctuary";
import { GameSetup, CompactSetup } from "./PGNTypes";

export class PGNImporter {
  /**
   * Parses a PGN string to recover the GameSetup and Move list.
   * Note: This does NOT replay the moves. It just extracts the initial state and the move strings.
   * You must replay the moves on the Engine to get the final state.
   */
  public static parsePGN(pgn: string): { setup: GameSetup | null; moves: string[]; moveTree: MoveTree } {
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
                    setup = PGNImporter.decompressSetup(parsedData);
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

  /**
   * Decompresses a CompactSetup back to full GameSetup format.
   */
  public static decompressSetup(compact: CompactSetup): GameSetup {
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

  /**
   * Reconstructs Board, Pieces, and Sanctuaries from a GameSetup.
   */
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

  /**
   * Replays a list of move notations to rebuild full game state.
   * Used when importing a PGN to get the complete history with snapshots.
   */
  public static replayMoveHistory(
      board: Board, 
      initialPieces: Piece[], 
      moves: string[],
      initialSanctuaries: Sanctuary[] = []
  ): GameState {
      // Initialize fresh engine and state
      const engine = new GameEngine(board);
      const castles = board.castles as Castle[]; 

      // Create fresh MoveTree for the replay
      const moveTree = new MoveTree();

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

      // NOTE: Don't manually add moves to tree here!
      // The engine methods (applyMove, applyAttack, etc.) already call
      // StateMutator which handles recording moves to the tree with snapshots.

      // Loop through moves and apply them
      for (const token of moves) {
          // Save state to history before applying move
          currentState = PGNImporter.saveSnapshot(currentState);

          try {
              const currentPlayer = engine.getCurrentPlayer(currentState.turnCounter) as Color;
              
              if (token === "Pass") {
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

                   const castle = currentState.castles.find(c => 
                       c.isAdjacent(spawnHex) && 
                       c.owner === currentPlayer &&
                       c.color !== currentPlayer
                   );
                   if (!castle) {
                       throw new Error(`No castle found to recruit at ${parts[0]}`);
                   }

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
                   
                   const newPiece = new Piece(spawnHex, currentPlayer, pieceType);
                   const newPieces = [...currentState.pieces, newPiece];
                   
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

  /**
   * Saves a snapshot of the current state to the history array.
   * DOES NOT update moveHistory or add to MoveTree (that is handled by StateMutator or the caller).
   * This is purely for timeline navigation.
   */
  private static saveSnapshot(state: GameState): GameState {
      const historyEntry = {
          pieces: state.pieces.map(p => p.clone()),
          castles: state.castles.map(c => c.clone()),
          sanctuaries: state.sanctuaries.map(s => s.clone()),
          turnCounter: state.turnCounter,
          moveNotation: [...state.moveHistory], // Snapshot the history at this point
      };
      
      return {
          ...state,
          history: [...state.history, historyEntry]
      };
  }
}
