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
import { SanctuaryType, SanctuaryConfig, PieceType, Color, PieceTheme, DEFAULT_CASTLES_PER_SIDE } from '../Constants';
import { OpponentType, AIOpponentConfig } from '../hooks/useAIOpponent';
import { getImageByPieceType } from './PieceImages';
import { controlGroupStyle, labelStyle } from '../css/styles';
import { ModeSelector, TimeControls, SanctuarySelector, BoardConfig, GameRulesSection, type GameMode } from './Setup';
import '../css/Board.css';

interface GameSetupProps {
    onPlay: (
        board: Board, 
        pieces: Piece[], 
        timeControl?: { initial: number, increment: number },
        selectedSanctuaryTypes?: SanctuaryType[],
        sanctuarySettings?: { unlockTurn: number, cooldown: number },
        gameRules?: { vpModeEnabled: boolean },
        initialPoolTypes?: SanctuaryType[],
        pieceTheme?: PieceTheme,
        opponentConfig?: AIOpponentConfig
    ) => void;
}

// Opponent options for card-based selection
const OPPONENT_OPTIONS: { id: OpponentType; name: string; icon: string; description: string }[] = [
    { id: 'human', name: 'Human', icon: '☺', description: 'Local 2-player' },
    { id: 'random-ai', name: 'Random Bot', icon: '⚙', description: 'Easy difficulty' },
    // Future: { id: 'heuristic-ai', name: 'Smart Bot', icon: '☃', description: 'Medium' },
];

// Helper function to get piece name from SanctuaryConfig
const getPieceName = (type: SanctuaryType): string => {
    const pieceType = SanctuaryConfig[type].pieceType;
    return pieceType; // PieceType enum values are already human-readable
};

// Game Mode Presets - now using exported GameMode type from Setup/ModeSelector

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
        sanctuaries: Object.keys(SanctuaryConfig) as SanctuaryType[],
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
    
    // Pool Selection - Default based on SanctuaryConfig.startAvailable
    const [selectedPoolTypes, setSelectedPoolTypes] = useState<Set<SanctuaryType>>(() => {
        const defaults = new Set<SanctuaryType>();
        (Object.keys(SanctuaryConfig) as SanctuaryType[]).forEach(t => {
            if (SanctuaryConfig[t].startAvailable) {
                defaults.add(t);
            }
        });
        return defaults;
    });

    // Game Rules - Optional modes
    const [vpModeEnabled, setVpModeEnabled] = useState<boolean>(false);
    
    // Piece Theme Selection - Default to Castles
    const [pieceTheme, setPieceTheme] = useState<PieceTheme>("Castles");
    
    // Opponent Selection - Default to Human (local 2-player)
    const [opponentType, setOpponentType] = useState<OpponentType>('human');
    
    // Player Color Selection - Only relevant when playing vs AI (default: human plays white)
    const [playerColor, setPlayerColor] = useState<Color>('w');
    
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

    const togglePoolType = (type: SanctuaryType) => {
        setSelectedPoolTypes(prev => {
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
            // Generate random castles using named constant
            const randomCastles = CastleGenerator.generateRandomCastles(b, DEFAULT_CASTLES_PER_SIDE);
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
        // Build opponent config (only if not human)
        // AI plays the opposite color of what human selected
        const aiColor: Color = playerColor === 'w' ? 'b' : 'w';
        const opponentConfig: AIOpponentConfig | undefined = 
            opponentType !== 'human' 
                ? { type: opponentType, aiColor }
                : undefined;
                
        onPlay(
            board, 
            pieces, 
            { initial: timeInitial, increment: timeIncrement },
            Array.from(selectedSanctuaries),
            { unlockTurn: sanctuaryUnlockTurn, cooldown: sanctuaryCooldown },
            { vpModeEnabled },
            Array.from(selectedPoolTypes),
            pieceTheme,
            opponentConfig
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
                <ModeSelector selectedMode={selectedMode} onModeChange={applyMode} />

                {/* Opponent Selection - Card-based */}
                <div style={controlGroupStyle}>
                    <label style={labelStyle}>Opponent</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {OPPONENT_OPTIONS.map(opt => {
                            const isSelected = opponentType === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => setOpponentType(opt.id)}
                                    style={{
                                        padding: '8px 12px',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        borderRadius: '8px',
                                        border: isSelected ? '2px solid #4a90d9' : '1px solid #555',
                                        background: isSelected ? 'rgba(74, 144, 217, 0.2)' : '#444',
                                        color: isSelected ? '#fff' : '#aaa',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '4px',
                                        transition: 'all 0.2s',
                                        minWidth: '80px'
                                    }}
                                    title={opt.description}
                                >
                                    <span style={{ fontSize: '1.3rem' }}>{opt.icon}</span>
                                    <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{opt.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Color Selection - Only show when playing vs AI */}
                {opponentType !== 'human' && (
                    <div style={{ ...controlGroupStyle, flexDirection: 'column', alignItems: 'stretch' }}>
                        <label style={{ ...labelStyle, marginBottom: '8px' }}>Play as</label>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            {(['w', 'b'] as Color[]).map(color => {
                                const isSelected = playerColor === color;
                                const colorName = color === 'w' ? 'White' : 'Black';
                                return (
                                    <button
                                        key={color}
                                        onClick={() => setPlayerColor(color)}
                                        style={{
                                            padding: '12px',
                                            cursor: 'pointer',
                                            borderRadius: '8px',
                                            border: isSelected ? '3px solid #4a90d9' : '2px solid #555',
                                            background: isSelected 
                                                ? (color === 'w' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.3)')
                                                : '#333',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '8px',
                                            transition: 'all 0.2s',
                                            minWidth: '100px',
                                            opacity: isSelected ? 1 : 0.6,
                                            transform: isSelected ? 'scale(1.05)' : 'scale(1)'
                                        }}
                                        title={`Play as ${colorName}`}
                                    >
                                        <img 
                                            src={getImageByPieceType(PieceType.Monarch, color, pieceTheme)}
                                            alt={`${colorName} Monarch`}
                                            style={{ width: '48px', height: '48px' }}
                                        />
                                        <span style={{ 
                                            color: isSelected ? '#fff' : '#888',
                                            fontWeight: isSelected ? 'bold' : 'normal',
                                            fontSize: '0.9rem'
                                        }}>
                                            {colorName}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ 
                            fontSize: '0.75rem', 
                            color: '#888', 
                            textAlign: 'center', 
                            marginTop: '8px' 
                        }}>
                            Bot plays as {playerColor === 'w' ? 'Black' : 'White'}
                        </div>
                    </div>
                )}

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
                
                {/* Board Configuration */}
                <BoardConfig
                    boardRadius={boardRadius}
                    onBoardRadiusChange={setBoardRadius}
                    useRandomCastles={useRandomCastles}
                    onRandomCastlesChange={setUseRandomCastles}
                    onReroll={() => setRerollKey(k => k + 1)}
                    pieceTheme={pieceTheme}
                    onPieceThemeChange={setPieceTheme}
                    sanctuaryCooldown={sanctuaryCooldown}
                    onSanctuaryCooldownChange={setSanctuaryCooldown}
                />

                {/* Time Controls */}
                <TimeControls
                    timeInitial={timeInitial}
                    timeIncrement={timeIncrement}
                    onTimeInitialChange={setTimeInitial}
                    onTimeIncrementChange={setTimeIncrement}
                />

                {/* Game Rules Section */}
                <GameRulesSection
                    vpModeEnabled={vpModeEnabled}
                    onVpModeChange={setVpModeEnabled}
                />

                {/* Sanctuary Selection */}
                <SanctuarySelector
                    selectedSanctuaries={selectedSanctuaries}
                    onToggleSanctuary={toggleSanctuary}
                    selectedPoolTypes={selectedPoolTypes}
                    onTogglePoolType={togglePoolType}
                    onHoverSanctuary={(piece) => {
                        if (piece) {
                            setTooltipData({ piece, position: { x: 420, y: 0 } });
                        } else {
                            setTooltipData(null);
                        }
                    }}
                />
                
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

export default GameSetup;
