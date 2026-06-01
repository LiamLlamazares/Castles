import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

describe("Tutorial mobile layout CSS", () => {
  it("bounds lesson text height so the board remains visible on mobile", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toContain("grid-template-rows: minmax(0, 50dvh) minmax(0, 50dvh);");
    expect(css).toContain("max-height: 50dvh;");
    expect(css).toContain("overflow-y: auto;");
    expect(css).not.toContain("grid-template-rows: minmax(0, 58dvh) minmax(250px, 42dvh);");
    expect(css).not.toContain("min-height: 250px;");
  });

  it("compresses tutorial chrome on short mobile screens", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toContain("@media (max-width: 760px) and (max-height: 720px)");
    expect(css).toContain("grid-template-rows: minmax(0, 46dvh) minmax(0, 54dvh);");
    expect(css).toContain("max-height: 46dvh;");
    expect(css).toContain("height: 54dvh;");
    expect(css).toContain(".tutorial-lesson-header");
    expect(css).toContain(".tutorial-control-strip");
    expect(css).toContain(".tutorial-quick-nav");
    expect(css).toContain(".tutorial-description");
    expect(css).toContain(".tutorial-callout");
  });

  it("keeps shared mobile shell spacing aligned inside online state pages", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toMatch(/\.online-state-panel\s*\{[^}]*--app-shell-mobile-padding-x:\s*0px;[^}]*--app-shell-mobile-padding-y:\s*0px;/s);
    expect(css).toContain("@media (max-width: 760px) and (max-height: 720px)");
    expect(css).toContain("--app-shell-mobile-padding-x: 16px;");
  });

  it("keeps the modal drawer above app-level install prompts", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    const openContainerRule = css.match(/\.hamburger-container\.open\s*\{[^}]+}/)?.[0] ?? "";
    const drawerRule = css.match(/\.hamburger-menu\s*\{[^}]+}/)?.[0] ?? "";
    const backdropRule = css.match(/\.menu-backdrop\s*\{[^}]+}/)?.[0] ?? "";

    expect(openContainerRule).toContain("z-index: 4000;");
    expect(drawerRule).toContain("z-index: 4002;");
    expect(backdropRule).toContain("z-index: 4001;");
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
