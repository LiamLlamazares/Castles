import React, { useState, useMemo } from 'react';
import HexGrid from './HexGrid';
import { getStartingPieces, getStartingBoard, getStartingLayout } from '../ConstantImports';
import { Board } from '../Classes/Core/Board';
import { Piece } from '../Classes/Entities/Piece';
import '../css/Board.css';

interface MapEditorProps {
    onPlay: (board: Board, pieces: Piece[]) => void;
}

const MapEditor: React.FC<MapEditorProps> = ({ onPlay }) => {
    const [boardRadius, setBoardRadius] = useState<number>(8); // Default size 8
    
    // Derived state for preview
    const { board, layout, pieces, viewBox } = useMemo(() => {
        const b = getStartingBoard(boardRadius);
        const l = getStartingLayout(b);
        const p = getStartingPieces(boardRadius);

        // Calculate bounding box for viewBox
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        b.hexes.forEach(hex => {
            const corners = l.layout.polygonCorners(hex);
            corners.forEach(corner => {
                if (corner.x < minX) minX = corner.x;
                if (corner.x > maxX) maxX = corner.x;
                if (corner.y < minY) minY = corner.y;
                if (corner.y > maxY) maxY = corner.y;
            });
        });

        const width = maxX - minX;
        const height = maxY - minY;
        const padding = 80; // Increased padding
        const yOffset = 50; // Shift board up by moving viewBox down (positive y is down)
        
        // viewBox: min-x, min-y, width, height
        // To move board UP, we add to min-y (camera moves down).
        // To reveal more at bottom, we ensure height covers it.
        const vb = `${minX - padding} ${minY - padding + yOffset} ${width + padding * 2} ${height + padding * 2}`;

        return { board: b, layout: l, pieces: p, viewBox: vb };
    }, [boardRadius]);

    const handlePlay = () => {
        onPlay(board, pieces);
    };

    return (
        <div className="map-editor" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#333', color: '#eee' }}>
            <div className="editor-controls" style={{ padding: '20px', background: '#222', display: 'flex', gap: '20px', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '1.2rem' }}>Board Size: {boardRadius}</label>
                    <input 
                        type="range" 
                        min="4" 
                        max="12" 
                        value={boardRadius} 
                        onChange={(e) => setBoardRadius(parseInt(e.target.value))}
                        style={{ width: '200px' }}
                    />
                </div>
                
                <button 
                    onClick={handlePlay}
                    style={{
                        padding: '10px 20px',
                        fontSize: '1.1rem',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#27ae60',
                        color: 'white',
                        fontWeight: 'bold'
                    }}
                >
                    PLAY MAP
                </button>
            </div>

            <div className="editor-preview" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                 <svg className="board" height="100%" width="100%" viewBox={viewBox}>
                    <HexGrid
                        hexagons={board.hexes}
                        castles={[]} // No castles for now or generate them too?
                        sanctuaries={[]}
                        legalMoveSet={new Set()}
                        legalAttackSet={new Set()}
                        showCoordinates={true}
                        isBoardRotated={false}
                        isAdjacentToControlledCastle={() => false}
                        onHexClick={() => {}}
                        resizeVersion={0}
                        layout={layout}
                        board={board}
                    />
                    {/* Render pieces preview here if needed, or rely on HexGrid update? HexGrid doesn't render pieces. We need PieceRenderer. */}
                 </svg>
            </div>
        </div>
    );
};

export default MapEditor;
