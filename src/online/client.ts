import type { CreatedOnlineGame } from "./OnlineGameService";
import { OnlineGameSetupDTO } from "./types";

export interface OnlineJoinParams {
  gameId: string;
  seat: "w" | "b";
  token: string;
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

export function buildOnlineWebSocketUrl(originOrUrl: string): string {
  const url = new URL(originOrUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
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
