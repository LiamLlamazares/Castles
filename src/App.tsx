import React, { useState } from 'react';
import GameBoard from './components/Game';
import MainMenu from './components/MainMenu';
import MapEditor from './components/MapEditor';
import { Board } from './Classes/Core/Board';
import { Piece } from './Classes/Entities/Piece';
import { LayoutService } from './Classes/Systems/LayoutService';
import { getStartingLayout } from './ConstantImports';

type ViewState = 'menu' | 'game' | 'editor';

interface GameConfig {
  board?: Board;
  pieces?: Piece[];
  layout?: LayoutService;
}

function App() {
  const [view, setView] = useState<ViewState>('menu');
  const [gameConfig, setGameConfig] = useState<GameConfig>({});

  const handleStartGame = () => {
    setGameConfig({}); // Reset to defaults
    setView('game');
  };

  const handleEnterEditor = () => {
    setView('editor');
  };

  const handlePlayFromEditor = (board: Board, pieces: Piece[]) => {
    const layout = getStartingLayout(board);
    setGameConfig({ board, pieces, layout });
    setView('game');
  };

  return (
    <div className="App">
      {view === 'menu' && (
        <MainMenu 
          onPlay={handleStartGame} 
          onEditor={handleEnterEditor} 
        />
      )}
      
      {view === 'editor' && (
        <MapEditor 
          onPlay={handlePlayFromEditor} 
        />
      )}

      {view === 'game' && (
        <GameBoard 
          initialBoard={gameConfig.board}
          initialPieces={gameConfig.pieces}
          initialLayout={gameConfig.layout}
        />
      )}
    </div>
  );
}

export default App;
