import { describe, expect, it } from "vitest";
import { MemoryOnlineAccountStore } from "../OnlineAccountStore";
import { hashOnlineAccountPassword } from "../onlinePasswordCredentials";
import { hashOnlineToken } from "../onlineTokenCredentials";

const TINY_AVATAR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

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

  it("creates and reuses sessions for Google external logins without enabling password sign-in", async () => {
    const store = new MemoryOnlineAccountStore();

    const first = await store.createSessionWithExternalLogin({
      provider: "google",
      providerSubject: "google-subject-123",
      accountId: "account_google",
      sessionId: "account_session_google_first",
      displayNameCandidates: ["Liam", "Google Player"],
      tokenHash: hashOnlineToken("google-token-one"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    expect(first).toMatchObject({
      sessionId: "account_session_google_first",
      account: {
        accountId: "account_google",
        displayName: "Liam",
      },
    });

    const second = await store.createSessionWithExternalLogin({
      provider: "google",
      providerSubject: "google-subject-123",
      accountId: "account_unused",
      sessionId: "account_session_google_second",
      displayNameCandidates: ["Different Name"],
      tokenHash: hashOnlineToken("google-token-two"),
      createdAt: "2026-06-03T12:05:00.000Z",
    });

    expect(second).toMatchObject({
      sessionId: "account_session_google_second",
      account: {
        accountId: "account_google",
        displayName: "Liam",
      },
    });
    await expect(
      store.createSessionWithPassword({
        sessionId: "account_session_password",
        displayName: "Liam",
        password: "correct-horse-battery-staple",
        tokenHash: hashOnlineToken("password-token"),
        createdAt: "2026-06-03T12:06:00.000Z",
      })
    ).resolves.toBeNull();
    await expect(store.resolveSessionToken("google-token-one", "2026-06-03T12:07:00.000Z")).resolves.toMatchObject({
      sessionId: "account_session_google_first",
    });
    await expect(store.resolveSessionToken("google-token-two", "2026-06-03T12:08:00.000Z")).resolves.toMatchObject({
      sessionId: "account_session_google_second",
    });
  });

  it("updates built-in avatar settings on public profiles", async () => {
    const store = new MemoryOnlineAccountStore();
    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "Liam",
      passwordHash: await hashOnlineAccountPassword("correct-horse-battery-staple"),
      tokenHash: hashOnlineToken("liam-token"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    await expect(store.getProfileForDisplayName("account_liam", "Liam")).resolves.toMatchObject({
      displayName: "Liam",
      avatar: { schemaVersion: 1, preset: "monarch", color: "green" },
    });

    await expect(
      store.updateProfileSettings(
        "account_liam",
        { avatar: { schemaVersion: 1, preset: "dragon", color: "violet" } },
        "2026-06-03T12:05:00.000Z"
      )
    ).resolves.toMatchObject({
      displayName: "Liam",
      avatar: { schemaVersion: 1, preset: "dragon", color: "violet" },
      relationship: { self: true },
    });
    await expect(store.getProfileForDisplayName(null, "Liam")).resolves.toMatchObject({
      displayName: "Liam",
      avatar: { schemaVersion: 1, preset: "dragon", color: "violet" },
      relationship: { self: false },
    });
    await expect(
      store.updateProfileSettings(
        "account_liam",
        { avatar: { schemaVersion: 1, imageDataUrl: TINY_AVATAR_DATA_URL } },
        "2026-06-03T12:06:00.000Z"
      )
    ).resolves.toMatchObject({
      displayName: "Liam",
      avatar: { schemaVersion: 1, imageDataUrl: TINY_AVATAR_DATA_URL },
      relationship: { self: true },
    });
    await expect(store.getProfileForDisplayName(null, "Liam")).resolves.toMatchObject({
      displayName: "Liam",
      avatar: { schemaVersion: 1, imageDataUrl: TINY_AVATAR_DATA_URL },
      relationship: { self: false },
    });
  });
});
