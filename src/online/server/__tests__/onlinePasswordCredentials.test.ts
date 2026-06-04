import { describe, expect, it } from "vitest";
import {
  hashOnlineAccountPassword,
  isOnlineAccountPasswordCredentialHash,
  verifyOnlineAccountPassword,
} from "../onlinePasswordCredentials";

describe("onlinePasswordCredentials", () => {
  it("hashes account passwords with random salts and verifies only the original password", async () => {
    const first = await hashOnlineAccountPassword("correct-horse-battery-staple");
    const second = await hashOnlineAccountPassword("correct-horse-battery-staple");

    expect(isOnlineAccountPasswordCredentialHash(first)).toBe(true);
    expect(isOnlineAccountPasswordCredentialHash(second)).toBe(true);
    expect(first).not.toBe(second);
    await expect(verifyOnlineAccountPassword("correct-horse-battery-staple", first)).resolves.toBe(true);
    await expect(verifyOnlineAccountPassword("wrong-password", first)).resolves.toBe(false);
    await expect(verifyOnlineAccountPassword("correct-horse-battery-staple", "not-a-hash")).resolves.toBe(false);
  });
});
