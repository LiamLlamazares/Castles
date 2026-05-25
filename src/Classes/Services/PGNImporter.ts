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
import { GameEngine } from "../Core/GameEngine";
import { GameState, PositionSnapshot } from "../Core/GameState";
import { MoveTree, MoveNode } from "../Core/MoveTree";
import { PGNParser } from "../Systems/PGNParser";
import { createPieceMap } from "../../utils/PieceMap";
import { NotationService } from "../Systems/NotationService";
import { PieceType, AbilityType, SanctuaryType } from "../../Constants";
import { Sanctuary } from "../Entities/Sanctuary";
import { GameSetup, CompactSetup } from "./PGNTypes";

export interface ReplayDiagnostic {
  notation: string;
  message: string;
  nodeId?: string;
}

export interface ReplayOptions {
  strict?: boolean;
  diagnostics?: ReplayDiagnostic[];
  initialSanctuaryPool?: SanctuaryType[];
  initialTurnCounter?: number;
}

export class PGNImporter {
  /**
   * Parses a PGN string to recover the GameSetup and Move list.
   * Note: This does NOT replay the moves. It just extracts the initial state and the move strings.
   * You must replay the moves on the Engine to get the final state.
   */
  public static parsePGN(pgn: string): { setup: GameSetup | null; moves: string[]; moveTree: MoveTree } {
    // Parse only the contiguous header tag section at the start of the PGN.
    // Tag values may contain escaped quotes for legacy raw JSON CustomSetup tags.
    const tagRegex = /\[(\w+)\s+"((?:\\.|[^"\\])*)"\]/y;
    let cursor = 0;
    
    let setup: GameSetup | null = null; 

    while (cursor < pgn.length) {
        const whitespace = pgn.slice(cursor).match(/^\s*/)?.[0] ?? "";
        cursor += whitespace.length;

        if (pgn[cursor] !== "[") {
            break;
        }

        tagRegex.lastIndex = cursor;
        const match = tagRegex.exec(pgn);
        if (!match) {
            break;
        }

        const tagName = match[1];
        const tagValue = PGNImporter.unescapeTagValue(match[2]);
        cursor = tagRegex.lastIndex;

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
    const movesString = pgn.substring(cursor);

    // Parse into Tree
    const moveTree = PGNParser.parseToTree(movesString);

    // Extract main line for compatibility
    const historyLine = moveTree.getHistoryLine();
    const cleanMoves = historyLine.map(m => m.notation).filter(n => n !== "Start");

    return { setup, moves: cleanMoves, moveTree };
  }

  private static unescapeTagValue(value: string): string {
      return value.replace(/\\(["\\])/g, "$1");
  }

  private static getPromotionPieceType(code: string): PieceType | undefined {
      switch (code) {
          case "Ar":
          case "Arc": return PieceType.Archer;
          case "Kn":
          case "Kni": return PieceType.Knight;
          case "Tr":
          case "Tre": return PieceType.Trebuchet;
          case "Ea":
          case "Eag": return PieceType.Eagle;
          case "Gi":
          case "Gia": return PieceType.Giant;
          case "As":
          case "Asn": return PieceType.Assassin;
          case "Dr":
          case "Dra": return PieceType.Dragon;
          default: return undefined;
      }
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
              color: c[3] === 0 ? 'w' : 'b',
              turns_controlled: c[4] ?? 0,
              used_this_turn: c[5] === 1,
              owner: c[6] === undefined ? (c[3] === 0 ? 'w' : 'b') : (c[6] === 0 ? 'w' : 'b')
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
      // Decompress game settings if present
      if (compact.g) {
          result.gameSettings = {
              sanctuaryUnlockTurn: compact.g[0],
              sanctuaryRechargeTurns: compact.g[1]
          };
      }
      if (compact.sp) {
          result.sanctuaryPool = [...compact.sp];
      }
      result.turnCounter = compact.tc ?? 0;
      return result;
  }

  /**
   * Reconstructs Board, Pieces, and Sanctuaries from a GameSetup.
   */
  public static reconstructState(setup: GameSetup): { board: Board; pieces: Piece[]; sanctuaries: Sanctuary[] } {
        // Reconstruct Board
        // Convert setup.castles to Castle objects
        const castles = setup.castles.map(c => new Castle(
            new Hex(c.q, c.r, c.s),
            c.color,
            c.turns_controlled ?? 0,
            c.used_this_turn ?? false,
            c.owner ?? c.color
        ));
        
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
   * Recursive tree processing to "hydrate" the skeletal PGNParser tree
   * with actual GameStates (snapshots) and validated move details.
   */
  private static hydrateRecursive(
      node: MoveNode, 
      engine: GameEngine, 
      currentState: GameState,
      options: ReplayOptions = {}
  ): void {
      for (const child of node.children) {
          // Clone state for this branch
          let branchState = { ...currentState }; 
          
          // Re-clone mutable arrays to ensure isolation between siblings
          // (Although state is mostly immutable, strict safety is good)
          // Actually, applyMove returns a new state, so we just need to ensure
          // we start from the 'currentState' (which is the parent's state).
          // Since we reuse 'currentState' for each child loop iteration, it is safe.
          
          const rawToken = child.move.notation;
          // Sanitize token (remove check/mate suffixes, but preserve = for recruitment)
          const token = rawToken.replace(/[+#?!]+$/g, "");

          // Logic from replayMoveHistory (Execute move)
          try {
               const currentPlayer = engine.getCurrentPlayer(currentState.turnCounter) as Color;
               let nextState = currentState;
               let handled = false;

               if (token === "Pass") {
                   nextState = engine.passTurn(currentState);
                   handled = true;
               }
               // Attack: J10xK11
               else if (token.includes('x')) {
                   const parts = token.split('x');
                   const startHex = NotationService.fromCoordinate(parts[0]);
                   const targetHex = NotationService.fromCoordinate(parts[1]);

                   const attacker = currentState.pieces.find(p => p.hex.equals(startHex));
                   if (!attacker) throw new Error(`Attacker not found at ${parts[0]}`);

                   const targetPiece = currentState.pieces.find(p => p.hex.equals(targetHex));
                   if (targetPiece) {
                       nextState = engine.applyAttack(currentState, attacker, targetHex);
                   } else {
                       nextState = engine.applyCastleAttack(currentState, attacker, targetHex);
                   }
                   handled = true;
               }
               // Promotion movement: J8J7=Dr or J8J7=Dra
               else if (/^[A-Z]\d+[A-Z]\d+=/.test(token)) {
                   const promotionMatch = token.match(/^([A-Z]\d+)([A-Z]\d+)=([A-Za-z]{2,3})$/);
                   if (!promotionMatch) {
                       throw new Error(`Invalid promotion notation ${token}`);
                   }

                   const startHex = NotationService.fromCoordinate(promotionMatch[1]);
                   const endHex = NotationService.fromCoordinate(promotionMatch[2]);
                   const promotionType = PGNImporter.getPromotionPieceType(promotionMatch[3]);
                   if (!promotionType) {
                       throw new Error(`Unknown promotion piece code ${promotionMatch[3]}`);
                   }

                   const mover = currentState.pieces.find(p => p.hex.equals(startHex));
                   if (!mover) throw new Error(`Mover not found at ${promotionMatch[1]}`);

                   nextState = engine.applyMove(currentState, mover, endHex);
                   if (!nextState.promotionPending) {
                       throw new Error(`Promotion pending not found after ${promotionMatch[1]}${promotionMatch[2]}`);
                   }
                   nextState = engine.promotePiece(nextState, nextState.promotionPending, promotionType);
                   handled = true;
               }
               // Recruitment: B2=Kni
               else if (token.includes('=')) {
                   const [locPart, pieceCode] = token.split('=');
                   const spawnHex = NotationService.fromCoordinate(locPart);
                   
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
                   if (!castle) throw new Error(`No castle found to recruit at ${locPart}`);

                   nextState = engine.recruitPiece(currentState, castle, spawnHex);
                   
                   // Fix random piece type if it doesn't match PGN
                   const recruitedPieceIndex = nextState.pieces.length - 1;
                   if (recruitedPieceIndex >= 0) {
                       const actualType = nextState.pieces[recruitedPieceIndex].type;
                       if (actualType !== pieceType) {
                           const correctedPiece = nextState.pieces[recruitedPieceIndex].with({ type: pieceType });
                           const newPieces = [...nextState.pieces];
                           newPieces[recruitedPieceIndex] = correctedPiece;
                           nextState = {
                               ...nextState,
                               pieces: newPieces,
                               pieceMap: createPieceMap(newPieces)
                           };
                       }
                   }
                   handled = true;
               }
                // Pledge: P:WlfK11
                else if (token.startsWith('P:')) {
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
                    
                    // Find the sanctuary that produced this piece type
                    const sanctuary = currentState.sanctuaries.find(s => 
                        s.pieceType === pieceType && s.isReady
                    );
                    
                    if (sanctuary) {
                        try {
                            // Use the engine's pledge method for full evolution logic
                            nextState = engine.pledge(currentState, sanctuary.hex, spawnHex);
                        } catch (pledgeError) {
                            // Fallback to manual spawn on pledge failure
                            const newPiece = new Piece(spawnHex, currentPlayer, pieceType);
                            const newPieces = [...currentState.pieces, newPiece];
                            
                            nextState = {
                                ...currentState,
                                pieces: newPieces,
                                pieceMap: createPieceMap(newPieces)
                            };
                            nextState = engine.passTurn(nextState);
                        }
                    } else {
                        // Fallback: Just spawn the piece (legacy PGN compatibility)
                        const newPiece = new Piece(spawnHex, currentPlayer, pieceType);
                        const newPieces = [...nextState.pieces, newPiece];
                        
                        nextState = {
                            ...nextState,
                            pieces: newPieces,
                            pieceMap: createPieceMap(newPieces)
                        };
                        nextState = engine.passTurn(nextState);
                    }
                    handled = true;
                }
                // Movement: J10K11
                else {
                    // Check for Ability Notation (e.g. WT:J10K11)
                    if (token.includes(':') && !token.startsWith('P:')) {
                        const [fullCode, coords] = token.split(':');
                        const coordMatch = coords.match(/^([A-Z]\d+)([A-Z]\d+)$/);
                        
                        if (coordMatch) {
                            const startHex = NotationService.fromCoordinate(coordMatch[1]);
                            const targetHex = NotationService.fromCoordinate(coordMatch[2]);
                            
                            // Extract ability char (last char of prefix, e.g. 'T' from 'WT')
                            // This supports both 'WT' and legacy 'T' if valid
                            const aChar = fullCode.charAt(fullCode.length - 1);
                            
                            let ability: AbilityType | undefined;
                            switch (aChar) {
                                case "T": ability = AbilityType.Teleport; break;
                                case "F": ability = AbilityType.Fireball; break;
                                case "R": ability = AbilityType.RaiseDead; break;
                            }
                            
                            if (ability) {
                                nextState = engine.activateAbility(currentState, startHex, targetHex, ability);
                                handled = true;
                            } else {
                                throw new Error(`Unknown ability code ${fullCode}`);
                            }
                        }
                    } 
                    // Standard Move
                    else {
                        const moveMatch = token.match(/^([A-Z]\d+)([A-Z]\d+)$/);
                        if (moveMatch) {
                            const startHex = NotationService.fromCoordinate(moveMatch[1]);
                            const endHex = NotationService.fromCoordinate(moveMatch[2]);
                            
                            // DEBUG: Uncomment these logs if piece lookup issues occur
                            // console.log('[Hydrate] Looking for piece at', moveMatch[1], '-> Hex:', startHex.q, startHex.r, startHex.s);
                            // console.log('[Hydrate] Available pieces:', currentState.pieces.map(p => `${p.type}@(${p.hex.q},${p.hex.r},${p.hex.s})`).join(', '));
                            
                            const mover = currentState.pieces.find(p => p.hex.equals(startHex));
                            if (!mover) throw new Error(`Mover not found at ${moveMatch[1]}`);
        
                            nextState = engine.applyMove(currentState, mover, endHex);
                            handled = true;
                        }
                    }
                }

               if (!handled) {
                   throw new Error(`Unrecognized PGN replay token ${token}`);
               }

               // 1. Capture snapshot for this child
               // We need a snapshot of the state AFTER the move
               const snapshot: PositionSnapshot = {
                   pieces: nextState.pieces.map(p => p.clone()),
                   pieceMap: createPieceMap(nextState.pieces),
                   castles: nextState.castles.map(c => c.clone()),
                   sanctuaries: nextState.sanctuaries.map(s => s.clone()),
                   turnCounter: nextState.turnCounter,
                   sanctuaryPool: [...nextState.sanctuaryPool],
                   graveyard: nextState.graveyard.map(p => p.clone()),
                   phoenixRecords: [...nextState.phoenixRecords],
               };
               
               // 2. Update child node with HYDRATED data
               child.snapshot = snapshot;
               child.move = {
                   ...child.move,
                   turnNumber: Math.floor(nextState.turnCounter / 10) + 1,
                   color: currentPlayer,
                   phase: engine.getTurnPhase(nextState.turnCounter)
               };

               // Important: The snapshot needs the current history line
               // Since we are hydrating, we can just let createHistorySnapshot handle it 
               // if we were using it, but here we manually build it.
               
               // 3. Recurse
               PGNImporter.hydrateRecursive(child, engine, nextState, options);
               
          } catch (e) {
               const message = e instanceof Error ? e.message : String(e);
               options.diagnostics?.push({
                   notation: token,
                   message,
                   nodeId: child.id
               });

               if (options.strict) {
                   throw new Error(`Failed to hydrate PGN node ${token}: ${message}`);
               }
          }
      }
  }

  /**
   * Replays a MoveTree (or list of moves) to rebuild full game state with variations.
   */
  public static replayMoveHistory(
      board: Board, 
      initialPieces: Piece[], 
      moveTree: MoveTree,
      initialSanctuaries: Sanctuary[] = [],
      gameSettings?: { sanctuaryUnlockTurn: number, sanctuaryRechargeTurns: number },
      options: ReplayOptions = {}
  ): GameState {
      // Initialize fresh engine and state
      const engine = new GameEngine(board);
      const castles = board.castles as Castle[]; 

      // Initial State
      const { SanctuaryType } = require("../../Constants");
      const usedTypes = initialSanctuaries.map(s => s.type);
      const sanctuaryPool = options.initialSanctuaryPool ?? Object.values(SanctuaryType).filter(
        (t): t is import("../../Constants").SanctuaryType => !usedTypes.includes(t as any)
      );

      const sanctuarySettings = gameSettings ? {
          unlockTurn: gameSettings.sanctuaryUnlockTurn,
          cooldown: gameSettings.sanctuaryRechargeTurns
      } : undefined;

      const initialState: GameState = {
          pieces: initialPieces.map(p => p.clone()), 
          pieceMap: createPieceMap(initialPieces),
          castles: castles.map(c => c.clone()),
          sanctuaries: initialSanctuaries.map(s => s.clone()),
          sanctuaryPool,
          sanctuarySettings,
          moveTree: moveTree, 
          turnCounter: options.initialTurnCounter ?? 0,
          movingPiece: null,
          graveyard: [],
          phoenixRecords: [],
          viewNodeId: null
      };

      // Set Root Snapshot (Initial State)
      moveTree.rootNode.snapshot = {
          pieces: initialState.pieces.map(p => p.clone()),
          pieceMap: initialState.pieceMap,
          castles: initialState.castles.map(c => c.clone()),
          sanctuaries: initialState.sanctuaries.map(s => s.clone()),
          turnCounter: initialState.turnCounter,
          sanctuaryPool: [...initialState.sanctuaryPool],
          graveyard: [],
          phoenixRecords: []
      };

      // Recursive Hydration
      PGNImporter.hydrateRecursive(moveTree.rootNode, engine, initialState, options);
      
      // Auto-navigate to end of line
      let node = moveTree.rootNode;
      while (node.children.length > 0) {
          const next = node.children[node.selectedChildIndex] || node.children[0];
          moveTree.setCurrentNode(next);
          node = next;
      }
      
      // Return the state at the end of the line
      if (moveTree.current.snapshot) {
         const snap = moveTree.current.snapshot;
         
         return {
             ...initialState,
             pieces: snap.pieces.map((p: Piece) => p.clone()),
             castles: snap.castles.map((c: Castle) => c.clone()),
             sanctuaries: snap.sanctuaries.map((s: Sanctuary) => s.clone()),
             turnCounter: snap.turnCounter,
             pieceMap: createPieceMap(snap.pieces),
             sanctuaryPool: [...snap.sanctuaryPool],
             graveyard: snap.graveyard.map((p: Piece) => p.clone()),
             phoenixRecords: [...snap.phoenixRecords],
             moveTree: moveTree
         };
      }
      
      return initialState;
  }
}
