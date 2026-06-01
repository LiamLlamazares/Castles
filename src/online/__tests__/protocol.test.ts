import { describe, expect, it } from "vitest";
import { validateOnlineServerMessage } from "../protocol";
import { OnlineGameService } from "../OnlineGameService";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";
import { serializeOnlineGameSetup } from "../serialization";

function snapshot(version = 1) {
  return {
    gameId: "game_protocol",
    version,
    setup: { board: { config: { nSquares: 6 }, castles: [] }, pieces: [], sanctuaries: [] },
    state: {
      pieces: [],
      castles: [],
      sanctuaries: [],
      turnCounter: 0,
      sanctuaryPool: [],
      graveyard: [],
      phoenixRecords: [],
      promotionPending: null,
    },
    moveHistory: [],
    playerToMove: "w",
    turnPhase: "Movement",
  };
}

function createRealSnapshot() {
  const board = getStartingBoard(6);
  const pieces = getStartingPieces(6);
  const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, [
    SanctuaryType.WolfCovenant,
    SanctuaryType.SacredSpring,
  ]);
  const service = new OnlineGameService({
    idFactory: () => "game_real_snapshot",
    tokenFactory: (seat) => `${seat}-token`,
  });
  const created = service.createGame(
    serializeOnlineGameSetup({
      board,
      pieces,
      sanctuaries,
      sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
      gameRules: { vpModeEnabled: false },
      initialPoolTypes: [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring],
      pieceTheme: "Castles",
      timeControl: { initial: 20, increment: 20 },
    }),
    { publicBaseUrl: "https://castles.example" }
  );
  return service.getRoomForToken(created.gameId, created.white.token)!.getSnapshot();
}

describe("online server protocol validation", () => {
  it("accepts known server message envelopes", () => {
    expect(
      validateOnlineServerMessage({
        type: "joined",
        color: "w",
        snapshot: snapshot(),
      })
    ).toEqual({
      ok: true,
      value: {
        type: "joined",
        color: "w",
        snapshot: snapshot(),
      },
    });
    expect(
      validateOnlineServerMessage({
        type: "spectating",
        snapshot: snapshot(),
      }).ok
    ).toBe(true);
    expect(validateOnlineServerMessage({ type: "snapshot", snapshot: snapshot(2) }).ok).toBe(true);
    expect(validateOnlineServerMessage({ type: "pong", clientTime: 123, serverTime: 456 }).ok).toBe(true);
    expect(
      validateOnlineServerMessage({
        type: "rejected",
        error: { code: "stale_action", message: "Old version." },
        snapshot: snapshot(),
      }).ok
    ).toBe(true);
    expect(
      validateOnlineServerMessage({
        type: "error",
        error: { code: "bad_request", message: "Nope." },
      }).ok
    ).toBe(true);
  });

  it("rejects unknown or malformed server messages", () => {
    expect(validateOnlineServerMessage({ type: "joined", color: "w" }).ok).toBe(false);
    expect(validateOnlineServerMessage({ type: "joined", color: "green", snapshot: snapshot() }).ok).toBe(false);
    expect(validateOnlineServerMessage({ type: "snapshot", snapshot: { gameId: "game_bad" } }).ok).toBe(false);
    expect(validateOnlineServerMessage({ type: "error", error: { code: "bad_request" } }).ok).toBe(false);
    expect(validateOnlineServerMessage({ type: "mystery", snapshot: snapshot() }).ok).toBe(false);
  });

  it("rejects nested malformed snapshots before hooks can apply them", () => {
    expect(
      validateOnlineServerMessage({
        type: "snapshot",
        snapshot: {
          ...snapshot(),
          setup: {},
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineServerMessage({
        type: "snapshot",
        snapshot: {
          ...snapshot(),
          state: {},
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineServerMessage({
        type: "snapshot",
        snapshot: {
          ...snapshot(),
          turnPhase: "Castle",
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineServerMessage({
        type: "snapshot",
        snapshot: {
          ...snapshot(),
          moveHistory: [{ notation: "H12H11", turnNumber: 1, color: "w", phase: "Castle" }],
        },
      }).ok
    ).toBe(false);
  });

  it("rejects malformed optional result and clock snapshots", () => {
    expect(
      validateOnlineServerMessage({
        type: "snapshot",
        snapshot: {
          ...snapshot(),
          result: { winner: "green", reason: "resignation" },
        },
      }).ok
    ).toBe(false);
    expect(
      validateOnlineServerMessage({
        type: "snapshot",
        snapshot: {
          ...snapshot(),
          clock: {
            timeControl: { initialMs: 60_000, incrementMs: 0 },
            remainingMs: { w: 60_000, b: -1 },
            activeColor: "w",
            runningSince: 1_000,
            serverNow: 1_000,
          },
        },
      }).ok
    ).toBe(false);
  });

  it("accepts snapshots produced by the online game service", () => {
    const result = validateOnlineServerMessage({
      type: "snapshot",
      snapshot: createRealSnapshot(),
    });

    expect(result.ok).toBe(true);
  });
});
