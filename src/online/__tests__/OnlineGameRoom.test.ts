import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";
import { OnlineGameRoom } from "../OnlineGameRoom";
import { createPieceMap } from "../../utils/PieceMap";

function createRoom() {
  const board = getStartingBoard(6);
  const pieces = getStartingPieces(6);
  const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, [
    SanctuaryType.WolfCovenant,
    SanctuaryType.SacredSpring,
  ]);

  return OnlineGameRoom.create({
    setup: serializeOnlineGameSetup({
      board,
      pieces,
      sanctuaries,
      sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
      gameRules: { vpModeEnabled: false },
      initialPoolTypes: [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring],
      pieceTheme: "Castles",
    }),
    gameId: "game-test",
    whiteToken: "white-token",
    blackToken: "black-token",
  });
}

describe("OnlineGameRoom", () => {
  it("creates private player links and exposes a versioned initial snapshot", () => {
    const room = createRoom();

    const whiteJoin = room.authenticate("white-token");
    const blackJoin = room.authenticate("black-token");
    const snapshot = room.getSnapshot();

    expect(whiteJoin).toBe("w");
    expect(blackJoin).toBe("b");
    expect(snapshot.gameId).toBe("game-test");
    expect(snapshot.version).toBe(0);
    expect(snapshot.playerToMove).toBe("w");
    expect(snapshot.state.pieces.length).toBeGreaterThan(0);
  });

  it("rejects wrong-player actions before mutating game state", () => {
    const room = createRoom();

    const result = room.submitAction("black-token", {
      type: "PASS",
      baseVersion: 0,
    });

    if (result.ok) throw new Error("expected action to be rejected");
    expect(result.error?.code).toBe("wrong_player");
    expect(room.getSnapshot().version).toBe(0);
  });

  it("rejects stale actions before mutating game state", () => {
    const room = createRoom();

    const result = room.submitAction("white-token", {
      type: "PASS",
      baseVersion: 1,
    });

    if (result.ok) throw new Error("expected action to be rejected");
    expect(result.error?.code).toBe("stale_action");
    expect(room.getSnapshot().version).toBe(0);
  });

  it("accepts a legal action from the active player and records it as authoritative", () => {
    const room = createRoom();

    const result = room.submitAction("white-token", {
      type: "PASS",
      baseVersion: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.version).toBe(1);
    expect(result.snapshot.state.turnCounter).toBeGreaterThan(0);
    expect(result.snapshot.moveHistory.at(-1)?.notation).toBe("Pass");
  });

  it("rejects unknown action payloads without throwing", () => {
    const room = createRoom();

    const result = room.submitAction("white-token", {
      type: "UNKNOWN",
      baseVersion: 0,
    } as any);

    if (result.ok) throw new Error("expected action to be rejected");
    expect(result.error.code).toBe("illegal_action");
    expect(room.getSnapshot().version).toBe(0);
  });

  it("blocks further actions once the rules engine reports a terminal position", () => {
    const room = createRoom();
    const state = (room as any).state;
    const pieces = state.pieces.filter(
      (piece: any) => !(piece.color === "b" && piece.type === "Monarch")
    );
    (room as any).state = {
      ...state,
      pieces,
      pieceMap: createPieceMap(pieces),
    };

    expect(room.getSnapshot().result).toEqual({
      winner: "w",
      reason: "monarch_captured",
    });

    const result = room.submitAction("white-token", {
      type: "PASS",
      baseVersion: 0,
    });

    if (result.ok) throw new Error("expected action to be rejected");
    expect(result.error.code).toBe("game_over");
    expect(room.getSnapshot().version).toBe(0);
  });

  it("reports castle-control victories distinctly from monarch capture", () => {
    const room = createRoom();
    const state = (room as any).state;
    (room as any).state = {
      ...state,
      castles: state.castles.map((castle: any) => castle.with({ owner: "w" })),
    };

    expect(room.getSnapshot().result).toEqual({
      winner: "w",
      reason: "castle_control",
    });
  });

  it("reports victory-point wins distinctly from monarch capture", () => {
    const room = createRoom();
    const state = (room as any).state;
    (room as any).state = {
      ...state,
      victoryPoints: { w: 10, b: 0 },
    };

    expect(room.getSnapshot().result).toEqual({
      winner: "w",
      reason: "victory_points",
    });
  });
});
