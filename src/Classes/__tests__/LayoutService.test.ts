import { LayoutService } from '../Systems/LayoutService';
import { Board } from '../Core/Board';
import { Hex, Point } from '../Entities/Hex';
import { N_SQUARES } from '../../Constants';

describe('LayoutService', () => {
    let board: Board;
    let layoutService: LayoutService;

    beforeEach(() => {
        board = new Board({ nSquares: N_SQUARES });
        layoutService = new LayoutService(board);
    });

    test('should initialize with default dimensions', () => {
        expect(layoutService.pixelWidth).toBe(800);
        expect(layoutService.pixelHeight).toBe(600);
    });

    test('should update dimensions', () => {
        layoutService.updateDimensions(1024, 768);
        expect(layoutService.pixelWidth).toBe(1024);
        expect(layoutService.pixelHeight).toBe(768);
    });

    test('should calculate hex size based on dimensions', () => {
        // Initial check
        const initialSize = layoutService.size_hexes;
        expect(initialSize).toBeGreaterThan(0);

        // Update dimensions and check if size changes
        layoutService.updateDimensions(1600, 1200);
        expect(layoutService.size_hexes).toBeCloseTo(initialSize * 2, 1);
    });

    test('should return correct pixel center for 0,0,0', () => {
        const centerHex = new Hex(0, 0, 0);
        const pixel = layoutService.getHexCenter(centerHex);
        
        // Origin should be at center of pixel space + offsets
        // logical origin (0,0) usually maps to center of screen in this layout
        const expectedX = layoutService.origin.x;
        const expectedY = layoutService.origin.y;

        expect(pixel.x).toBeCloseTo(expectedX);
        expect(pixel.y).toBeCloseTo(expectedY);
    });

    test('should generate cached data map', () => {
        expect(Object.keys(layoutService.hexCenters).length).toBe(board.hexes.length);
        expect(Object.keys(layoutService.hexCornerString).length).toBe(board.hexes.length);
    });
});
