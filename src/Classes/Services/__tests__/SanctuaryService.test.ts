import { SanctuaryService } from "../SanctuaryService";
import { SanctuaryType, PieceType } from "../../../Constants";
import { Sanctuary } from "../../Entities/Sanctuary";
import { Hex } from "../../Entities/Hex";
import { Board } from "../../Core/Board";
import { GameState } from "../../Core/GameState";
import { MoveTree } from "../../Core/MoveTree";
import { PieceFactory } from "../../Entities/PieceFactory";
import { createPieceMap } from "../../../utils/PieceMap";

const createState = (
    pieces: ReturnType<typeof PieceFactory.create>[],
    sanctuaries: Sanctuary[],
    turnCounter = 4
): GameState => ({
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: [],
    sanctuaries,
    sanctuaryPool: [],
    turnCounter,
    movingPiece: null,
    moveTree: new MoveTree(),
    graveyard: [],
    phoenixRecords: [],
    viewNodeId: null,
    promotionPending: null,
});

describe("SanctuaryService", () => {
    describe("getPledgeSpawnHexes", () => {
        const board = new Board({ nSquares: 3 });

        it("returns valid adjacent spawn hexes for a pledgeable sanctuary during Recruitment phase", () => {
            const sanctuaryHex = new Hex(0, 0, 0);
            const sanctuary = new Sanctuary(sanctuaryHex, SanctuaryType.WolfCovenant, "w");
            const occupant = PieceFactory.create(PieceType.Swordsman, sanctuaryHex, "w");
            const state = createState([occupant], [sanctuary]);

            const spawnHexes = SanctuaryService.getPledgeSpawnHexes(state, board);

            expect(spawnHexes.length).toBeGreaterThan(0);
            expect(spawnHexes.every(hex => hex.distance(sanctuaryHex) === 1)).toBe(true);
        });

        it("does not return spawn hexes outside Recruitment phase", () => {
            const sanctuaryHex = new Hex(0, 0, 0);
            const sanctuary = new Sanctuary(sanctuaryHex, SanctuaryType.WolfCovenant, "w");
            const occupant = PieceFactory.create(PieceType.Swordsman, sanctuaryHex, "w");
            const state = createState([occupant], [sanctuary], 0);

            const spawnHexes = SanctuaryService.getPledgeSpawnHexes(state, board);

            expect(spawnHexes).toEqual([]);
        });

        it("excludes occupied adjacent spawn hexes", () => {
            const sanctuaryHex = new Hex(0, 0, 0);
            const blockedHex = new Hex(1, -1, 0);
            const sanctuary = new Sanctuary(sanctuaryHex, SanctuaryType.WolfCovenant, "w");
            const occupant = PieceFactory.create(PieceType.Swordsman, sanctuaryHex, "w");
            const blocker = PieceFactory.create(PieceType.Archer, blockedHex, "w");
            const state = createState([occupant, blocker], [sanctuary]);

            const spawnHexes = SanctuaryService.getPledgeSpawnHexes(state, board);

            expect(spawnHexes.some(hex => hex.equals(blockedHex))).toBe(false);
        });
    });

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
