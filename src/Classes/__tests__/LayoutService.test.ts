import { LayoutService, VIRTUAL_CANVAS_SIZE } from '../Systems/LayoutService';
import { Board } from '../Core/Board';
import { Hex } from '../Entities/Hex';
import { HEX_SIZE_FACTOR } from '../../Constants';
import { N_SQUARES } from '../../Constants';

describe('LayoutService', () => {
    let board: Board;
    let layoutService: LayoutService;

    beforeEach(() => {
        board = new Board({ nSquares: N_SQUARES });
        layoutService = new LayoutService(board);
    });

    test('should initialize with virtual canvas dimensions', () => {
        expect(layoutService.pixelWidth).toBe(VIRTUAL_CANVAS_SIZE);
        expect(layoutService.pixelHeight).toBe(VIRTUAL_CANVAS_SIZE);
    });

    test('should calculate hex size based on virtual canvas', () => {
        const hexSize = layoutService.size_hexes;
        expect(hexSize).toBeGreaterThan(0);
        // Hex size should be consistent since we use fixed virtual canvas
        expect(hexSize).toBeCloseTo(VIRTUAL_CANVAS_SIZE / (HEX_SIZE_FACTOR * board.NSquares), 1);
    });

    test('should return correct pixel center for 0,0,0', () => {
        const centerHex = new Hex(0, 0, 0);
        const pixel = layoutService.getHexCenter(centerHex);
        
        // Origin should be at center of pixel space + offsets
        const expectedX = layoutService.origin.x;
        const expectedY = layoutService.origin.y;

        expect(pixel.x).toBeCloseTo(expectedX);
        expect(pixel.y).toBeCloseTo(expectedY);
    });

    test('should generate cached data map', () => {
        expect(Object.keys(layoutService.hexCenters).length).toBe(board.hexes.length);
        expect(Object.keys(layoutService.hexCornerString).length).toBe(board.hexes.length);
    });

    test('calculateViewBox should return valid viewBox string', () => {
        const viewBox = layoutService.calculateViewBox();
        const parts = viewBox.split(' ').map(Number);
        
        expect(parts).toHaveLength(4);
        expect(parts[2]).toBeGreaterThan(0); // width
        expect(parts[3]).toBeGreaterThan(0); // height
    });
});

