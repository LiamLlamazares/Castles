import { createHash, timingSafeEqual } from "node:crypto";

const TOKEN_HASH_PREFIX = "sha256:";
const TOKEN_CREDENTIAL_HASH_PATTERN = /^sha256:[A-Za-z0-9_-]{43}$/;

export function isOnlineTokenCredentialHash(credential: string): boolean {
  return TOKEN_CREDENTIAL_HASH_PATTERN.test(credential);
}

export function hashOnlineToken(token: string): string {
  return `${TOKEN_HASH_PREFIX}${createHash("sha256").update(token, "utf8").digest("base64url")}`;
}

export function verifyOnlineToken(token: string, credential: string): boolean {
  if (!isOnlineTokenCredentialHash(credential)) return false;

  const expected = Buffer.from(hashOnlineToken(token));
  const actual = Buffer.from(credential);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
