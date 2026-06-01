import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadServerEnvironmentFile } from "../envFile";

const tempDir = path.join(process.cwd(), ".tmp-env-file-tests");

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeEnvFile(contents: string): string {
  mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, "castles.env");
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

describe("loadServerEnvironmentFile", () => {
  it("loads key-value pairs without shell evaluation", () => {
    const filePath = writeEnvFile(`
# comment
NODE_ENV=production
PUBLIC_BASE_URL=https://castles.example
DATABASE_URL=postgresql://castles:p%40%24%26%3B%23@localhost:5432/castles
BUILD_ID="20260601-010203"
GIT_COMMIT='0123456789abcdef0123456789abcdef01234567'
`);

    expect(loadServerEnvironmentFile(filePath)).toEqual({
      NODE_ENV: "production",
      PUBLIC_BASE_URL: "https://castles.example",
      DATABASE_URL: "postgresql://castles:p%40%24%26%3B%23@localhost:5432/castles",
      BUILD_ID: "20260601-010203",
      GIT_COMMIT: "0123456789abcdef0123456789abcdef01234567",
    });
  });

  it("rejects malformed environment lines", () => {
    const filePath = writeEnvFile("not valid\n");

    expect(() => loadServerEnvironmentFile(filePath)).toThrow(/line 1/);
  });
});
