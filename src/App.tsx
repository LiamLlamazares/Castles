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
}

function App() {
  const [view, setView] = useState<ViewState>('menu');
  const [gameConfig, setGameConfig] = useState<GameConfig>({});

  const handleNewGameClick = () => {
    setView('setup');
  };

  const handleStartGame = (board: Board, pieces: Piece[], timeControl?: { initial: number, increment: number }) => {
    const layout = getStartingLayout(board);
    setGameConfig({ board, pieces, layout });
    // TODO: Pass timeControl to GameBoard if implemented
    setView('game');
  };

  const handleResign = () => {
    setView('menu');
    setGameConfig({});
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
              initialBoard={gameConfig.board}
              initialPieces={gameConfig.pieces}
              initialLayout={gameConfig.layout}
              onResign={handleResign}
            />
        </div>
      )}
    </div>
  );
}

export default App;
