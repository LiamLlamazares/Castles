import { describe, expect, it } from "vitest";
import {
  canAccessOnlineGameSummary,
  canListOnlineGameSummary,
  canSpectateOnlineGameSummary,
  roleForOnlineSeat,
} from "../accessPolicy";
import type { OnlineGameVisibility } from "../readModel";

function summary(visibility: OnlineGameVisibility) {
  return { visibility };
}

describe("online access policy", () => {
  it("maps player seats to public access roles", () => {
    expect(roleForOnlineSeat("w")).toBe("white");
    expect(roleForOnlineSeat("b")).toBe("black");
  });

  it("lists only public game summaries", () => {
    expect(canListOnlineGameSummary(summary("public"))).toBe(true);
    expect(canListOnlineGameSummary(summary("unlisted"))).toBe(false);
    expect(canListOnlineGameSummary(summary("private"))).toBe(false);
  });

  it("allows player and staff roles for every visibility", () => {
    for (const visibility of ["public", "unlisted", "private"] as const) {
      expect(canAccessOnlineGameSummary(summary(visibility), "white")).toBe(true);
      expect(canAccessOnlineGameSummary(summary(visibility), "black")).toBe(true);
      expect(canAccessOnlineGameSummary(summary(visibility), "moderator")).toBe(true);
      expect(canAccessOnlineGameSummary(summary(visibility), "admin")).toBe(true);
    }
  });

  it("allows spectator access to public and unlisted games only", () => {
    expect(canAccessOnlineGameSummary(summary("public"), "spectator")).toBe(true);
    expect(canAccessOnlineGameSummary(summary("unlisted"), "spectator")).toBe(true);
    expect(canAccessOnlineGameSummary(summary("private"), "spectator")).toBe(false);
    expect(canSpectateOnlineGameSummary(summary("public"))).toBe(true);
    expect(canSpectateOnlineGameSummary(summary("unlisted"))).toBe(true);
    expect(canSpectateOnlineGameSummary(summary("private"))).toBe(false);
  });

  it("allows the challenged role for private games only after separate identity binding", () => {
    expect(canAccessOnlineGameSummary(summary("private"), "challenged")).toBe(true);
  });
});
