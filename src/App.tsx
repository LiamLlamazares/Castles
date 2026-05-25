import React, { useState } from 'react';
import GameBoard from './components/Game';
import MainMenu from './components/MainMenu';
import GameSetup from './components/GameSetup';
import BoardEditor from './components/BoardEditor';
import Tutorial from './components/Tutorial';
import GameLibrary from './components/GameLibrary';
import InstallAppHint from './components/InstallAppHint';
import { Board } from './Classes/Core/Board';
import { Piece } from './Classes/Entities/Piece';
import { LayoutService } from './Classes/Systems/LayoutService';
import { MoveTree } from './Classes/Core/MoveTree';
import { SanctuaryGenerator } from './Classes/Systems/SanctuaryGenerator';
import { SanctuaryType, PieceTheme } from './Constants';
import { Sanctuary } from './Classes/Entities/Sanctuary';
import { getStartingLayout } from './ConstantImports';
import { AIOpponentConfig } from './hooks/useAIOpponent';
import { ThemeProvider } from './contexts/ThemeContext';
import {
  BrowserGameLibraryRepository,
  SavedGameRecord,
  SavedGameStatus,
  createDefaultSavedGameName,
  createSavedGameRecord,
} from './Classes/Services/GameLibraryRepository';
import { loadPGNText } from './Classes/Services/PGNLoadService';

type ViewState = 'menu' | 'setup' | 'game' | 'editor' | 'tutorial' | 'library';

interface GameConfig {
  board?: Board;
  pieces?: Piece[];
  layout?: LayoutService;
  moveTree?: MoveTree;
  turnCounter?: number;
  sanctuaries?: Sanctuary[];
  timeControl?: { initial: number, increment: number };
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  initialPoolTypes?: SanctuaryType[];
  pieceTheme?: PieceTheme;
  isAnalysisMode?: boolean;
  opponentConfig?: AIOpponentConfig;
}

interface EditorConfig {
  board?: Board;
  pieces?: Piece[];
  sanctuaries?: Sanctuary[];
}

function App() {
  const [view, setView] = useState<ViewState>('game');
  const [gameConfig, setGameConfig] = useState<GameConfig>({});
  const [editorConfig, setEditorConfig] = useState<EditorConfig>({});
  const [previousView, setPreviousView] = useState<ViewState>('game');
  const [gameLibraryRepository] = useState(() => new BrowserGameLibraryRepository());

  const clearAutosave = () => {
    localStorage.removeItem('castles_autosave');
  };

  const handleNewGameClick = () => {
    clearAutosave();
    setView('setup');
  };

  const handleTutorialClick = () => {
    setView('tutorial');
  };

  const handleOpenLibrary = () => {
    setPreviousView(view);
    setView('library');
  };

  const handleStartGame = (
    board: Board, 
    pieces: Piece[], 
    timeControl?: { initial: number, increment: number },
    selectedSanctuaryTypes?: SanctuaryType[],
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    gameRules?: { vpModeEnabled: boolean },
    initialPoolTypes?: SanctuaryType[],
    pieceTheme?: PieceTheme,
    opponentConfig?: AIOpponentConfig
  ) => {
    const layout = getStartingLayout(board);
    
    // Generate sanctuaries from selected types (defaults to Wolf + Healer if not provided)
    const typesToGenerate = selectedSanctuaryTypes && selectedSanctuaryTypes.length > 0
      ? selectedSanctuaryTypes
      : [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring];
    
    const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, typesToGenerate);
    
    
    clearAutosave();
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl, sanctuarySettings, gameRules, initialPoolTypes, pieceTheme, isAnalysisMode: false, opponentConfig });
    setView('game');
  };

  const handleRestartGame = () => {
    clearAutosave();
    setGameKey(prev => prev + 1);
  };

  const handleLoadGame = (data: {
    board: Board, 
    pieces: Piece[], 
    turnCounter: number, 
    sanctuaries: Sanctuary[], 
    moveTree?: MoveTree,
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    initialPoolTypes?: SanctuaryType[]
  }) => {
    const { board, pieces, turnCounter, sanctuaries, moveTree, sanctuarySettings, initialPoolTypes } = data;
    // Reset layout based on new board size
    const layout = getStartingLayout(board);
    // PGN imports should always start in analysis mode so users can navigate the game
    setGameConfig({ board, pieces, layout, moveTree, turnCounter, sanctuaries, sanctuarySettings, initialPoolTypes, isAnalysisMode: true });
    setGameKey(prev => prev + 1); // Force remount
    setView('game');
  };

  const handleLoadSavedGame = (record: SavedGameRecord) => {
    const result = loadPGNText(record.pgn);
    if (!result || (result.diagnostics && result.diagnostics.length > 0)) {
      alert("Saved game could not be loaded. The PGN may be damaged.");
      return;
    }

    handleLoadGame({
      board: result.board,
      pieces: result.pieces,
      turnCounter: result.turnCounter,
      sanctuaries: result.sanctuaries,
      moveTree: result.moveTree,
      sanctuarySettings: result.sanctuarySettings,
      initialPoolTypes: result.sanctuaryPool
    });
  };

  const handleSaveGameToLibrary = async (pgn: string, status: SavedGameStatus) => {
    const defaultName = createDefaultSavedGameName(pgn);
    const name = prompt("Save game as:", defaultName);
    if (!name?.trim()) return;

    try {
      await gameLibraryRepository.saveGame(createSavedGameRecord({
        pgn,
        name: name.trim(),
        status
      }));
      alert("Game saved to library.");
    } catch (error) {
      console.error("Failed to save game to library", error);
      alert("Could not save game to library.");
    }
  };

  const handleImportPGNToLibrary = async (pgn: string, name: string) => {
    const result = loadPGNText(pgn);
    if (!result || (result.diagnostics && result.diagnostics.length > 0)) {
      throw new Error("PGN could not be imported. Check that it replays correctly.");
    }

    await gameLibraryRepository.saveGame(createSavedGameRecord({
      pgn,
      name,
      status: "analysis"
    }));
  };
  
  const [gameKey, setGameKey] = useState(0);

  const handleEnableAnalysis = (board: Board, pieces: Piece[], turnCounter: number, sanctuaries: Sanctuary[]) => {
    const layout = getStartingLayout(board);
    setGameConfig({ board, pieces, layout, turnCounter, sanctuaries, isAnalysisMode: true });
    setGameKey(prev => prev + 1); // Force remount with new setting
  };

  // Editor handlers
  const handleEditPosition = (board?: Board, pieces?: Piece[], sanctuaries?: Sanctuary[]) => {
    clearAutosave();
    setPreviousView(view);
    setEditorConfig({ board, pieces, sanctuaries });
    setView('editor');
  };

  const handleEditorBack = () => {
    setView(previousView);
  };

  const handlePlayFromEditor = (board: Board, pieces: Piece[], sanctuaries: Sanctuary[]) => {
    clearAutosave();
    const layout = getStartingLayout(board);
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl: undefined, isAnalysisMode: false });
    setGameKey(prev => prev + 1);
    setView('game');
  };

  return (
    <ThemeProvider>
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
              initialMoveTree={gameConfig.moveTree}
              initialTurnCounter={gameConfig.turnCounter}
              initialSanctuaries={gameConfig.sanctuaries}
              timeControl={gameConfig.timeControl}
              sanctuarySettings={gameConfig.sanctuarySettings}
              gameRules={gameConfig.gameRules}
              isAnalysisMode={gameConfig.isAnalysisMode}
              onEnableAnalysis={handleEnableAnalysis}
              onResign={() => {}} // Controlled internally or via prop if we want to bubble up
              onSetup={handleNewGameClick}
              onRestart={handleRestartGame}
              onLoadGame={handleLoadGame}
              onEditPosition={handleEditPosition}
              onTutorial={handleTutorialClick}
              onOpenLibrary={handleOpenLibrary}
              onSaveGameToLibrary={handleSaveGameToLibrary}
              pieceTheme={gameConfig.pieceTheme}
              opponentConfig={gameConfig.opponentConfig}
              initialPoolTypes={gameConfig.initialPoolTypes}
            />
        </div>
      )}

      {view === 'library' && (
        <GameLibrary
          repository={gameLibraryRepository}
          onBack={() => setView(previousView === 'library' ? 'game' : previousView)}
          onLoadGame={handleLoadSavedGame}
          onImportPGN={handleImportPGNToLibrary}
        />
      )}

      {view === 'editor' && (
        <BoardEditor
          initialBoard={editorConfig.board}
          initialPieces={editorConfig.pieces}
          initialSanctuaries={editorConfig.sanctuaries}
          onPlay={handlePlayFromEditor}
          onBack={handleEditorBack}
        />
      )}

      {view === 'tutorial' && (
        <Tutorial
          onBack={() => setView('game')}
        />
      )}

      <InstallAppHint />
    </div>
    </ThemeProvider>
  );
}

export default App;

