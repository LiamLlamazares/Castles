import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

describe("Tutorial mobile layout CSS", () => {
  it("bounds lesson text height so the board remains visible on mobile", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toContain("grid-template-rows: minmax(0, 58dvh) minmax(0, 42dvh);");
    expect(css).toContain("max-height: 58dvh;");
    expect(css).toContain("overflow-y: auto;");
    expect(css).not.toContain("grid-template-rows: minmax(0, 58dvh) minmax(250px, 42dvh);");
    expect(css).not.toContain("min-height: 250px;");
  });

  it("keeps the desktop tooltip discovery hint away from shell controls", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    const hintRule = css.match(/\.tooltip-hint-banner\s*\{[^}]+}/)?.[0] ?? "";

    expect(hintRule).toContain("top: 16px;");
    expect(hintRule).toContain("bottom: auto;");
    expect(hintRule).toContain("left: 76px;");
    expect(hintRule).toContain("right: auto;");
    expect(hintRule).toContain("max-width: 320px;");
  });

  it("sizes the board container to its parent stage rather than a full viewport", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(testDir, "../Board/BoardContainer.tsx"), "utf8");

    expect(source).toContain("height: '100%'");
    expect(source).not.toContain("height: '100vh'");
  });

  it("does not retain old hidden sidebar compatibility selectors", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).not.toMatch(/\.sidebar\s*\{/);
    expect(css).not.toContain(".sidebar-section");
    expect(css).not.toContain(".sidebar-divider");
    expect(css).not.toContain(".control-buttons");
    expect(css).not.toContain(".game-button");
  });
});
