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

        // Calculate viewBox using LayoutService method
        const vb = l.calculateViewBox();

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
                    {/* Slider for board size */}
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
                 <svg className="board" height="100%" width="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
                    <HexGrid
                        hexagons={board.hexes}
                        castles={[]} // No castles for now or generate them too?
                        sanctuaries={[]}
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
