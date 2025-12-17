
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { PieceType, AttackType } from "../../Constants";

describe('Ranger Abilities', () => {
    test('Ranger has LongRanged attack type (Range 3)', () => {
        const ranger = new Piece(new Hex(0, 0, 0), 'w', PieceType.Ranger);
        expect(ranger.AttackType).toBe(AttackType.LongRanged);
    });

    test('Wizard has Ranged attack type (Range 2)', () => {
        const wizard = new Piece(new Hex(0, 0, 0), 'w', PieceType.Wizard);
        expect(wizard.AttackType).toBe(AttackType.Ranged);
    });
});
