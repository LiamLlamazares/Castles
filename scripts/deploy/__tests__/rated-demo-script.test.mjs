import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/deploy/create-rated-demo-games.mjs", "utf8");

describe("rated demo script", () => {
  it("creates public rated games and records inspectable profile evidence", () => {
    expect(script).toContain('ratingMode: "rated"');
    expect(script).toContain('visibility: "public"');
    expect(script).toContain("/api/online/account/ratings/history");
    expect(script).toContain("/api/online/profiles/");
    expect(script).toContain("profileUrl");
    expect(script).toContain("artifacts");
    expect(script).toContain("rated-demo");
  });

  it("keeps account cleanup explicitly opt-in", () => {
    expect(script).toContain('CASTLES_RATED_DEMO_CLEANUP === "1"');
    expect(script).toContain("deleteAccount");
  });
});
