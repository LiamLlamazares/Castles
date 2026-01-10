import { AbilitySystem } from "../AbilitySystem";
import { GameState } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { Hex } from "../../Entities/Hex";
import { PieceType, AbilityType, Color } from "../../../Constants";
import { getPieceConfig } from "../../Config/PieceTypeConfig";
import { getAbilityConfig } from "../../Config/AbilityConfig";

// Ensure mocks are established before imports functionality (jest hoisting handles this, but good to be clear)
jest.mock("../../Config/PieceTypeConfig");
jest.mock("../../Config/AbilityConfig");

describe("AbilitySystem Generic Logic", () => {
    let mockState: GameState;
    let mockPiece: Piece;

    beforeEach(() => {
        mockState = {
            pieces: [],
            graveyard: [],
            // @ts-ignore
            pieceMap: { getByKey: () => null }
        } as unknown as GameState;

        // Constructor: Hex, Color, Type
        mockPiece = new Piece(new Hex(0, 0, 0), "w", PieceType.Wizard);
    });

    test("should return empty array for piece with no abilities", () => {
        (getPieceConfig as jest.Mock).mockReturnValue({
            abilities: undefined
        });

        const abilities = AbilitySystem.getAbilitiesForPiece(mockPiece, mockState);
        expect(abilities).toEqual([]);
    });

    test("should return abilities defined in config", () => {
        (getPieceConfig as jest.Mock).mockReturnValue({
            abilities: [AbilityType.Fireball]
        });
        
        (getAbilityConfig as jest.Mock).mockReturnValue({
            name: "Fireball",
            range: 2,
            minRange: 1,
            description: "Boom",
            oneTimeUse: true
        });

        // Mock canUseAbility to return true
        jest.spyOn(AbilitySystem, 'canUseAbility').mockReturnValue({ valid: true });

        const abilities = AbilitySystem.getAbilitiesForPiece(mockPiece, mockState);
        
        expect(abilities).toHaveLength(1);
        expect(abilities[0].type).toBe(AbilityType.Fireball);
        expect(abilities[0].name).toBe("Fireball");
    });
});
