import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";
import { OnlineGameRoom } from "../OnlineGameRoom";
import { createPieceMap } from "../../utils/PieceMap";
import type { OnlineGameSetupDTO } from "../types";

function createRoom(options: {
  now?: () => number;
  timeControl?: OnlineGameSetupDTO["timeControl"];
  acceptedActions?: any[];
  timeout?: any;
} = {}) {
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
      timeControl: options.timeControl,
    }),
    gameId: "game-test",
    whiteToken: "white-token",
    blackToken: "black-token",
    acceptedActions: options.acceptedActions,
    timeout: options.timeout,
    now: options.now,
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

  it("includes authoritative server clock state for clocked online games", () => {
    const room = createRoom({
      now: () => 1_000,
      timeControl: { initial: 1, increment: 2 },
    });

    expect(room.getSnapshot().clock).toEqual({
      timeControl: { initialMs: 60_000, incrementMs: 2_000 },
      remainingMs: { w: 60_000, b: 60_000 },
      activeColor: "w",
      runningSince: 1_000,
      serverNow: 1_000,
    });
  });

  it("deducts elapsed server time and applies increment when the active color changes", () => {
    let now = 1_000;
    const room = createRoom({
      now: () => now,
      timeControl: { initial: 1, increment: 2 },
    });

    now = 11_000;
    const result = room.submitAction("white-token", {
      type: "PASS",
      baseVersion: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.version).toBe(1);
    const firstClock = result.snapshot.clock;
    const firstActionChangedActiveColor = firstClock?.activeColor !== "w";
    expect(firstClock?.remainingMs.w).toBe(firstActionChangedActiveColor ? 52_000 : 50_000);
    expect(result.snapshot.clock?.remainingMs.b).toBe(60_000);
    expect(result.snapshot.clock?.activeColor).not.toBeNull();

    now = 21_000;
    const activeToken = result.snapshot.clock?.activeColor === "b" ? "black-token" : "white-token";
    const secondResult = room.submitAction(activeToken, {
      type: "PASS",
      baseVersion: 1,
    });

    expect(secondResult.ok).toBe(true);
    expect(secondResult.snapshot.clock?.activeColor).not.toBeNull();
  });

  it("adjudicates timeout as a persisted terminal state with an advanced version", () => {
    let now = 0;
    const room = createRoom({
      now: () => now,
      timeControl: { initial: 1, increment: 0 },
    });

    now = 61_000;
    const timeout = (room as any).adjudicateTimeout();

    expect(timeout).toMatchObject({
      playerColor: "w",
      version: 1,
      result: { winner: "b", reason: "timeout" },
      clock: {
        remainingMs: { w: 0, b: 60_000 },
        activeColor: null,
        runningSince: null,
      },
    });
    expect(room.getSnapshot()).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
      clock: {
        remainingMs: { w: 0, b: 60_000 },
        activeColor: null,
      },
    });
  });

  it("replays persisted clock state without applying live elapsed time on startup", () => {
    const room = createRoom({
      now: () => 999_000,
      timeControl: { initial: 1, increment: 2 },
      acceptedActions: [
        {
          playerColor: "w",
          action: { type: "PASS", baseVersion: 0 },
          version: 1,
          playedAt: 11_000,
          clock: {
            remainingMs: { w: 50_000, b: 60_000 },
            activeColor: "w",
            runningSince: 11_000,
          },
        },
      ],
    });

    expect(room.getSnapshot()).toMatchObject({
      version: 1,
      clock: {
        remainingMs: { w: 50_000, b: 60_000 },
        activeColor: "w",
        runningSince: 11_000,
        serverNow: 999_000,
      },
    });
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
