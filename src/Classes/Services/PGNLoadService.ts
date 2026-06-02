import { Board } from "../Core/Board";
import { MoveTree } from "../Core/MoveTree";
import { Piece } from "../Entities/Piece";
import { Sanctuary } from "../Entities/Sanctuary";
import { Castle } from "../Entities/Castle";
import { SanctuaryType } from "../../Constants";
import { PhoenixRecord } from "../Core/GameState";
import { PGNService, ReplayDiagnostic } from "./PGNService";

export interface PGNLoadResult {
  board: Board;
  pieces: Piece[];
  moveTree: MoveTree;
  turnCounter: number;
  sanctuaries: Sanctuary[];
  castles: Castle[];
  graveyard: Piece[];
  phoenixRecords: PhoenixRecord[];
  promotionPending: Piece | null;
  victoryPoints?: { w: number; b: number };
  sanctuarySettings?: { unlockTurn: number; cooldown: number };
  sanctuaryPool?: SanctuaryType[];
  diagnostics?: ReplayDiagnostic[];
}

export function loadPGNText(pgn: string): PGNLoadResult | null {
  const { setup, moveTree } = PGNService.parsePGN(pgn);

  if (!setup) {
    console.error("[loadPGN] Failed to parse PGN setup");
    return null;
  }

  const { board, pieces: startPieces, sanctuaries: startSanctuaries } = PGNService.reconstructState(setup);

  const importedSettings = setup.gameSettings ? {
    unlockTurn: setup.gameSettings.sanctuaryUnlockTurn,
    cooldown: setup.gameSettings.sanctuaryRechargeTurns
  } : undefined;

  try {
    const diagnostics: ReplayDiagnostic[] = [];
    const finalState = PGNService.replayMoveHistory(
      board,
      startPieces,
      moveTree,
      startSanctuaries,
      setup.gameSettings,
      {
        diagnostics,
        initialSanctuaryPool: setup.sanctuaryPool,
        initialTurnCounter: setup.turnCounter
      }
    );

    if (diagnostics.length > 0) {
      console.error("[loadPGN] Replay diagnostics", diagnostics);
      return null;
    }

    return {
      board,
      pieces: finalState.pieces,
      castles: finalState.castles,
      graveyard: finalState.graveyard,
      phoenixRecords: finalState.phoenixRecords,
      promotionPending: finalState.promotionPending ?? null,
      victoryPoints: finalState.victoryPoints,
      sanctuaries: finalState.sanctuaries,
      moveTree: finalState.moveTree!,
      turnCounter: finalState.turnCounter,
      sanctuarySettings: importedSettings,
      sanctuaryPool: finalState.sanctuaryPool,
      diagnostics
    };
  } catch (error) {
    console.error("Failed to replay moves:", error);
    return {
      board,
      pieces: startPieces,
      castles: board.castles,
      graveyard: [],
      phoenixRecords: [],
      promotionPending: null,
      sanctuaries: startSanctuaries,
      moveTree: new MoveTree(),
      turnCounter: setup.turnCounter ?? 0,
      diagnostics: [{
        notation: "<replay>",
        message: error instanceof Error ? error.message : String(error)
      }]
    };
  }
}
