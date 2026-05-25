import React from "react";
import {
  GameLibraryRepository,
  SavedGameRecord,
  SavedGameSummary,
} from "../Classes/Services/GameLibraryRepository";

interface GameLibraryProps {
  repository: GameLibraryRepository;
  onBack: () => void;
  onLoadGame: (record: SavedGameRecord) => void;
  onImportPGN: (pgn: string, name: string) => Promise<void>;
}

const panelStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 15% 10%, rgba(255, 221, 126, 0.25), transparent 24%), linear-gradient(135deg, #20150f 0%, #3b2517 44%, #0f171a 100%)",
  color: "#f8ead2",
  padding: "36px",
  boxSizing: "border-box",
  fontFamily: "Georgia, 'Times New Roman', serif",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255, 244, 220, 0.08)",
  border: "1px solid rgba(255, 226, 173, 0.24)",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 18px 45px rgba(0, 0, 0, 0.28)",
};

const buttonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "10px",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
  letterSpacing: "0.03em",
};

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
    <div style={panelStyle}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "center", marginBottom: "28px" }}>
        <div>
          <div style={{ textTransform: "uppercase", color: "#d9aa55", letterSpacing: "0.18em", fontSize: "0.78rem" }}>
            Local archive
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: "3rem", lineHeight: 1 }}>Castles Game Library</h1>
          <p style={{ margin: "10px 0 0", color: "#d9c7aa" }}>
            Named saves live here. Autosave remains separate, so test games do not flood the archive.
          </p>
        </div>
        <button style={{ ...buttonStyle, background: "#f6d38b", color: "#24150b" }} onClick={onBack}>
          Back to game
        </button>
      </header>

      <main style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(320px, 0.8fr)", gap: "22px" }}>
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Saved games</h2>
          {games.length === 0 ? (
            <p style={{ color: "#d9c7aa" }}>No named saves yet. Use Menu &rarr; Save Game during play.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {games.map(game => (
                <button
                  key={game.id}
                  onClick={() => setSelectedId(game.id)}
                  style={{
                    ...cardStyle,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "#f8ead2",
                    background: selectedId === game.id ? "rgba(246, 211, 139, 0.18)" : "rgba(255, 244, 220, 0.06)",
                    borderColor: selectedId === game.id ? "#f6d38b" : "rgba(255, 226, 173, 0.18)",
                  }}
                >
                  <strong style={{ fontSize: "1.08rem" }}>{game.name}</strong>
                  <div style={{ marginTop: "6px", color: "#d9c7aa", fontSize: "0.9rem" }}>
                    {game.players.white} vs {game.players.black} · {game.moveCount} moves · {game.status}
                  </div>
                  <div style={{ marginTop: "4px", color: "#a99474", fontSize: "0.8rem" }}>
                    Updated {new Date(game.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "18px" }}>
            <button style={{ ...buttonStyle, background: "#70d6a1", color: "#102018" }} disabled={!selected} onClick={handleLoad}>Load</button>
            <button style={{ ...buttonStyle, background: "#f6d38b", color: "#24150b" }} disabled={!selected} onClick={handleRename}>Rename</button>
            <button style={{ ...buttonStyle, background: "#9bd3ff", color: "#0b2030" }} disabled={!selected} onClick={handleExport}>Export PGN</button>
            <button style={{ ...buttonStyle, background: "#e16b5f", color: "#fff" }} disabled={!selected} onClick={handleDelete}>Delete</button>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Import PGN</h2>
          <label style={{ display: "block", color: "#d9c7aa", marginBottom: "6px" }}>Save name</label>
          <input
            value={importName}
            onChange={event => setImportName(event.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)", marginBottom: "12px" }}
          />
          <label style={{ display: "block", color: "#d9c7aa", marginBottom: "6px" }}>PGN text</label>
          <textarea
            value={importPGN}
            onChange={event => setImportPGN(event.target.value)}
            rows={12}
            style={{ width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)", resize: "vertical" }}
          />
          <button style={{ ...buttonStyle, marginTop: "12px", background: "#f6d38b", color: "#24150b" }} onClick={handleImport}>
            Import into library
          </button>
          {message && <p style={{ color: "#f6d38b", marginBottom: 0 }}>{message}</p>}
        </section>
      </main>
    </div>
  );
};

export default GameLibrary;
