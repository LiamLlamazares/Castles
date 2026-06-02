import React from "react";
import AppShellNav, { AppShellDestination } from "./AppShellNav";
import {
  GameLibraryRepository,
  SavedGameRecord,
  SavedGameSummary,
} from "../Classes/Services/GameLibraryRepository";
import "../css/GameLibrary.css";

interface GameLibraryProps {
  repository: GameLibraryRepository;
  onBack: () => void;
  onOpenGame?: () => void;
  backLabel?: string;
  onTutorial?: () => void;
  onOpenOnlineBrowser?: () => void;
  onLoadGame: (record: SavedGameRecord) => void;
  onImportPGN: (pgn: string, name: string) => Promise<void>;
}

type LibraryDialogState =
  | { type: "rename"; id: string; name: string }
  | { type: "delete"; id: string };

const GameLibrary: React.FC<GameLibraryProps> = ({
  repository,
  onBack,
  onOpenGame,
  backLabel = "Back to game",
  onTutorial,
  onOpenOnlineBrowser,
  onLoadGame,
  onImportPGN,
}) => {
  const [games, setGames] = React.useState<SavedGameSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string>("");
  const [dialogError, setDialogError] = React.useState<string>("");
  const [importName, setImportName] = React.useState<string>("Imported game");
  const [importPGN, setImportPGN] = React.useState<string>("");
  const [libraryDialog, setLibraryDialog] = React.useState<LibraryDialogState | null>(null);
  const [isDialogSubmitting, setDialogSubmitting] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const renameInputRef = React.useRef<HTMLInputElement>(null);
  const deleteButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = React.useRef<HTMLElement | null>(null);

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

  const openLibraryDialog = (dialog: LibraryDialogState) => {
    dialogReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialogError("");
    setLibraryDialog(dialog);
  };

  const closeLibraryDialog = () => {
    setDialogError("");
    setLibraryDialog(null);
    window.setTimeout(() => {
      dialogReturnFocusRef.current?.focus();
      dialogReturnFocusRef.current = null;
    }, 0);
  };

  const getDialogFocusables = React.useCallback(() => {
    return Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
  }, []);

  React.useEffect(() => {
    if (!libraryDialog) return;
    const timer = window.setTimeout(() => {
      if (libraryDialog.type === "rename") {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      } else {
        deleteButtonRef.current?.focus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [libraryDialog]);

  React.useEffect(() => {
    if (!libraryDialog) return;

    const page = dialogRef.current?.closest(".game-library-page");
    if (!page) return;

    const backgroundChildren = Array.from(page.children).filter(
      (child) => !child.classList.contains("library-dialog-backdrop")
    );
    const previousValues = backgroundChildren.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.hasAttribute("inert"),
    }));
    previousValues.forEach(({ element }) => {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("inert", "");
    });

    return () => {
      previousValues.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
        if (!inert) {
          element.removeAttribute("inert");
        }
      });
    };
  }, [libraryDialog]);

  React.useEffect(() => {
    if (!libraryDialog) return;

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDialogSubmitting) {
        event.preventDefault();
        closeLibraryDialog();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getDialogFocusables();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!dialogRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [getDialogFocusables, isDialogSubmitting, libraryDialog]);

  const handleRename = () => {
    if (!selectedId) return;
    const selected = games.find(game => game.id === selectedId);
    openLibraryDialog({
      type: "rename",
      id: selectedId,
      name: selected?.name ?? "",
    });
  };

  const handleDelete = () => {
    if (!selectedId) return;
    openLibraryDialog({ type: "delete", id: selectedId });
  };

  const handleRenameSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!libraryDialog || libraryDialog.type !== "rename" || isDialogSubmitting) return;
    const nextName = libraryDialog.name.trim();
    if (!nextName) {
      setDialogError("Enter a name for this save.");
      return;
    }

    try {
      setDialogSubmitting(true);
      setDialogError("");
      await repository.renameGame(libraryDialog.id, nextName);
      setMessage("Saved game renamed.");
      closeLibraryDialog();
      await refreshGames();
    } catch (error) {
      console.error("[GameLibrary] Failed to rename saved game", error);
      setDialogError("Could not update this saved game.");
    } finally {
      setDialogSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!libraryDialog || libraryDialog.type !== "delete" || isDialogSubmitting) return;
    try {
      setDialogSubmitting(true);
      setDialogError("");
      await repository.deleteGame(libraryDialog.id);
      setSelectedId(null);
      setMessage("Saved game deleted.");
      closeLibraryDialog();
      await refreshGames();
    } catch (error) {
      console.error("[GameLibrary] Failed to delete saved game", error);
      setDialogError("Could not update this saved game.");
    } finally {
      setDialogSubmitting(false);
    }
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
  const openAnalysisLabel = selected?.status === "complete" ? "Analyze" : "Open Analysis";
  const dialogGame = libraryDialog ? games.find(game => game.id === libraryDialog.id) : null;
  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame ?? onBack },
    ...(onTutorial ? [{ id: "learn" as const, label: "Tutorial", onClick: onTutorial }] : []),
    ...(onOpenOnlineBrowser ? [{ id: "online" as const, label: "Online", onClick: onOpenOnlineBrowser }] : []),
    { id: "library", label: "Library" },
  ];

  return (
    <div className="game-library-page">
        <AppShellNav
        ariaLabel="Library navigation"
        activeDestination="library"
        title="Castles Game Library"
        kicker="Local archive"
        description="Named saves live here. Autosave remains separate, so test games do not flood the archive."
        backLabel={backLabel}
        onBack={onBack}
        destinations={navDestinations}
      />

      {message && (
        <div className="library-message" role="status" aria-live="polite">
          {message}
        </div>
      )}

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
            <button
              className="library-button success"
              disabled={!selected}
              onClick={handleLoad}
              aria-describedby={selected ? "library-open-analysis-help" : undefined}
              title="Open this save on a review board; clocks and online seats are not resumed."
            >
              {openAnalysisLabel}
            </button>
            <span id="library-open-analysis-help" className="visually-hidden">
              Saved games open on a review board; clocks and online seats are not resumed.
            </span>
            <button className="library-button neutral" disabled={!selected} onClick={handleRename}>Rename</button>
            <button className="library-button info" disabled={!selected} onClick={handleExport}>Export PGN</button>
            <button className="library-button danger" disabled={!selected} onClick={handleDelete}>Delete</button>
          </div>
        </section>

        <details className="game-library-panel game-library-import">
          <summary>Import PGN</summary>
          <div className="game-library-import-body">
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
          </div>
        </details>
      </main>

      {libraryDialog && (
        <div className="library-dialog-backdrop">
          <div
            className="library-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={libraryDialog.type === "rename" ? "library-rename-title" : "library-delete-title"}
            ref={dialogRef}
          >
            {libraryDialog.type === "rename" ? (
              <form className="library-dialog-form" onSubmit={handleRenameSubmit}>
                <h2 id="library-rename-title">Rename saved game</h2>
                <label className="library-label" htmlFor="library-rename-name">
                  Save name
                </label>
                <input
                  id="library-rename-name"
                  className="library-input"
                  value={libraryDialog.name}
                  onChange={(event) => {
                    setDialogError("");
                    setLibraryDialog({
                      ...libraryDialog,
                      name: event.currentTarget.value,
                    });
                  }}
                  ref={renameInputRef}
                />
                {dialogError && (
                  <div className="library-dialog-error" role="alert">
                    {dialogError}
                  </div>
                )}
                <div className="library-dialog-actions">
                  <button type="button" className="library-button neutral" onClick={closeLibraryDialog} disabled={isDialogSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="library-button success" disabled={isDialogSubmitting}>
                    {isDialogSubmitting ? "Saving..." : "Save name"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h2 id="library-delete-title">Delete saved game</h2>
                <p>
                  Delete "{dialogGame?.name ?? "this saved game"}" from this browser's Library?
                </p>
                {dialogError && (
                  <div className="library-dialog-error" role="alert">
                    {dialogError}
                  </div>
                )}
                <div className="library-dialog-actions">
                  <button type="button" className="library-button neutral" onClick={closeLibraryDialog} disabled={isDialogSubmitting}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="library-button danger"
                    onClick={handleConfirmDelete}
                    ref={deleteButtonRef}
                    disabled={isDialogSubmitting}
                  >
                    {isDialogSubmitting ? "Deleting..." : "Delete save"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GameLibrary;
