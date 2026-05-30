import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GameBoard from './components/Game';
import MainMenu from './components/MainMenu';
import GameSetup from './components/GameSetup';
import BoardEditor from './components/BoardEditor';
import Tutorial from './components/Tutorial';
import GameLibrary from './components/GameLibrary';
import InstallAppHint from './components/InstallAppHint';
import RulesManualPage from './components/RulesManualPage';
import { Board } from './Classes/Core/Board';
import { Piece } from './Classes/Entities/Piece';
import { LayoutService } from './Classes/Systems/LayoutService';
import { MoveTree } from './Classes/Core/MoveTree';
import { SanctuaryType, PieceTheme } from './Constants';
import { Sanctuary } from './Classes/Entities/Sanctuary';
import { getStartingLayout } from './ConstantImports';
import { AIOpponentConfig } from './hooks/useAIOpponent';
import { useOnlineGameConnection } from './hooks/useOnlineGameConnection';
import {
  createMoveTreeFromHistory,
  hydrateGameStateDTO,
  hydrateOnlineGameSetupDTO,
  serializeOnlineGameSetup,
} from './online/serialization';
import {
  createOnlineGame,
  rememberOnlineJoinParams,
  removeOnlineTokenFromUrl,
  resolveOnlineJoinParams,
  OnlineJoinParams,
} from './online/client';
import type { OnlineClientSession, OnlineGameSnapshotDTO } from './online/types';
import { ThemeProvider } from './contexts/ThemeContext';
import {
  BrowserGameLibraryRepository,
  SavedGameRecord,
  SavedGameStatus,
  createDefaultSavedGameName,
  createSavedGameRecord,
} from './Classes/Services/GameLibraryRepository';
import { loadPGNText } from './Classes/Services/PGNLoadService';
import type { PhoenixRecord } from './Classes/Core/GameState';

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
  graveyard?: Piece[];
  phoenixRecords?: PhoenixRecord[];
  promotionPending?: Piece | null;
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
  const [onlineJoin, setOnlineJoin] = useState<OnlineJoinParams | null>(() =>
    resolveOnlineJoinParams(window.location.href)
  );
  const [onlineSnapshot, setOnlineSnapshot] = useState<OnlineGameSnapshotDTO | null>(null);

  const clearAutosave = () => {
    localStorage.removeItem('castles_autosave');
  };

  const clearOnlineUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("onlineGame");
    url.searchParams.delete("seat");
    url.searchParams.delete("token");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const clearOnlineTokenFromUrl = () => {
    if (!window.location.search.includes("token=")) return;
    const url = new URL(removeOnlineTokenFromUrl(window.location.href));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    if (!onlineJoin) return;
    rememberOnlineJoinParams(onlineJoin);
    clearOnlineTokenFromUrl();
  }, [onlineJoin]);

  const handleNewGameClick = () => {
    clearAutosave();
    clearOnlineUrl();
    setOnlineJoin(null);
    setOnlineSnapshot(null);
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
    sanctuaries?: Sanctuary[],
    selectedSanctuaryTypes?: SanctuaryType[],
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    gameRules?: { vpModeEnabled: boolean },
    initialPoolTypes?: SanctuaryType[],
    pieceTheme?: PieceTheme,
    opponentConfig?: AIOpponentConfig
  ) => {
    const layout = getStartingLayout(board);

    clearAutosave();
    clearOnlineUrl();
    setOnlineJoin(null);
    setOnlineSnapshot(null);
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl, sanctuarySettings, gameRules, initialPoolTypes, pieceTheme, isAnalysisMode: false, opponentConfig });
    setView('game');
  };

  const handleCreateOnlineGame = async (
    board: Board,
    pieces: Piece[],
    timeControl?: { initial: number, increment: number },
    sanctuaries?: Sanctuary[],
    _selectedSanctuaryTypes?: SanctuaryType[],
    sanctuarySettings?: { unlockTurn: number, cooldown: number },
    gameRules?: { vpModeEnabled: boolean },
    initialPoolTypes?: SanctuaryType[],
    pieceTheme?: PieceTheme
  ) => {
    try {
      clearAutosave();
      const created = await createOnlineGame(
        serializeOnlineGameSetup({
          board,
          pieces,
          sanctuaries: sanctuaries ?? [],
          timeControl: undefined,
          sanctuarySettings,
          gameRules,
          initialPoolTypes,
          pieceTheme,
        })
      );

      window.prompt("Send this invite link to your friend:", created.black.url);
      const whiteJoin = {
        gameId: created.gameId,
        seat: "w" as const,
        token: created.white.token,
      };
      rememberOnlineJoinParams(whiteJoin);
      const whiteUrl = new URL(removeOnlineTokenFromUrl(created.white.url));
      window.history.pushState(
        {},
        "",
        `${window.location.pathname}?${whiteUrl.searchParams.toString()}`
      );
      setOnlineJoin(whiteJoin);
      setView('game');
    } catch (error) {
      console.error("Failed to create online game", error);
      alert("Could not create an online game. Make sure the Node server is running.");
    }
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
    clearOnlineUrl();
    setOnlineJoin(null);
    setOnlineSnapshot(null);
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
  const isRulesPage = window.location.pathname === '/rules';

  const handleOnlineSnapshot = useCallback((snapshot: OnlineGameSnapshotDTO) => {
    const setup = hydrateOnlineGameSetupDTO(snapshot.setup);
    const moveTree = createMoveTreeFromHistory(snapshot.moveHistory, snapshot.state);
    const state = hydrateGameStateDTO(snapshot.state, snapshot.setup, moveTree);
    const layout = getStartingLayout(setup.board);

    setOnlineSnapshot(snapshot);
    setGameConfig({
      board: setup.board,
      pieces: state.pieces,
      layout,
      moveTree: state.moveTree,
      turnCounter: state.turnCounter,
      sanctuaries: state.sanctuaries,
      sanctuarySettings: setup.sanctuarySettings,
      gameRules: setup.gameRules,
      initialPoolTypes: state.sanctuaryPool,
      graveyard: state.graveyard,
      phoenixRecords: state.phoenixRecords,
      promotionPending: state.promotionPending,
      pieceTheme: setup.pieceTheme,
      timeControl: undefined,
      isAnalysisMode: false,
    });
    setGameKey(prev => prev + 1);
    setView('game');
  }, []);

  const onlineConnection = useOnlineGameConnection(onlineJoin, handleOnlineSnapshot);
  const onlineSession = useMemo<OnlineClientSession | undefined>(() => {
    if (!onlineJoin || !onlineSnapshot) return undefined;
    return {
      gameId: onlineJoin.gameId,
      playerColor: onlineJoin.seat,
      version: onlineSnapshot.version,
      status: onlineConnection.status,
      lastError: onlineConnection.lastError,
      submitAction: onlineConnection.submitAction,
    };
  }, [onlineJoin, onlineSnapshot, onlineConnection]);

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
    clearOnlineUrl();
    setOnlineJoin(null);
    setOnlineSnapshot(null);
    setGameConfig({ board, pieces, layout, sanctuaries, timeControl: undefined, isAnalysisMode: false });
    setGameKey(prev => prev + 1);
    setView('game');
  };

  return (
    <ThemeProvider>
    <div className="App">
      {isRulesPage ? (
        <RulesManualPage />
      ) : (
        <>
      {view === 'menu' && (
        <MainMenu 
          onPlay={handleNewGameClick} 
        />
      )}
      
      {view === 'setup' && (
        <GameSetup 
          onPlay={handleStartGame} 
          onCreateOnlineGame={handleCreateOnlineGame}
        />
      )}

      {view === 'game' && onlineJoin && !onlineSnapshot && (
        <div
          style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#151515',
            color: '#f5f5f5',
            fontSize: '1rem',
          }}
        >
          Connecting online game{onlineConnection.lastError ? `: ${onlineConnection.lastError}` : '...'}
        </div>
      )}

      {view === 'game' && (!onlineJoin || onlineSnapshot) && (
        <div style={{ height: '100vh', width: '100vw' }}> {/* Ensure full screen for game */}
            <GameBoard 
              key={gameKey}
              initialBoard={gameConfig.board}
              initialPieces={gameConfig.pieces}
              initialLayout={gameConfig.layout}
              initialMoveTree={gameConfig.moveTree}
              initialTurnCounter={gameConfig.turnCounter}
              initialSanctuaries={gameConfig.sanctuaries}
              initialGraveyard={gameConfig.graveyard}
              initialPhoenixRecords={gameConfig.phoenixRecords}
              initialPromotionPending={gameConfig.promotionPending}
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
              onlineSession={onlineSession}
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
        </>
      )}
    </div>
    </ThemeProvider>
  );
}

export default App;

