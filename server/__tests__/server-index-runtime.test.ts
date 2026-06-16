import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readServerIndex(): string {
  return readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
}

describe("server runtime coordinator wiring", () => {
  it("passes the configured runtime coordinator into the production server entrypoint", () => {
    const source = readServerIndex();

    expect(source).toContain("createConfiguredRuntimeCoordinator");
    expect(source).toMatch(/runtimeCoordinator\s*=\s*createConfiguredRuntimeCoordinator\(config\)/);
    expect(source).toMatch(/createOnlineHttpServer\(\{[\s\S]*runtimeCoordinator,/);
  });
});
