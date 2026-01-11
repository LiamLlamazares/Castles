import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Sanctuary } from "../Entities/Sanctuary";
import { MoveTree } from "./MoveTree";
import { Color, SanctuaryType, MoveRecord } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";

// Phoenix Rebirth Record
export interface PhoenixRecord {
    respawnTurn: number;
    owner: Color;
}

/**
 * Represents the state of a single position in the game.
 * Used for history snapshots in MoveTree nodes.
 */
export interface PositionSnapshot {
  pieces: Piece[];
  pieceMap: PieceMap; // O(1) lookup
  castles: Castle[];
  sanctuaries: Sanctuary[];
  sanctuaryPool: SanctuaryType[];
  turnCounter: number;
  graveyard: Piece[];
  phoenixRecords: PhoenixRecord[];
  victoryPoints?: { w: number, b: number };
}


/**
 * Represents the complete runtime state of the game application.
 * Includes the history tree and UI-specific state.
 */
export interface GameState extends PositionSnapshot {
  // Session / UI State
  movingPiece: Piece | null;
  moveTree: MoveTree; // SINGLE SOURCE OF TRUTH for history and variations
  viewNodeId: string | null; // Node ID for history navigation (null = live)
  
  // Settings / Rules (Stable throughout game)
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
}
