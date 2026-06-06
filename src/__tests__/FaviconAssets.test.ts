import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyBoard } from "../ConstantImports";
import { renderEmptyBoardFaviconSvg } from "../../scripts/assets/render-empty-board-favicon";

function readText(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("favicon assets", () => {
  it("uses the empty app-board favicon across html, manifest, and service worker assets", () => {
    const index = readText("index.html");
    const manifest = JSON.parse(readText("public/manifest.json")) as {
      icons: Array<{ src: string; type?: string; sizes?: string }>;
    };
    const serviceWorker = readText("public/service-worker.js");
    const faviconSvg = readText("public/favicon.svg");
    const appIconSvg = readText("public/castles-icon.svg");
    const expectedSvg = renderEmptyBoardFaviconSvg();

    expect(index).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(index).toContain('<link rel="alternate icon" href="/favicon.ico" />');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "favicon.svg", type: "image/svg+xml", sizes: "any" }),
        expect.objectContaining({ src: "castles-icon.svg", type: "image/svg+xml", sizes: "any" }),
      ])
    );
    expect(serviceWorker).toContain("./favicon.svg");

    for (const svg of [faviconSvg, appIconSvg]) {
      expect(svg).toBe(expectedSvg);
      expect(svg.split("\n")[0]).toContain('width="512" height="512"');
      expect(svg).toContain("rgb(209,139,71)");
      expect(svg).toContain("rgb(232,171,111)");
      expect(svg).toContain("rgb(255,206,158)");
      expect(svg).toContain("rgb(56,175,205)");
      expect(svg).toContain("rgb(139,69,19)");
      expect(svg).toContain("#50fa7b");
      expect(svg).toContain("#a29bfe");
      expect(svg).toContain("#aaa");
      expect(svg.match(/<polygon /g)?.length ?? 0).toBe(emptyBoard.hexes.length);
      expect(svg).not.toContain("<image");
    }
  });
});
