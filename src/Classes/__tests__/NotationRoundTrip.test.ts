import { startingBoard } from "../../ConstantImports";
import { AbilityType, PieceType } from "../../Constants";
import { Castle } from "../Entities/Castle";
import { Hex } from "../Entities/Hex";
import { Piece } from "../Entities/Piece";
import { NotationService } from "../Systems/NotationService";

describe("NotationService round-trip contracts", () => {
  it("round-trips every starting board hex coordinate", () => {
    for (const hex of startingBoard.hexes) {
      const coordinate = NotationService.toCoordinate(hex);
      const parsed = NotationService.fromCoordinate(coordinate);

      expect(parsed.equals(hex)).toBe(true);
    }
  });

  it("formats all action notation types deterministically", () => {
    const source = new Hex(0, 0, 0);
    const target = new Hex(1, 0, -1);
    const piece = new Piece(source, "w", PieceType.Wizard);
    const castle = new Castle(target, "b", 0);

    expect(NotationService.getMoveNotation(piece, target)).toBe("J10K11");
    expect(NotationService.getAttackNotation(piece, target)).toBe("J10xK11");
    // Castle capture intentionally shares capture notation; replay infers castle vs piece from board state.
    expect(NotationService.getCastleCaptureNotation(piece, castle)).toBe("J10xK11");
    expect(NotationService.getRecruitNotation(castle, PieceType.Swordsman, target)).toBe("K11=Swo");
    expect(NotationService.getPledgeNotation(PieceType.Wolf, target)).toBe("P:WlfK11");
    expect(NotationService.getAbilityNotation(AbilityType.Fireball, PieceType.Wizard, source, target)).toBe("WF:J10K11");
    expect(NotationService.getAbilityNotation(AbilityType.Teleport, PieceType.Wizard, source, target)).toBe("WT:J10K11");
    expect(NotationService.getAbilityNotation(AbilityType.RaiseDead, PieceType.Necromancer, source, target)).toBe("NR:J10K11");
    expect(NotationService.getPassNotation()).toBe("Pass");
  });

  it("maps every piece type to its stable three-letter code", () => {
    const expectedCodes: Record<PieceType, string> = {
      [PieceType.Swordsman]: "Swo",
      [PieceType.Archer]: "Arc",
      [PieceType.Knight]: "Kni",
      [PieceType.Trebuchet]: "Tre",
      [PieceType.Eagle]: "Eag",
      [PieceType.Giant]: "Gia",
      [PieceType.Assassin]: "Asn",
      [PieceType.Dragon]: "Dra",
      [PieceType.Monarch]: "Mon",
      [PieceType.Wolf]: "Wlf",
      [PieceType.Healer]: "Hea",
      [PieceType.Ranger]: "Rng",
      [PieceType.Wizard]: "Wiz",
      [PieceType.Necromancer]: "Nec",
      [PieceType.Phoenix]: "Phx",
    };

    expect(Object.keys(expectedCodes).sort()).toEqual(Object.values(PieceType).sort());

    for (const pieceType of Object.values(PieceType)) {
      expect(NotationService.getPieceCode(pieceType)).toBe(expectedCodes[pieceType]);
    }
  });
});
