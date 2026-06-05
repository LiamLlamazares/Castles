import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
      expect(svg).toContain("rgb(209,139,71)");
      expect(svg).toContain("rgb(232,171,111)");
      expect(svg).toContain("rgb(255,206,158)");
      expect(svg).toContain("#aaa");
      expect(svg.match(/<polygon /g)?.length ?? 0).toBeGreaterThanOrEqual(7);
      expect(svg).not.toContain("castle");
    }
  });
});
