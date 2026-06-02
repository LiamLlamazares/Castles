import type { Color } from "../Constants";
import { validateOnlineGameId } from "./validation";

export type RecentOnlineGameStatus = "active" | "complete";
export type RecentOnlineGameRole = "player" | "spectator";

export interface RecentOnlineGameRecord {
  gameId: string;
  lastSeenAt: string;
  status: RecentOnlineGameStatus;
  role: RecentOnlineGameRole;
  seat?: Color;
}

interface RecentOnlineGameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const RECENT_ONLINE_GAMES_STORAGE_KEY = "castles_recent_online_games";
const MAX_RECENT_ONLINE_GAMES = 20;

function defaultStorage(): RecentOnlineGameStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function normalizeRecentOnlineGameRecord(value: unknown): RecentOnlineGameRecord | null {
  if (!isRecord(value)) return null;
  const gameId = validateOnlineGameId(value.gameId);
  if (!gameId.ok) return null;
  const status = value.status === "complete" ? "complete" : value.status === "active" ? "active" : null;
  if (!status) return null;
  const role = value.role === "player" ? "player" : value.role === "spectator" ? "spectator" : null;
  if (!role) return null;
  const seat = value.seat === "w" || value.seat === "b" ? value.seat : undefined;

  return {
    gameId: gameId.value,
    lastSeenAt: isValidIsoDate(value.lastSeenAt) ? value.lastSeenAt : new Date(0).toISOString(),
    status,
    role,
    ...(seat ? { seat } : {}),
  };
}

export function loadRecentOnlineGames(
  storage: RecentOnlineGameStorage | null = defaultStorage()
): RecentOnlineGameRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_ONLINE_GAMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const records: RecentOnlineGameRecord[] = [];
    for (const value of parsed) {
      const record = normalizeRecentOnlineGameRecord(value);
      if (!record || seen.has(record.gameId)) continue;
      seen.add(record.gameId);
      records.push(record);
    }
    return records
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .slice(0, MAX_RECENT_ONLINE_GAMES);
  } catch {
    return [];
  }
}

export function rememberRecentOnlineGame(
  record: Omit<RecentOnlineGameRecord, "lastSeenAt"> & { lastSeenAt?: string },
  storage: RecentOnlineGameStorage | null = defaultStorage()
): RecentOnlineGameRecord[] {
  if (!storage) return [];
  const gameId = validateOnlineGameId(record.gameId);
  if (!gameId.ok) return loadRecentOnlineGames(storage);

  const nextRecord: RecentOnlineGameRecord = {
    gameId: gameId.value,
    lastSeenAt: record.lastSeenAt ?? new Date().toISOString(),
    status: record.status,
    role: record.role,
    ...(record.seat ? { seat: record.seat } : {}),
  };
  const next = [
    nextRecord,
    ...loadRecentOnlineGames(storage).filter((current) => current.gameId !== nextRecord.gameId),
  ].slice(0, MAX_RECENT_ONLINE_GAMES);

  try {
    storage.setItem(RECENT_ONLINE_GAMES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return next;
  }

  return next;
}

export function clearRecentOnlineGames(
  storage: RecentOnlineGameStorage | null = defaultStorage()
): void {
  storage?.removeItem(RECENT_ONLINE_GAMES_STORAGE_KEY);
}
