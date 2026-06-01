import { describe, expect, it } from "vitest";
import {
  hashOnlineToken,
  isOnlineTokenCredentialHash,
  verifyOnlineToken,
} from "../onlineTokenCredentials";

describe("online token credentials", () => {
  it("hashes raw online tokens into stable non-reversible credentials", () => {
    const first = hashOnlineToken("raw-white-token");
    const second = hashOnlineToken("raw-white-token");

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:/);
    expect(isOnlineTokenCredentialHash(first)).toBe(true);
    expect(isOnlineTokenCredentialHash("raw-white-token")).toBe(false);
    expect(isOnlineTokenCredentialHash("sha256:white-token-hash")).toBe(false);
    expect(first).not.toContain("raw-white-token");
    expect(verifyOnlineToken("raw-white-token", first)).toBe(true);
    expect(verifyOnlineToken("wrong-token", first)).toBe(false);
  });
});
