import {
  readCachedProfileAvatar,
  rememberCachedProfileAvatar,
} from "../profileAvatarCache";

const TINY_AVATAR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("profileAvatarCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns cached profile avatars by normalized display name", () => {
    rememberCachedProfileAvatar("Liam Player", {
      schemaVersion: 1,
      imageDataUrl: TINY_AVATAR_DATA_URL,
    });

    expect(readCachedProfileAvatar("liam player")).toEqual({
      schemaVersion: 1,
      imageDataUrl: TINY_AVATAR_DATA_URL,
    });
  });

  it("ignores malformed cache payloads", () => {
    window.localStorage.setItem("castles-profile-avatar-cache-v1", JSON.stringify({
      liam: {
        displayName: "Liam",
        cachedAt: Date.now(),
        avatar: { schemaVersion: 1, imageDataUrl: "https://example.com/avatar.png" },
      },
    }));

    expect(readCachedProfileAvatar("Liam")).toBeNull();
  });

  it("rejects cached image types that the profile API would reject", () => {
    window.localStorage.setItem("castles-profile-avatar-cache-v1", JSON.stringify({
      liam: {
        displayName: "Liam",
        cachedAt: Date.now(),
        avatar: { schemaVersion: 1, imageDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" },
      },
    }));

    expect(readCachedProfileAvatar("Liam")).toBeNull();
  });

  it("ignores expired cache entries", () => {
    window.localStorage.setItem("castles-profile-avatar-cache-v1", JSON.stringify({
      liam: {
        displayName: "Liam",
        cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        avatar: { schemaVersion: 1, imageDataUrl: TINY_AVATAR_DATA_URL },
      },
    }));

    expect(readCachedProfileAvatar("Liam")).toBeNull();
  });
});
