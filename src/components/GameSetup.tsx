import React, { useState, useMemo } from 'react';
import HexGrid from './HexGrid';
import { getStartingPieces, getStartingBoard, getStartingLayout } from '../ConstantImports';
import { Board } from '../Classes/Core/Board';
import { Piece } from '../Classes/Entities/Piece';
import { CastleGenerator } from '../Classes/Systems/CastleGenerator';
import '../css/Board.css';

interface GameSetupProps {
    onPlay: (board: Board, pieces: Piece[], timeControl?: { initial: number, increment: number }) => void;
}

const GameSetup: React.FC<GameSetupProps> = ({ onPlay }) => {
    // Setup State
    const [boardRadius, setBoardRadius] = useState<number>(8);
    const [useRandomCastles, setUseRandomCastles] = useState<boolean>(false);
    const [timeInitial, setTimeInitial] = useState<number>(10); // Minutes
    const [timeIncrement, setTimeIncrement] = useState<number>(5); // Seconds

    // Derived state for preview
    const { board, layout, pieces, viewBox } = useMemo(() => {
        // 1. Create Base Board
        let b = getStartingBoard(boardRadius);
        
        // 2. Apply Random Castles if enabled
        if (useRandomCastles) {
            // Generate random castles (e.g., 3 per side)
            const randomCastles = CastleGenerator.generateRandomCastles(b, 3);
            // Re-create board with these castles
            b = new Board({ nSquares: boardRadius - 1 }, randomCastles);
        }

        const l = getStartingLayout(b);
        const p = getStartingPieces(boardRadius); // Note: Pieces might need adjustment if they depend on castle locations? Currently fixed.

        // Calculate bounding box for viewBox (same as MapEditor)
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
        const padding = 80; 
        const yOffset = 50; 
        const vb = `${minX - padding} ${minY - padding + yOffset} ${width + padding * 2} ${height + padding * 2}`;

        return { board: b, layout: l, pieces: p, viewBox: vb };
    }, [boardRadius, useRandomCastles]);

    const handlePlay = () => {
        onPlay(board, pieces, { initial: timeInitial, increment: timeIncrement });
    };

    return (
        <div className="game-setup" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#333', color: '#eee' }}>
            {/* Controls Header */}
            <div className="setup-controls" style={{ padding: '20px', background: '#222', display: 'flex', flexWrap: 'wrap', gap: '30px', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #444' }}>
                
                {/* Board Size */}
                <div style={controlGroupStyle}>
                    <label style={labelStyle}>Board Size: {boardRadius}</label>
                    <input 
                        type="range" 
                        min="4" 
                        max="12" 
                        value={boardRadius} 
                        onChange={(e) => setBoardRadius(parseInt(e.target.value))}
                        style={{ width: '150px' }}
                    />
                </div>

                {/* Castles */}
                <div style={controlGroupStyle}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', ...labelStyle }}>
                        <input 
                            type="checkbox" 
                            checked={useRandomCastles}
                            onChange={(e) => setUseRandomCastles(e.target.checked)}
                            style={{ width: '20px', height: '20px' }}
                        />
                        Random Castles
                    </label>
                </div>

                {/* Time Controls */}
                <div style={controlGroupStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={labelStyle}>Time (min):</label>
                        <input 
                            type="number" 
                            value={timeInitial} 
                            onChange={(e) => setTimeInitial(Number(e.target.value))}
                            style={inputNumberStyle}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={labelStyle}>Inc (sec):</label>
                        <input 
                            type="number" 
                            value={timeIncrement} 
                            onChange={(e) => setTimeIncrement(Number(e.target.value))}
                            style={inputNumberStyle}
                        />
                    </div>
                </div>
                
                {/* Play Button */}
                <button 
                    onClick={handlePlay}
                    style={{
                        padding: '12px 30px',
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#27ae60',
                        color: 'white',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                    }}
                >
                    PLAY GAME
                </button>
            </div>

            {/* Preview Area */}
            <div className="editor-preview" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1a1a1a' }}>
                 <svg className="board" height="100%" width="100%" viewBox={viewBox}>
                    <HexGrid
                        hexagons={board.hexes}
                        castles={board.castles} // Show generated castles
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
                 </svg>
                 <div style={{ position: 'absolute', bottom: '20px', left: '20px', color: '#888', fontStyle: 'italic' }}>
                    Preview Mode
                 </div>
            </div>
        </div>
    );
};

// Styles
const controlGroupStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    background: '#333',
    padding: '10px 15px',
    borderRadius: '8px',
};

const labelStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: '#ddd'
};

const inputNumberStyle: React.CSSProperties = {
    width: '60px',
    padding: '5px',
    fontSize: '1rem',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#444',
    color: 'white'
};

export default GameSetup;
