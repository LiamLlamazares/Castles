import type { Board } from "../Classes/Core/Board";
import type { MoveTree } from "../Classes/Core/MoveTree";
import { MoveTree as MoveTreeClass } from "../Classes/Core/MoveTree";
import type { Piece } from "../Classes/Entities/Piece";
import type { Sanctuary } from "../Classes/Entities/Sanctuary";
import { PGNService, type ReplayDiagnostic } from "../Classes/Services/PGNService";
import type { SanctuaryType } from "../Constants";
import { createMoveTreeFromHistory, hydrateOnlineGameSetupDTO } from "./serialization";
import type { OnlineGameSnapshotDTO } from "./types";

interface AnalysisReplayGameSettings {
  sanctuaryUnlockTurn: number;
  sanctuaryRechargeTurns: number;
}

export interface HydrateAnalysisMoveTreeInput {
  board: Board;
  pieces: Piece[];
  moveTree: MoveTree;
  sanctuaries?: Sanctuary[];
  gameSettings?: AnalysisReplayGameSettings;
  initialPoolTypes?: SanctuaryType[];
  initialTurnCounter?: number;
}

export type HydrateAnalysisMoveTreeResult =
  | { status: "complete"; moveTree: MoveTree; diagnostics: ReplayDiagnostic[] }
  | { status: "limited"; moveTree: MoveTree; diagnostics: ReplayDiagnostic[]; error: unknown };

export function hydrateAnalysisMoveTreeFromSetup(
  input: HydrateAnalysisMoveTreeInput
): HydrateAnalysisMoveTreeResult {
  const moveTree = input.moveTree.clone();
  const diagnostics: ReplayDiagnostic[] = [];

  try {
    PGNService.replayMoveHistory(
      input.board,
      input.pieces,
      moveTree,
      input.sanctuaries ?? [],
      input.gameSettings,
      {
        diagnostics,
        strict: true,
        initialSanctuaryPool: input.initialPoolTypes,
        initialTurnCounter: input.initialTurnCounter,
      }
    );

    return { status: "complete", moveTree, diagnostics };
  } catch (error) {
    return {
      status: "limited",
      moveTree: input.moveTree.clone(),
      diagnostics,
      error,
    };
  }
}

export function hydrateAnalysisMoveTreeFromOnlineSnapshot(
  snapshot: OnlineGameSnapshotDTO
): HydrateAnalysisMoveTreeResult {
  if (snapshot.moveHistory.length === 0) {
    return {
      status: "complete",
      moveTree: createMoveTreeFromHistory([], snapshot.state),
      diagnostics: [],
    };
  }

  const setup = hydrateOnlineGameSetupDTO(snapshot.setup);
  const moveTree = new MoveTreeClass();
  for (const record of snapshot.moveHistory) {
    moveTree.addMove(record);
  }

  return hydrateAnalysisMoveTreeFromSetup({
    board: setup.board,
    pieces: setup.pieces,
    moveTree,
    sanctuaries: setup.sanctuaries,
    gameSettings: setup.sanctuarySettings
      ? {
          sanctuaryUnlockTurn: setup.sanctuarySettings.unlockTurn,
          sanctuaryRechargeTurns: setup.sanctuarySettings.cooldown,
        }
      : undefined,
    initialPoolTypes: setup.initialPoolTypes,
  });
}
