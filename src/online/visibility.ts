export type OnlineGameVisibility = "private" | "unlisted" | "public";
export type OnlinePlayerSettableGameVisibility = Extract<
  OnlineGameVisibility,
  "unlisted" | "public"
>;

export const ONLINE_GAME_VISIBILITIES = new Set<OnlineGameVisibility>([
  "private",
  "unlisted",
  "public",
]);

export const ONLINE_PLAYER_SETTABLE_GAME_VISIBILITIES =
  new Set<OnlinePlayerSettableGameVisibility>(["unlisted", "public"]);

export function isOnlineGameVisibility(value: unknown): value is OnlineGameVisibility {
  return typeof value === "string" && ONLINE_GAME_VISIBILITIES.has(value as OnlineGameVisibility);
}

export function isOnlinePlayerSettableGameVisibility(
  value: unknown
): value is OnlinePlayerSettableGameVisibility {
  return (
    typeof value === "string" &&
    ONLINE_PLAYER_SETTABLE_GAME_VISIBILITIES.has(value as OnlinePlayerSettableGameVisibility)
  );
}
