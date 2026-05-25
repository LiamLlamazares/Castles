export type SavedGameStatus = "ongoing" | "complete" | "analysis";

export interface SavedGameSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: SavedGameStatus;
  moveCount: number;
  players: { white: string; black: string };
}

export interface SavedGameRecord extends SavedGameSummary {
  pgn: string;
  notes?: string;
}

export interface GameLibraryRepository {
  listGames(): Promise<SavedGameSummary[]>;
  saveGame(game: SavedGameRecord): Promise<void>;
  loadGame(id: string): Promise<SavedGameRecord>;
  deleteGame(id: string): Promise<void>;
  renameGame(id: string, name: string): Promise<void>;
}

interface BrowserGameLibraryRepositoryOptions {
  indexedDB?: IDBFactory;
  storage?: Storage;
  now?: () => string;
  idFactory?: () => string;
  dbName?: string;
}

interface CreateSavedGameRecordOptions {
  pgn: string;
  name: string;
  status?: SavedGameStatus;
  notes?: string;
  now?: () => string;
  idFactory?: () => string;
}

const DB_VERSION = 1;
const STORE_NAME = "games";
const FALLBACK_KEY = "castles_game_library_records";
const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

export class BrowserGameLibraryRepository implements GameLibraryRepository {
  private readonly indexedDBFactory?: IDBFactory;
  private readonly storage?: Storage;
  private readonly now: () => string;
  private readonly dbName: string;

  constructor(options: BrowserGameLibraryRepositoryOptions = {}) {
    this.indexedDBFactory =
      options.indexedDB ??
      (typeof indexedDB !== "undefined" ? indexedDB : undefined);
    this.storage =
      options.storage ??
      (typeof localStorage !== "undefined" ? localStorage : undefined);
    this.now = options.now ?? (() => new Date().toISOString());
    this.dbName = options.dbName ?? "castles-game-library";
  }

  public async listGames(): Promise<SavedGameSummary[]> {
    const records = await this.readAllRecords();
    return records
      .map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async saveGame(game: SavedGameRecord): Promise<void> {
    if (this.indexedDBFactory) {
      await this.withStore("readwrite", store => store.put(game));
      return;
    }

    const records = this.readFallbackRecords();
    const next = records.filter(record => record.id !== game.id);
    next.push(game);
    this.writeFallbackRecords(next);
  }

  public async loadGame(id: string): Promise<SavedGameRecord> {
    if (this.indexedDBFactory) {
      const record = await this.withStore<SavedGameRecord | undefined>(
        "readonly",
        store => store.get(id)
      );
      if (record) return record;
      throw new Error(`Saved game not found: ${id}`);
    }

    const record = this.readFallbackRecords().find(game => game.id === id);
    if (record) return record;
    throw new Error(`Saved game not found: ${id}`);
  }

  public async deleteGame(id: string): Promise<void> {
    if (this.indexedDBFactory) {
      await this.withStore("readwrite", store => store.delete(id));
      return;
    }

    this.writeFallbackRecords(
      this.readFallbackRecords().filter(game => game.id !== id)
    );
  }

  public async renameGame(id: string, name: string): Promise<void> {
    const record = await this.loadGame(id);
    await this.saveGame({
      ...record,
      name,
      updatedAt: this.now(),
    });
  }

  private async readAllRecords(): Promise<SavedGameRecord[]> {
    if (this.indexedDBFactory) {
      return this.withStore<SavedGameRecord[]>("readonly", store => store.getAll());
    }
    return this.readFallbackRecords();
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.indexedDBFactory) {
      return Promise.reject(new Error("IndexedDB is unavailable"));
    }

    return new Promise((resolve, reject) => {
      const request = this.indexedDBFactory!.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const database = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = action(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => database.close();
    });
  }

  private readFallbackRecords(): SavedGameRecord[] {
    if (!this.storage) return [];

    try {
      const raw = this.storage.getItem(FALLBACK_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("[GameLibrary] Failed to read fallback library", error);
      return [];
    }
  }

  private writeFallbackRecords(records: SavedGameRecord[]): void {
    if (!this.storage) return;
    this.storage.setItem(FALLBACK_KEY, JSON.stringify(records));
  }
}

export function createSavedGameRecord(options: CreateSavedGameRecordOptions): SavedGameRecord {
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? createId;
  const timestamp = now();
  const tags = parsePGNTags(options.pgn);
  const result = tags.Result ?? "*";

  return {
    id: idFactory(),
    name: options.name.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: options.status ?? (result !== "*" ? "complete" : "ongoing"),
    moveCount: countMoves(options.pgn),
    players: {
      white: tags.White || "White",
      black: tags.Black || "Black",
    },
    pgn: options.pgn,
    notes: options.notes,
  };
}

export function createDefaultSavedGameName(pgn: string, date = new Date()): string {
  const tags = parsePGNTags(pgn);
  const white = tags.White || "White";
  const black = tags.Black || "Black";
  const day = date.toISOString().slice(0, 10);
  return `${white} vs ${black} - ${day}`;
}

function toSummary(record: SavedGameRecord): SavedGameSummary {
  const { pgn, notes, ...summary } = record;
  return summary;
}

function parsePGNTags(pgn: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagPattern = /^\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]$/gm;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(pgn)) !== null) {
    tags[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return tags;
}

function countMoves(pgn: string): number {
  const body = pgn
    .replace(/^\[[^\n]*\]\s*$/gm, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/;[^\n]*/g, " ")
    .replace(/\d+\.\.\.|\d+\./g, " ");

  return body
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 0 && !RESULT_TOKENS.has(token))
    .length;
}

function createId(): string {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `game-${randomId}`;
}
