export const ONLINE_PROTOCOL_VERSION = 1 as const;

export type OnlineProtocolVersion = typeof ONLINE_PROTOCOL_VERSION;

export function isSupportedOnlineProtocolVersion(
  value: unknown
): value is OnlineProtocolVersion {
  return value === ONLINE_PROTOCOL_VERSION;
}
