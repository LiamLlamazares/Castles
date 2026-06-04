import { describe, expect, it } from "vitest";
import { PieceType, SanctuaryType } from "../../Constants";
import { getStartingBoard, getStartingPieces } from "../../ConstantImports";
import { CastleGenerator } from "../../Classes/Systems/CastleGenerator";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { Board } from "../../Classes/Core/Board";
import {
  hydrateBoardDTO,
  hydrateOnlineGameSetupDTO,
  serializeOnlineGameSetup,
} from "../serialization";

describe("online serialization", () => {
  it("round-trips exact random setup data for server-authoritative games", () => {
    const baseBoard = getStartingBoard(7);
    const randomCastles = CastleGenerator.generateRandomCastles(baseBoard, 3);
    const board = new Board({ nSquares: 6 }, randomCastles);
    const pieces = getStartingPieces(7);
    const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, [
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
    ]);

    const setup = serializeOnlineGameSetup({
      board,
      pieces,
      sanctuaries,
      sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
      gameRules: { vpModeEnabled: false },
      initialPoolTypes: [SanctuaryType.WolfCovenant],
      pieceTheme: "Castles",
      ratingMode: "rated",
    });

    const hydrated = hydrateOnlineGameSetupDTO(setup);

    expect(hydrated.board.NSquares).toBe(6);
    expect(hydrated.board.castles.map((c) => c.hex.getKey()).sort()).toEqual(
      board.castles.map((c) => c.hex.getKey()).sort()
    );
    expect(hydrated.pieces).toHaveLength(pieces.length);
    expect(hydrated.pieces[0].type).toBe(PieceType.Swordsman);
    expect(hydrated.sanctuaries.map((s) => s.hex.getKey())).toEqual(
      sanctuaries.map((s) => s.hex.getKey())
    );
    expect(hydrated.initialPoolTypes).toEqual([SanctuaryType.WolfCovenant]);
    expect(hydrated.ratingMode).toBe("rated");
  });

  it("hydrates board DTO castles instead of regenerating default castle positions", () => {
    const baseBoard = getStartingBoard(6);
    const randomCastles = CastleGenerator.generateRandomCastles(baseBoard, 2);
    const board = new Board({ nSquares: 5 }, randomCastles);

    const hydrated = hydrateBoardDTO({
      config: board.config,
      castles: board.castles.map((castle) => ({
        hex: { q: castle.hex.q, r: castle.hex.r, s: castle.hex.s },
        color: castle.color,
        turnsControlled: castle.turns_controlled,
        usedThisTurn: castle.used_this_turn,
        owner: castle.owner,
        recruitmentCooldown: castle.recruitment_cooldown,
      })),
    });

    expect(hydrated.castles.map((c) => c.hex.getKey()).sort()).toEqual(
      board.castles.map((c) => c.hex.getKey()).sort()
    );
  });
});
