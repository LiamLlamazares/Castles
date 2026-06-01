import { Color } from "../Constants";
import type { OnlineGameSummary } from "./readModel";

export type OnlineAccessRole = "white" | "black" | "spectator" | "challenged" | "moderator" | "admin";

type SummaryVisibility = Pick<OnlineGameSummary, "visibility">;

export function roleForOnlineSeat(seat: Color): "white" | "black" {
  return seat === "w" ? "white" : "black";
}

export function canAccessOnlineGameSummary(
  summary: SummaryVisibility,
  role: OnlineAccessRole
): boolean {
  if (role === "admin" || role === "moderator") return true;
  if (role === "white" || role === "black") return true;
  if (summary.visibility === "public" || summary.visibility === "unlisted") return true;
  return role === "challenged";
}

export function canListOnlineGameSummary(summary: SummaryVisibility): boolean {
  return summary.visibility === "public";
}

export function canSpectateOnlineGameSummary(summary: SummaryVisibility): boolean {
  return canAccessOnlineGameSummary(summary, "spectator");
}
