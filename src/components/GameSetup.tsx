import React, { useState, useMemo } from 'react';
import HexGrid from './HexGrid';
import { PieceTooltip } from './PieceTooltip';
import { getStartingPieces, getStartingBoard, getStartingLayout } from '../ConstantImports';
import { Board } from '../Classes/Core/Board';
import { Piece } from '../Classes/Entities/Piece';
import { Hex } from '../Classes/Entities/Hex';
import { PieceFactory } from '../Classes/Entities/PieceFactory';
import { CastleGenerator } from '../Classes/Systems/CastleGenerator';
import { SanctuaryGenerator } from '../Classes/Systems/SanctuaryGenerator';
import { SanctuaryType, SanctuaryConfig, PieceType, Color } from '../Constants';
import '../css/Board.css';

interface GameSetupProps {
    onPlay: (
        board: Board, 
        pieces: Piece[], 
        timeControl?: { initial: number, increment: number },
        selectedSanctuaryTypes?: SanctuaryType[],
        sanctuarySettings?: { unlockTurn: number, cooldown: number },
        gameRules?: { vpModeEnabled: boolean }
    ) => void;
}

// Sanctuary display info
const SANCTUARY_INFO: Record<SanctuaryType, { name: string; piece: string; tier: number; color: string }> = {
    [SanctuaryType.WolfCovenant]: { name: 'Wolf Covenant', piece: 'Wolf', tier: 1, color: '#8b5a2b' },
    [SanctuaryType.SacredSpring]: { name: 'Sacred Spring', piece: 'Healer', tier: 1, color: '#3cb371' },
    [SanctuaryType.WardensWatch]: { name: "Warden's Watch", piece: 'Ranger', tier: 2, color: '#228b22' },
    [SanctuaryType.ArcaneRefuge]: { name: 'Arcane Refuge', piece: 'Wizard', tier: 2, color: '#6a5acd' },
    [SanctuaryType.ForsakenGrounds]: { name: 'Forsaken Grounds', piece: 'Necromancer', tier: 3, color: '#4a0e4e' },
    [SanctuaryType.PyreEternal]: { name: 'Pyre Eternal', piece: 'Phoenix', tier: 3, color: '#ff4500' },
};

// Game Mode Presets
type GameMode = 'quick' | 'standard' | 'full';

interface ModeConfig {
    boardRadius: number;
    timeInitial: number;
    timeIncrement: number;
    sanctuaries: SanctuaryType[];
    sanctuaryCooldown: number;
}

const MODE_PRESETS: Record<GameMode, ModeConfig> = {
    quick: {
        boardRadius: 6,
        timeInitial: 20,
        timeIncrement: 20,
        sanctuaries: [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring],
        sanctuaryCooldown: 5
    },
    standard: {
        boardRadius: 7,
        timeInitial: 20,
        timeIncrement: 20,
        sanctuaries: [
            SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring,
            SanctuaryType.WardensWatch, SanctuaryType.ArcaneRefuge
        ],
        sanctuaryCooldown: 10
    },
    full: {
        boardRadius: 8,
        timeInitial: 20,
        timeIncrement: 20,
        sanctuaries: Object.keys(SANCTUARY_INFO) as SanctuaryType[],
        sanctuaryCooldown: 15
    }
};

const GameSetup: React.FC<GameSetupProps> = ({ onPlay }) => {
    // Game Mode State
    const [selectedMode, setSelectedMode] = useState<GameMode>('standard');
    
    // Setup State - defaults match 'standard' mode preset
    const [boardRadius, setBoardRadius] = useState<number>(MODE_PRESETS.standard.boardRadius); // 7
    const [useRandomCastles, setUseRandomCastles] = useState<boolean>(true);
    const [timeInitial, setTimeInitial] = useState<number>(MODE_PRESETS.standard.timeInitial); // 20
    const [timeIncrement, setTimeIncrement] = useState<number>(MODE_PRESETS.standard.timeIncrement); // 20
    
    // Sanctuary Selection - Default: Wolf + Healer (Tier 1)
    const [selectedSanctuaries, setSelectedSanctuaries] = useState<Set<SanctuaryType>>(
        new Set([SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring])
    );
    
    // Sanctuary Configuration
    const [sanctuaryUnlockTurn, setSanctuaryUnlockTurn] = useState<number>(0);  // Always unlocked
    const [sanctuaryCooldown, setSanctuaryCooldown] = useState<number>(10);
    
    // Game Rules - Optional modes
    const [vpModeEnabled, setVpModeEnabled] = useState<boolean>(false);
    
    // Tooltip state for sanctuary piece preview
    const [tooltipPiece, setTooltipPiece] = useState<Piece | null>(null);

    // Apply a mode preset
    const applyMode = (mode: GameMode) => {
        setSelectedMode(mode);
        const preset = MODE_PRESETS[mode];
        setBoardRadius(preset.boardRadius);
        setTimeInitial(preset.timeInitial);
        setTimeIncrement(preset.timeIncrement);
        setSelectedSanctuaries(new Set(preset.sanctuaries));
        setSanctuaryCooldown(preset.sanctuaryCooldown);
    };

    const toggleSanctuary = (type: SanctuaryType) => {
        setSelectedSanctuaries(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            } else {
                next.add(type);
            }
            return next;
        });
    };

    // Tooltip state
    const [tooltipData, setTooltipData] = useState<{ piece: Piece, position: {x: number, y: number} } | null>(null);

    // Derived state for preview - move destructuring up to be accessible

    // Reroll state for random generation
    const [rerollKey, setRerollKey] = useState(0);

    // Derived state for preview - move destructuring up to be accessible
    const previewState = useMemo(() => {
        // 1. Create Base Board
        let b = getStartingBoard(boardRadius);
        
        // 2. Apply Random Castles if enabled
        if (useRandomCastles) {
            // Generate random castles (e.g., 3 per side)
            const randomCastles = CastleGenerator.generateRandomCastles(b, 3);
            b = new Board({ nSquares: boardRadius - 1 }, randomCastles);
        }

        const l = getStartingLayout(b);
        const p = getStartingPieces(boardRadius);
        
        // 3. Generate sanctuaries for preview
        const s = SanctuaryGenerator.generateRandomSanctuaries(b, Array.from(selectedSanctuaries));

        // Calculate viewBox using LayoutService method
        const vb = l.calculateViewBox();

        return { board: b, layout: l, pieces: p, sanctuaries: s, viewBox: vb };
    }, [boardRadius, useRandomCastles, selectedSanctuaries, rerollKey]);

    const { board, layout, pieces, sanctuaries, viewBox } = previewState;

    // Right-click handler
    const onHexRightClick = (hex: Hex) => {
        // Check pieces
        const piece = pieces.find(p => p.hex.q === hex.q && p.hex.r === hex.r && p.hex.s === hex.s);
        if (piece) {
            setTooltipData({ piece, position: { x: 420, y: 0 } });
            return;
        }
        // Check sanctuaries
        const sanctuary = sanctuaries.find(s => s.hex.q === hex.q && s.hex.r === hex.r && s.hex.s === hex.s);
        if (sanctuary) {
             const pieceType = SanctuaryConfig[sanctuary.type].pieceType;
             const dummy = PieceFactory.create(pieceType, hex, sanctuary.territorySide || 'w');
             setTooltipData({ piece: dummy, position: { x: 420, y: 0 } });
        }
    };

    const handlePlay = () => {
        onPlay(
            board, 
            pieces, 
            { initial: timeInitial, increment: timeIncrement },
            Array.from(selectedSanctuaries),
            { unlockTurn: sanctuaryUnlockTurn, cooldown: sanctuaryCooldown },
            { vpModeEnabled }
        );
    };

    return (
        <>
            <div className="game-setup" style={{ display: 'flex', flexDirection: 'row', height: '100vh', background: '#333', color: '#eee', overflow: 'hidden' }}>
                {/* Sidebar Controls */}
                <div className="setup-sidebar" style={{ 
                    width: '380px',
                    height: '100%',
                    padding: '20px', 
                    background: '#222', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '20px', 
                overflowY: 'auto',
                borderRight: '1px solid #444',
                boxSizing: 'border-box',
                flexShrink: 0
            }}>
                <h2 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', textAlign: 'center', color: '#fff' }}>Game Setup</h2>

                {/* Game Mode Selector */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    {(['quick', 'standard', 'full'] as GameMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => applyMode(mode)}
                            style={{
                                flex: 1,
                                padding: '10px 8px',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                borderRadius: '6px',
                                border: selectedMode === mode ? '2px solid #fff' : '1px solid #555',
                                background: selectedMode === mode ? '#4a90d9' : '#444',
                                color: 'white',
                                fontWeight: selectedMode === mode ? 'bold' : 'normal',
                                textTransform: 'capitalize',
                                transition: 'all 0.2s'
                            }}
                        >
                            {mode}
                        </button>
                    ))}
                </div>

                {/* Play Button (Top for easy access, or Bottom?) - Let's keep it prominent */}
                <button 
                    onClick={handlePlay}
                    style={{
                        padding: '15px',
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#27ae60',
                        color: 'white',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                        width: '100%',
                        marginBottom: '10px'
                    }}
                >
                    PLAY GAME
                </button>
                
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
                    <label style={labelStyle}>Random Castles</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input 
                            type="checkbox" 
                            checked={useRandomCastles}
                            onChange={(e) => setUseRandomCastles(e.target.checked)}
                            style={{ width: '20px', height: '20px' }}
                        />
                        {useRandomCastles && (
                            <button
                                onClick={() => setRerollKey(k => k + 1)}
                                title="Reroll Map"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '1.5rem',
                                    padding: '0 5px',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2) rotate(180deg)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) rotate(0deg)'}
                            >
                                🎲
                            </button>
                        )}
                    </div>
                </div>

                {/* Time Controls */}
                <div style={controlGroupStyle}>
                    <label style={labelStyle}>Time Control</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '2px' }}>Minutes</span>
                            <input 
                                type="number" 
                                value={timeInitial} 
                                onChange={(e) => setTimeInitial(Number(e.target.value))}
                                style={{...inputNumberStyle, width: '50px'}}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '2px' }}>Increment</span>
                            <input 
                                type="number" 
                                value={timeIncrement} 
                                onChange={(e) => setTimeIncrement(Number(e.target.value))}
                                style={{...inputNumberStyle, width: '50px'}}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ ...controlGroupStyle, alignItems: 'center' }}>
                    <label style={labelStyle}>Sanctuary Cooldown</label>
                    <input 
                        type="number" 
                        min="1"
                        max="20"
                        value={sanctuaryCooldown} 
                        onChange={(e) => setSanctuaryCooldown(Number(e.target.value))}
                        style={inputNumberStyle}
                        title="Cooldown turns after pledging"
                    />
                </div>

                {/* Game Rules Section */}
                <div style={{ 
                    ...controlGroupStyle, 
                    flexDirection: 'column', 
                    alignItems: 'stretch',
                    background: 'rgba(102, 126, 234, 0.1)',
                    borderRadius: '8px',
                    padding: '12px',
                    border: '1px solid rgba(102, 126, 234, 0.3)'
                }}>
                    <label style={{ 
                        ...labelStyle, 
                        marginBottom: '10px', 
                        color: '#667eea',
                        fontSize: '0.9rem'
                    }}>
                        🎮 Game Rules (Experimental)
                    </label>
                    
                    {/* VP Mode Toggle */}
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        marginBottom: '8px'
                    }}>
                        <input 
                            type="checkbox" 
                            id="vpMode"
                            checked={vpModeEnabled}
                            onChange={(e) => setVpModeEnabled(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <label htmlFor="vpMode" style={{ 
                            fontSize: '0.85rem', 
                            cursor: 'pointer',
                            color: vpModeEnabled ? '#27ae60' : '#aaa'
                        }}>
                            🏆 Victory Points Mode
                        </label>
                    </div>
                    {vpModeEnabled && (
                        <div style={{ 
                            fontSize: '0.7rem', 
                            color: '#888', 
                            marginLeft: '28px',
                            marginBottom: '8px'
                        }}>
                            4 castles = +1 VP/round, 5 castles = +3 VP/round. First to 10 VP wins!
                        </div>
                    )}   
                </div>

                {/* Sanctuary Selection */}
                <div style={{ ...controlGroupStyle, flexDirection: 'column', alignItems: 'stretch' }}>
                    <label style={{ ...labelStyle, marginBottom: '8px', alignSelf: 'flex-start' }}>Starting Sanctuaries</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px', width: '100%' }}>
                        {Object.entries(SANCTUARY_INFO).map(([type, info]) => {
                            const sanctuaryType = type as SanctuaryType;
                            const isSelected = selectedSanctuaries.has(sanctuaryType);
                            return (
                                <button
                                    key={type}
                                    onClick={() => toggleSanctuary(sanctuaryType)}
                                    style={{
                                        padding: '8px 4px',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        borderRadius: '4px',
                                        border: isSelected ? '2px solid #fff' : '1px solid #444',
                                        background: isSelected ? info.color : '#444',
                                        color: 'white',
                                        opacity: isSelected ? 1 : 0.7,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s',
                                        height: '60px'
                                    }}
                                    title={`Tier ${info.tier} - Spawns ${info.piece}`}
                                    onMouseEnter={() => {
                                        const pieceType = SanctuaryConfig[sanctuaryType].pieceType;
                                        const dummyPiece = PieceFactory.create(pieceType, new Hex(0, 0, 0), 'w');
                                        setTooltipData({ piece: dummyPiece, position: { x: 420, y: 0 } });
                                    }}
                                    onMouseLeave={() => setTooltipData(null)}
                                >
                                    <span style={{ fontWeight: 'bold' }}>{info.piece}</span>
                                    <span style={{ fontSize: '0.65rem', opacity: 0.9 }}>Tier {info.tier}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '8px', textAlign: 'center' }}>
                        {selectedSanctuaries.size === 0 ? 'Select start sanctuaries' : 
                         `${selectedSanctuaries.size} selected for start`}
                    </div>
                </div>
                
                {/* Spacer to push content up if needed */}
                <div style={{ flex: 1 }}></div>
            </div>

            {/* Preview Area */}
            <div 
                className="editor-preview" 
                style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1a1a1a', height: '100%' }}
            >
                 <svg className="board" height="100%" width="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
                    <HexGrid
                        hexagons={board.hexes}
                        castles={board.castles}
                        sanctuaries={sanctuaries}
                        legalMoveSet={new Set()}
                        legalAttackSet={new Set()}
                        showCoordinates={true}
                        isBoardRotated={false}
                        isAdjacentToControlledCastle={() => false}
                        onHexClick={() => setTooltipData(null)}
                        onHexRightClick={onHexRightClick}
                        resizeVersion={0}
                        layout={layout}
                        board={board}
                    />
                 </svg>
                 <div style={{ position: 'absolute', bottom: '20px', left: '20px', color: '#888', fontStyle: 'italic', background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '4px' }}>
                    Preview Mode
                 </div>
            </div>
        </div>
        
        {/* Piece Tooltip for sanctuary hover / right click */}
        {tooltipData && (
            <PieceTooltip 
                piece={tooltipData.piece} 
                position={tooltipData.position} 
                style={{ bottom: '60px' }} // Lift tooltip above "Preview Mode" text
            />
        )}
        </>
    );
};

// Styles
const controlGroupStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#333',
    padding: '12px',
    borderRadius: '8px',
    width: '100%',
    boxSizing: 'border-box'
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

