import type { OnlineServerLogEvent } from "./createOnlineHttpServer";

export function formatOnlineServerLogEvent(event: OnlineServerLogEvent): string {
  const entry: Record<string, string> = {
    source: "castles-online",
    event: event.event,
    status: event.status,
  };

  if (event.gameId) entry.gameId = event.gameId;
  if (event.role) entry.role = event.role;
  if (event.action) entry.action = event.action;
  if (event.reason) entry.reason = event.reason;

  return JSON.stringify(entry);
}
