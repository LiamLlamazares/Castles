import { Hex, OffsetCoord } from "../Entities/Hex";
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { PieceType } from "../../Constants";

export class NotationService {
    /**
     * Converts a Hex to a chess-like coordinate string (e.g. "A1", "H8").
     * Uses OffsetCoord (even-q) mapping.
     * Columns are letters, Rows are numbers.
     * 
     * We map the board assuming center is roughly middle of alphabet/numbers.
     * Let's define the center (0,0) as roughly 'J10' to give plenty of space.
     * Col 0 -> J (10th letter)
     * Row 0 -> 10
     */
    public static toCoordinate(hex: Hex): string {
        const offset = OffsetCoord.qoffsetFromCube(OffsetCoord.EVEN, hex);
        
        // Map col to Letter (0 -> Use J as center which is index 9 (0-based A=0))
        // So col 0 => 'J'. 
        // A=0, B=1, ... J=9...
        const colIndex = offset.col + 9; 
        const row = offset.row + 10; 

        const colLetter = String.fromCharCode('A'.charCodeAt(0) + colIndex);
        
        return `${colLetter}${row}`;
    }

    /**
     * Helper to get a 3-letter code for a piece type.
     */
    public static getPieceCode(type: PieceType): string {
        switch (type) {
            case PieceType.Swordsman: return "Swo";
            case PieceType.Archer: return "Arc";
            case PieceType.Knight: return "Kni";
            case PieceType.Trebuchet: return "Tre";
            case PieceType.Eagle: return "Eag";
            case PieceType.Giant: return "Gia";
            case PieceType.Assassin: return "Asn"; // Special case to distinguish from Archer if generalized
            case PieceType.Dragon: return "Dra";
            case PieceType.Monarch: return "Mon";
            default: return "Ukwn";
        }
    }

    public static getMoveNotation(piece: Piece, target: Hex): string {
        const start = NotationService.toCoordinate(piece.hex);
        const end = NotationService.toCoordinate(target);
        // Concise: J10K11
        return `${start}${end}`;
    }

    public static getAttackNotation(attacker: Piece, target: Hex): string {
        const start = NotationService.toCoordinate(attacker.hex);
        const targetCoord = NotationService.toCoordinate(target);
        // Concise: J10xK11
        return `${start}x${targetCoord}`;
    }
    
    public static getCastleCaptureNotation(piece: Piece, castle: Castle): string {
        const start = NotationService.toCoordinate(piece.hex);
        const target = NotationService.toCoordinate(castle.hex);
        // Concise: J10xK11 (Castle capture is essentially an attack/move)
        // Or specific: "CxK11"? User asked for "axb". Let's stick to capture format "start x end" 
        // effectively treating castle as a piece or square being captured.
        return `${start}x${target}`;
    }

    public static getRecruitNotation(castle: Castle, pieceType: PieceType, hex: Hex): string {
        const spawnCoord = NotationService.toCoordinate(hex);
        const pieceCode = NotationService.getPieceCode(pieceType);
        // Concise: B2=Kni (SpawnHex = Piece)
        // Or if we need to show source castle: "A1(B2)=Kni"?
        // User suggested a=b.
        // Let's use: "Hex=Piece" (e.g. B2=Kni). The castle doing the recruiting is implied by adjacency.
        return `${spawnCoord}=${pieceCode}`;
    }

    public static getPassNotation(): string {
        return "Pass";
    }
}
