import type { CreatedOnlineGame } from "./OnlineGameService";
import { OnlineGameResultDTO, OnlineGameSetupDTO, OnlineGameSnapshotDTO } from "./types";

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

function storageKey(gameId: string, seat: "w" | "b"): string {
  return `castles_online_join:${gameId}:${seat}`;
}

function opponentInviteStorageKey(gameId: string): string {
  return `castles_online_opponent_invite:${gameId}`;
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
  return body.snapshot;
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
  return body.snapshot;
}
