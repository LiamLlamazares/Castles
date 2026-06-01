import React from "react";
import {
  GameLibraryRepository,
  SavedGameRecord,
  SavedGameSummary,
} from "../Classes/Services/GameLibraryRepository";
import "../css/GameLibrary.css";

interface GameLibraryProps {
  repository: GameLibraryRepository;
  onBack: () => void;
  onLoadGame: (record: SavedGameRecord) => void;
  onImportPGN: (pgn: string, name: string) => Promise<void>;
}

const GameLibrary: React.FC<GameLibraryProps> = ({
  repository,
  onBack,
  onLoadGame,
  onImportPGN,
}) => {
  const [games, setGames] = React.useState<SavedGameSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string>("");
  const [importName, setImportName] = React.useState<string>("Imported game");
  const [importPGN, setImportPGN] = React.useState<string>("");

  const refreshGames = React.useCallback(async () => {
    try {
      setGames(await repository.listGames());
    } catch (error) {
      console.error("[GameLibrary] Failed to list games", error);
      setMessage("Could not read the game library.");
    }
  }, [repository]);

  React.useEffect(() => {
    refreshGames();
  }, [refreshGames]);

  const loadSelectedRecord = async (): Promise<SavedGameRecord | null> => {
    if (!selectedId) return null;
    try {
      return await repository.loadGame(selectedId);
    } catch (error) {
      console.error("[GameLibrary] Failed to load selected game", error);
      setMessage("Could not load that saved game.");
      return null;
    }
  };

  const handleLoad = async () => {
    const record = await loadSelectedRecord();
    if (record) onLoadGame(record);
  };

  const handleRename = async () => {
    if (!selectedId) return;
    const selected = games.find(game => game.id === selectedId);
    const nextName = window.prompt("Rename saved game:", selected?.name ?? "");
    if (!nextName?.trim()) return;
    await repository.renameGame(selectedId, nextName.trim());
    setMessage("Saved game renamed.");
    await refreshGames();
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm("Delete this saved game?")) return;
    await repository.deleteGame(selectedId);
    setSelectedId(null);
    setMessage("Saved game deleted.");
    await refreshGames();
  };

  const handleExport = async () => {
    const record = await loadSelectedRecord();
    if (!record) return;

    const blob = new Blob([record.pgn], { type: "application/x-chess-pgn;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${record.name.replace(/[^a-z0-9_-]+/gi, "_") || "castles-game"}.pgn`;
    link.click();
    URL.revokeObjectURL(url);

    try {
      await navigator.clipboard?.writeText(record.pgn);
      setMessage("PGN downloaded and copied to clipboard.");
    } catch {
      setMessage("PGN downloaded.");
    }
  };

  const handleImport = async () => {
    if (!importPGN.trim()) {
      setMessage("Paste a PGN before importing.");
      return;
    }

    try {
      await onImportPGN(importPGN.trim(), importName.trim() || "Imported game");
      setImportPGN("");
      setImportName("Imported game");
      setMessage("PGN imported into the library.");
      await refreshGames();
    } catch (error) {
      console.error("[GameLibrary] Import failed", error);
      setMessage(error instanceof Error ? error.message : "PGN import failed.");
    }
  };

  const selected = games.find(game => game.id === selectedId);

  return (
    <div className="game-library-page">
      <header className="game-library-header">
        <div>
          <div className="game-library-kicker">
            Local archive
          </div>
          <h1>Castles Game Library</h1>
          <p>
            Named saves live here. Autosave remains separate, so test games do not flood the archive.
          </p>
        </div>
        <button className="library-button library-button-back" onClick={onBack}>
          Back to game
        </button>
      </header>

      <main className="game-library-layout">
        <section className="game-library-panel">
          <h2>Saved games</h2>
          {games.length === 0 ? (
            <p className="game-library-muted">No named saves yet. Use Menu &rarr; Save Game during play.</p>
          ) : (
            <div className="saved-game-list">
              {games.map(game => (
                <button
                  key={game.id}
                  onClick={() => setSelectedId(game.id)}
                  className={`saved-game-card ${selectedId === game.id ? "selected" : ""}`}
                >
                  <strong>{game.name}</strong>
                  <div className="saved-game-meta">
                    {game.players.white} vs {game.players.black} · {game.moveCount} moves · {game.status}
                  </div>
                  <div className="saved-game-date">
                    Updated {new Date(game.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="library-actions">
            <button className="library-button success" disabled={!selected} onClick={handleLoad}>Load</button>
            <button className="library-button neutral" disabled={!selected} onClick={handleRename}>Rename</button>
            <button className="library-button info" disabled={!selected} onClick={handleExport}>Export PGN</button>
            <button className="library-button danger" disabled={!selected} onClick={handleDelete}>Delete</button>
          </div>
        </section>

        <section className="game-library-panel">
          <h2>Import PGN</h2>
          <label className="library-label">Save name</label>
          <input
            value={importName}
            onChange={event => setImportName(event.target.value)}
            className="library-input"
          />
          <label className="library-label">PGN text</label>
          <textarea
            value={importPGN}
            onChange={event => setImportPGN(event.target.value)}
            rows={12}
            className="library-textarea"
          />
          <button className="library-button neutral import" onClick={handleImport}>
            Import into library
          </button>
          {message && <p className="library-message">{message}</p>}
        </section>
      </main>
    </div>
  );
};

export default GameLibrary;
