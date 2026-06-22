import { normalizeOnlineAccountDisplayNameKey } from "./accounts";
import {
  parseOnlineAccountAvatar,
  type OnlineAccountAvatar,
} from "./social";

const PROFILE_AVATAR_CACHE_KEY = "castles-profile-avatar-cache-v1";
const PROFILE_AVATAR_CACHE_LIMIT = 20;
const PROFILE_AVATAR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedProfileAvatarEntry {
  displayName: string;
  avatar: OnlineAccountAvatar;
  cachedAt: number;
}

type ProfileAvatarCacheRecord = Record<string, CachedProfileAvatarEntry>;

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCachedAvatar(value: unknown): OnlineAccountAvatar | null {
  const parsed = parseOnlineAccountAvatar(value);
  return parsed.ok ? parsed.value : null;
}

function readCache(storage = localStorageOrNull()): ProfileAvatarCacheRecord {
  if (!storage) return {};
  const now = Date.now();
  try {
    const raw = storage.getItem(PROFILE_AVATAR_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const cache: ProfileAvatarCacheRecord = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isRecord(value) || typeof value.displayName !== "string") continue;
      if (typeof value.cachedAt !== "number" || !Number.isFinite(value.cachedAt)) continue;
      if (now - value.cachedAt > PROFILE_AVATAR_CACHE_TTL_MS) continue;
      const avatar = parseCachedAvatar(value.avatar);
      if (!avatar) continue;
      cache[key] = {
        displayName: value.displayName,
        avatar,
        cachedAt: value.cachedAt,
      };
    }
    return cache;
  } catch {
    return {};
  }
}

function writeCache(cache: ProfileAvatarCacheRecord, storage = localStorageOrNull()): void {
  if (!storage) return;
  try {
    const pruned = Object.fromEntries(
      Object.entries(cache)
        .sort(([, a], [, b]) => b.cachedAt - a.cachedAt)
        .slice(0, PROFILE_AVATAR_CACHE_LIMIT)
    );
    storage.setItem(PROFILE_AVATAR_CACHE_KEY, JSON.stringify(pruned));
  } catch {
    // Avatar cache is a display optimization; storage failures should not affect profiles.
  }
}

export function readCachedProfileAvatar(displayName: string): OnlineAccountAvatar | null {
  const key = normalizeOnlineAccountDisplayNameKey(displayName);
  if (!key) return null;
  return readCache()[key]?.avatar ?? null;
}

export function rememberCachedProfileAvatar(displayName: string, avatar: OnlineAccountAvatar): void {
  const parsedAvatar = parseCachedAvatar(avatar);
  if (!parsedAvatar) return;
  const key = normalizeOnlineAccountDisplayNameKey(displayName);
  if (!key) return;
  const cache = readCache();
  cache[key] = {
    displayName,
    avatar: parsedAvatar,
    cachedAt: Date.now(),
  };
  writeCache(cache);
}
