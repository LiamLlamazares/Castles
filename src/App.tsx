import React, { useState } from 'react';
import GameBoard from './components/Game';
import MainMenu from './components/MainMenu';
import GameSetup from './components/GameSetup';
import { Board } from './Classes/Core/Board';
import { Piece } from './Classes/Entities/Piece';
import { LayoutService } from './Classes/Systems/LayoutService';
import { MoveTree } from './Classes/Core/MoveTree';
import { SanctuaryGenerator } from './Classes/Systems/SanctuaryGenerator';
import { SanctuaryType } from './Constants';
import { getStartingLayout } from './ConstantImports';

type ViewState = 'menu' | 'setup' | 'game';

interface GameConfig {
  board?: Board;
  pieces?: Piece[];
  layout?: LayoutService;
  history?: any[];
  moveHistory?: any[];
  moveTree?: MoveTree;
  turnCounter?: number;
  sanctuaries?: import('./Classes/Entities/Sanctuary').Sanctuary[];
  timeControl?: { initial: number, increment: number };
  isAnalysisMode?: boolean;
}

function App() {
  const [view, setView] = useState<ViewState>('game');
  const [gameConfig, setGameConfig] = useState<GameConfig>({});

  const handleNewGameClick = () => {
    setView('setup');
  };

  const handleStartGame = (
    board: Board, 
    pieces: Piece[], 
    timeControl?: { initial: number, increment: number },
    selectedSanctuaryTypes?: SanctuaryType[]
  ) => {
    const layout = getStartingLayout(board);
    
    // Generate sanctuaries from selected types (defaults to Wolf + Healer if not provided)
    const typesToGenerate = selectedSanctuaryTypes && selectedSanctuaryTypes.length > 0
      ? selectedSanctuaryTypes
      : [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring];
    
    const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, typesToGenerate);
    
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl, isAnalysisMode: false });
    setView('game');
  };

  const handleRestartGame = () => {
    setGameKey(prev => prev + 1);
  };

  const handleLoadGame = (board: Board, pieces: Piece[], history: any[], moveHistory: any[], turnCounter: number, sanctuaries: import('./Classes/Entities/Sanctuary').Sanctuary[], moveTree?: MoveTree) => {
    // Reset layout based on new board size
    const layout = getStartingLayout(board);
    // PGN imports should always start in analysis mode so users can navigate the game
    setGameConfig({ board, pieces, layout, history, moveHistory, moveTree, turnCounter, sanctuaries, isAnalysisMode: true });
    setGameKey(prev => prev + 1); // Force remount
    setView('game');
  };
  
  const [gameKey, setGameKey] = useState(0);

  const handleEnableAnalysis = (board: Board, pieces: Piece[], history: any[], moveHistory: any[], turnCounter: number, sanctuaries: import('./Classes/Entities/Sanctuary').Sanctuary[]) => {
    const layout = getStartingLayout(board);
    setGameConfig({ board, pieces, layout, history, moveHistory, turnCounter, sanctuaries, isAnalysisMode: true });
    setGameKey(prev => prev + 1); // Force remount with new setting
  };

  return (
    <div className="App">
      {view === 'menu' && (
        <MainMenu 
          onPlay={handleNewGameClick} 
        />
      )}
      
      {view === 'setup' && (
        <GameSetup 
          onPlay={handleStartGame} 
        />
      )}

      {view === 'game' && (
        <div style={{ height: '100vh', width: '100vw' }}> {/* Ensure full screen for game */}
            <GameBoard 
              key={gameKey}
              initialBoard={gameConfig.board}
              initialPieces={gameConfig.pieces}
              initialLayout={gameConfig.layout}
              initialHistory={gameConfig.history}
              initialMoveHistory={gameConfig.moveHistory}
              initialMoveTree={gameConfig.moveTree}
              initialTurnCounter={gameConfig.turnCounter}
              initialSanctuaries={gameConfig.sanctuaries}
              timeControl={gameConfig.timeControl}
              isAnalysisMode={gameConfig.isAnalysisMode}
              onEnableAnalysis={handleEnableAnalysis}
              onResign={() => {}} // Controlled internally or via prop if we want to bubble up
              onSetup={handleNewGameClick}
              onRestart={handleRestartGame}
              onLoadGame={handleLoadGame}
            />
        </div>
      )}
    </div>
  );
}

export default App;
