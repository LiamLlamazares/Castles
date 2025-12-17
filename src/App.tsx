import React, { useState } from 'react';
import GameBoard from './components/Game';
import MainMenu from './components/MainMenu';
import GameSetup from './components/GameSetup';
import { Board } from './Classes/Core/Board';
import { Piece } from './Classes/Entities/Piece';
import { LayoutService } from './Classes/Systems/LayoutService';
import { getStartingLayout } from './ConstantImports';

type ViewState = 'menu' | 'setup' | 'game';

interface GameConfig {
  board?: Board;
  pieces?: Piece[];
  layout?: LayoutService;
  history?: any[];
  moveHistory?: any[];
  turnCounter?: number;
  sanctuaries?: import('./Classes/Entities/Sanctuary').Sanctuary[];
}

function App() {
  const [view, setView] = useState<ViewState>('game');
  const [gameConfig, setGameConfig] = useState<GameConfig>({});

  const handleNewGameClick = () => {
    setView('setup');
  };

  const handleStartGame = (board: Board, pieces: Piece[], timeControl?: { initial: number, increment: number }) => {
    const layout = getStartingLayout(board);
    setGameConfig({ board, pieces, layout });
    setView('game');
  };

  const handleRestartGame = () => {
    setGameKey(prev => prev + 1);
  };

  const handleLoadGame = (board: Board, pieces: Piece[], history: any[], moveHistory: any[], turnCounter: number, sanctuaries: import('./Classes/Entities/Sanctuary').Sanctuary[]) => {
    // Reset layout based on new board size
    const layout = getStartingLayout(board);
    setGameConfig({ board, pieces, layout, history, moveHistory, turnCounter, sanctuaries });
    setGameKey(prev => prev + 1); // Force remount
    setView('game');
  };
  
  const [gameKey, setGameKey] = useState(0);

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
              initialTurnCounter={gameConfig.turnCounter}
              initialSanctuaries={gameConfig.sanctuaries}
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
