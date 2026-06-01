import type { CreatedOnlineGame } from "./OnlineGameService";
import { validateOnlineGameSnapshot } from "./protocol";
import { ONLINE_PROTOCOL_VERSION, isSupportedOnlineProtocolVersion } from "./protocolVersion";
import { validateOnlineGameSummary, type OnlineGameSummary } from "./readModel";
import {
  OnlineConnectionStatus,
  OnlineGameResultDTO,
  OnlineGameSetupDTO,
  OnlineGameSnapshotDTO,
} from "./types";

export interface OnlineJoinParams {
  gameId: string;
  seat: "w" | "b";
  token: string;
}

export interface OnlineSpectatorParams {
  gameId: string;
}

interface OnlineJoinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled online connection status: ${value}`);
}

function storageKey(gameId: string, seat: "w" | "b"): string {
  return `castles_online_join:${gameId}:${seat}`;
}

function opponentInviteStorageKey(gameId: string): string {
  return `castles_online_opponent_invite:${gameId}`;
}

const ANONYMOUS_SESSION_STORAGE_KEY = "castles_online_anonymous_session_id";

function defaultAnonymousSessionIdFactory(): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `anon_${randomId}`;
}

function isValidAnonymousSessionId(value: string | null): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export function parseOnlineJoinParams(urlText: string): OnlineJoinParams | null {
  const url = new URL(urlText);
  const gameId = url.searchParams.get("onlineGame");
  const seat = url.searchParams.get("seat");
  const token = url.searchParams.get("token");

  if (!gameId || !token || (seat !== "w" && seat !== "b")) {
    return null;
  }

  return { gameId, seat, token };
}

export function parseOnlineSpectatorParams(urlText: string): OnlineSpectatorParams | null {
  const url = new URL(urlText);
  const gameId = url.searchParams.get("onlineGame");
  const view = url.searchParams.get("view");

  if (!gameId || view !== "spectator") {
    return null;
  }

  return { gameId };
}

export function buildSpectatorUrl(originOrUrl: string, gameId: string): string {
  const url = new URL(originOrUrl);
  url.searchParams.delete("seat");
  url.searchParams.delete("token");
  url.searchParams.delete("pgn");
  url.searchParams.delete("game");
  url.searchParams.set("onlineGame", gameId);
  url.searchParams.set("view", "spectator");
  return url.toString();
}

export function rememberOnlineJoinParams(
  join: OnlineJoinParams,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.setItem(storageKey(join.gameId, join.seat), join.token);
}

export function rememberOnlineOpponentInviteUrl(
  gameId: string,
  inviteUrl: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): void {
  storage?.setItem(opponentInviteStorageKey(gameId), inviteUrl);
}

export function resolveOnlineOpponentInviteUrl(
  gameId: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): string | null {
  return storage?.getItem(opponentInviteStorageKey(gameId)) ?? null;
}

export function resolveOnlineAnonymousSessionId(
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage,
  idFactory: () => string = defaultAnonymousSessionIdFactory
): string {
  const stored = storage?.getItem(ANONYMOUS_SESSION_STORAGE_KEY) ?? null;
  if (isValidAnonymousSessionId(stored)) {
    return stored;
  }

  const nextId = idFactory();
  if (!isValidAnonymousSessionId(nextId)) {
    throw new Error("Generated online anonymous session id is invalid.");
  }
  storage?.setItem(ANONYMOUS_SESSION_STORAGE_KEY, nextId);
  return nextId;
}

export function resolveOnlineJoinParams(
  urlText: string,
  storage: OnlineJoinStorage | null = typeof window === "undefined" ? null : window.sessionStorage
): OnlineJoinParams | null {
  const parsed = parseOnlineJoinParams(urlText);
  if (parsed) {
    rememberOnlineJoinParams(parsed, storage);
    return parsed;
  }

  const url = new URL(urlText);
  const gameId = url.searchParams.get("onlineGame");
  const seat = url.searchParams.get("seat");
  if (!gameId || (seat !== "w" && seat !== "b")) {
    return null;
  }

  const token = storage?.getItem(storageKey(gameId, seat));
  return token ? { gameId, seat, token } : null;
}

export function removeOnlineTokenFromUrl(urlText: string): string {
  const url = new URL(urlText);
  url.searchParams.delete("token");
  return url.toString();
}

export function buildOnlineWebSocketUrl(originOrUrl: string): string {
  const url = new URL(originOrUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getReconnectDelayMs(attempt: number): number {
  const cappedAttempt = Math.min(Math.max(attempt, 0), 6);
  return Math.min(10_000, 500 * 2 ** cappedAttempt);
}

export function shouldApplyOnlineSnapshotVersion(
  latestVersion: number | null,
  nextVersion: number
): boolean {
  return latestVersion === null || nextVersion > latestVersion;
}

export function shouldApplyOnlineSnapshot(
  latestSnapshot: OnlineGameSnapshotDTO | null,
  nextSnapshot: OnlineGameSnapshotDTO
): boolean {
  if (!latestSnapshot) return true;
  if (nextSnapshot.version > latestSnapshot.version) return true;
  if (nextSnapshot.version < latestSnapshot.version) return false;

  const latestResult = latestSnapshot.result;
  const nextResult = nextSnapshot.result;
  if (
    latestResult?.winner !== nextResult?.winner ||
    latestResult?.reason !== nextResult?.reason
  ) {
    return true;
  }

  const latestServerNow = latestSnapshot.clock?.serverNow;
  const nextServerNow = nextSnapshot.clock?.serverNow;
  if (latestSnapshot.clock === undefined && nextSnapshot.clock !== undefined) {
    return true;
  }

  return (
    typeof latestServerNow === "number" &&
    typeof nextServerNow === "number" &&
    nextServerNow > latestServerNow
  );
}

export function formatOnlineGameResult(result: OnlineGameResultDTO): string {
  const winner = result.winner === "w" ? "White" : "Black";
  switch (result.reason) {
    case "timeout":
      return `${winner} wins on time`;
    case "resignation":
      return `${winner} wins by resignation`;
    case "castle_control":
      return `${winner} wins by castle control`;
    case "victory_points":
      return `${winner} wins by victory points`;
    case "monarch_captured":
    default:
      return `${winner} wins`;
  }
}

export function formatOnlineConnectionStatus(status: OnlineConnectionStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Live";
    case "disconnected":
      return "Disconnected";
    case "resyncing":
      return "Resyncing";
    case "access-denied":
      return "Access denied";
    case "protocol-error":
      return "Protocol error";
    case "server-error":
      return "Server error";
    case "terminal":
      return "Complete";
    default:
      return assertNever(status);
  }
}

export function formatOnlinePendingConnectionMessage(
  status: OnlineConnectionStatus
): string {
  switch (status) {
    case "resyncing":
      return "Resyncing online game";
    case "access-denied":
    case "protocol-error":
    case "server-error":
      return formatOnlineConnectionStatus(status);
    case "disconnected":
      return "Disconnected from online game";
    case "terminal":
      return "Online game complete";
    case "idle":
    case "connecting":
    case "connected":
      return "Connecting online game";
    default:
      return assertNever(status);
  }
}

export async function copyOnlineInviteUrl(
  inviteUrl: string,
  clipboard: ClipboardWriter | undefined =
    typeof navigator === "undefined" ? undefined : navigator.clipboard
): Promise<void> {
  if (!clipboard) {
    throw new Error("Clipboard API is not available.");
  }

  await clipboard.writeText(inviteUrl);
}

export async function createOnlineGame(
  setup: OnlineGameSetupDTO,
  fetchImpl: typeof fetch = fetch
): Promise<CreatedOnlineGame> {
  const response = await fetchImpl("/api/online/games", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup }),
  });

  if (!response.ok) {
    throw new Error(`Could not create online game (${response.status})`);
  }

  return response.json();
}

export async function fetchOnlineSnapshot(
  join: OnlineJoinParams,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSnapshotDTO> {
  const response = await fetchImpl(`/api/online/games/${encodeURIComponent(join.gameId)}`, {
    headers: {
      authorization: `Bearer ${join.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch online game (${response.status})`);
  }

  const body = await response.json();
  return validateSnapshotResponse(body, "Online snapshot");
}

export async function fetchOnlineSpectatorSnapshot(
  gameId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSnapshotDTO> {
  const response = await fetchImpl(
    `/api/online/games/${encodeURIComponent(gameId)}/spectator`
  );

  if (!response.ok) {
    throw new Error(`Could not fetch spectator game (${response.status})`);
  }

  const body = await response.json();
  return validateSnapshotResponse(body, "Online spectator snapshot");
}

function validateSnapshotResponse(
  body: unknown,
  label: string
): OnlineGameSnapshotDTO {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} response was malformed: response body must be an object.`);
  }
  if (!isSupportedOnlineProtocolVersion((body as { protocolVersion?: unknown }).protocolVersion)) {
    throw new Error(
      `${label} response was malformed: protocol version must be ${ONLINE_PROTOCOL_VERSION}.`
    );
  }

  const snapshot = (body as { snapshot?: unknown }).snapshot;
  const validation = validateOnlineGameSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`${label} response was malformed: ${validation.error.message}`);
  }
  return validation.value;
}

export async function fetchOnlineGameSummaries(
  fetchImpl: typeof fetch = fetch
): Promise<OnlineGameSummary[]> {
  const response = await fetchImpl("/api/online/games");

  if (!response.ok) {
    throw new Error(`Could not fetch online game summaries (${response.status})`);
  }

  const body = await response.json();
  if (!body || !Array.isArray(body.games)) {
    throw new Error("Online game summary response was malformed.");
  }

  return body.games.map((summary: unknown, index: number) => {
    const validation = validateOnlineGameSummary(summary);
    if (!validation.ok) {
      throw new Error(`Online game summary ${index + 1} was malformed: ${validation.error.message}`);
    }
    return validation.value;
  });
}
