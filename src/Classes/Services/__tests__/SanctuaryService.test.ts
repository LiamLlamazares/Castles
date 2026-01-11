import { SanctuaryService } from "../SanctuaryService";
import { SanctuaryType, PieceType } from "../../../Constants";
import { Sanctuary } from "../../Entities/Sanctuary";
import { Hex } from "../../Entities/Hex";

describe("SanctuaryService", () => {
    describe("tryUnlockSanctuary", () => {
        // Use SacredSpring (maps to Healer piece)
        const pool: SanctuaryType[] = [SanctuaryType.SacredSpring];
        
        // Use WolfCovenant (maps to Wolf piece)
        const sanctuaries: Sanctuary[] = [
            new Sanctuary(new Hex(0,0,0), SanctuaryType.WolfCovenant, 'w')
        ];

        it("should unlock a sanctuary type if not in pool and not on board", () => {
            // Ranger corresponds to WardensWatch
            // WardensWatch is not in pool and not on board
            const result = SanctuaryService.tryUnlockSanctuary(pool, PieceType.Ranger, sanctuaries);
            expect(result).toContain(SanctuaryType.WardensWatch);
            expect(result.length).toBe(pool.length + 1);
        });
        
        it("should not unlock if already in pool", () => {
            // Healer corresponds to SacredSpring, which IS in pool
            const result = SanctuaryService.tryUnlockSanctuary(pool, PieceType.Healer, sanctuaries);
            expect(result).toHaveLength(pool.length); // No change
            expect(result).toBe(pool); // Same reference
        });

        it("should not unlock if already on board", () => {
            // Wolf corresponds to WolfCovenant, which IS on board
            const result = SanctuaryService.tryUnlockSanctuary(pool, PieceType.Wolf, sanctuaries);
            expect(result).toHaveLength(pool.length); // No change
            expect(result).not.toContain(SanctuaryType.WolfCovenant);
        });
        
        it("should ignore irrelevant piece types", () => {
             const result = SanctuaryService.tryUnlockSanctuary(pool, PieceType.Swordsman, sanctuaries);
             expect(result).toBe(pool);
        });
    });
});
