import { describe, expect, it } from "vitest";
import { MemoryOnlineAccountStore } from "../OnlineAccountStore";
import { hashOnlineAccountPassword } from "../onlinePasswordCredentials";
import { hashOnlineToken } from "../onlineTokenCredentials";

describe("MemoryOnlineAccountStore", () => {
  it("creates second-device sessions only after password verification", async () => {
    const store = new MemoryOnlineAccountStore();
    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_first",
      displayName: "Liam",
      passwordHash: await hashOnlineAccountPassword("correct-horse-battery-staple"),
      tokenHash: hashOnlineToken("first-token"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    await expect(
      store.createSessionWithPassword({
        sessionId: "account_session_wrong",
        displayName: "liam",
        password: "wrong-password",
        tokenHash: hashOnlineToken("wrong-token"),
        createdAt: "2026-06-03T12:01:00.000Z",
      })
    ).resolves.toBeNull();

    await expect(
      store.createSessionWithPassword({
        sessionId: "account_session_second",
        displayName: "liam",
        password: "correct-horse-battery-staple",
        tokenHash: hashOnlineToken("second-token"),
        createdAt: "2026-06-03T12:02:00.000Z",
      })
    ).resolves.toMatchObject({
      sessionId: "account_session_second",
      account: {
        accountId: "account_liam",
        displayName: "Liam",
      },
    });
    await expect(store.resolveSessionToken("first-token", "2026-06-03T12:03:00.000Z")).resolves.toMatchObject({
      sessionId: "account_session_first",
    });
    await expect(store.resolveSessionToken("second-token", "2026-06-03T12:04:00.000Z")).resolves.toMatchObject({
      sessionId: "account_session_second",
    });
  });
});
