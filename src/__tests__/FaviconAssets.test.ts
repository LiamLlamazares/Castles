import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyBoard, getStartingLayout } from "../ConstantImports";
import { getCastleOwnerClass, getHexVisualClass } from "../utils/HexRenderUtils";
import { renderEmptyBoardFaviconSvg } from "../../scripts/assets/render-empty-board-favicon";

function readText(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readBytes(path: string): Buffer {
  return readFileSync(resolve(process.cwd(), path));
}

function getIcoPngSizes(bytes: Buffer): number[] {
  expect(bytes.readUInt16LE(0)).toBe(0);
  expect(bytes.readUInt16LE(2)).toBe(1);

  const count = bytes.readUInt16LE(4);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const sizes: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = bytes.readUInt8(entryOffset) || 256;
    const height = bytes.readUInt8(entryOffset + 1) || 256;
    const bitCount = bytes.readUInt16LE(entryOffset + 6);
    const imageSize = bytes.readUInt32LE(entryOffset + 8);
    const imageOffset = bytes.readUInt32LE(entryOffset + 12);

    expect(height).toBe(width);
    expect(bitCount).toBe(32);
    expect(imageOffset + imageSize).toBeLessThanOrEqual(bytes.length);
    expect(bytes.subarray(imageOffset, imageOffset + pngSignature.length)).toEqual(pngSignature);
    sizes.push(width);
  }

  return sizes;
}

function getServiceWorkerCacheVersion(serviceWorker: string): number {
  const match = serviceWorker.match(/const CACHE_NAME = "castles-shell-v(\d+)";/);
  expect(match).not.toBeNull();
  return Number(match![1]);
}

describe("favicon assets", () => {
  it("uses the empty app-board favicon across html, manifest, and service worker assets", () => {
    const index = readText("index.html");
    const manifest = JSON.parse(readText("public/manifest.json")) as {
      icons: Array<{ src: string; type?: string; sizes?: string }>;
    };
    const serviceWorker = readText("public/service-worker.js");
    const faviconSvg = readText("public/favicon.svg");
    const faviconIco = readBytes("public/favicon.ico");
    const appIconSvg = readText("public/castles-icon.svg");
    const expectedSvg = renderEmptyBoardFaviconSvg();
    const appLayout = getStartingLayout(emptyBoard);
    const appViewBox = appLayout.calculateViewBox();
    const sampleHex = emptyBoard.hexes.find((hex) => emptyBoard.highGroundHexSet.has(hex.getKey()));
    const sampleCastle = emptyBoard.castles.find((castle) => castle.owner === "w");

    expect(sampleHex).toBeDefined();
    expect(sampleCastle).toBeDefined();
    const appPolygonPoints = appLayout.hexCornerString[sampleHex!.reflect().getKey(true)];
    const appPolygonClass = getHexVisualClass(sampleHex!, emptyBoard);
    const appCastlePoints = appLayout.hexCornerString[sampleCastle!.hex.reflect().getKey(true)];
    const appCastleClass = [
      getHexVisualClass(sampleCastle!.hex, emptyBoard),
      getCastleOwnerClass(sampleCastle!.hex, emptyBoard.castles),
    ].join(" ");

    expect(index).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(index).toContain('<link rel="alternate icon" href="/favicon.ico" />');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "favicon.svg", type: "image/svg+xml", sizes: "any" }),
        expect.objectContaining({ src: "favicon.ico", type: "image/x-icon", sizes: "64x64 32x32 24x24 16x16" }),
        expect.objectContaining({ src: "castles-icon.svg", type: "image/svg+xml", sizes: "any" }),
      ])
    );
    expect(getServiceWorkerCacheVersion(serviceWorker)).toBeGreaterThanOrEqual(6);
    expect(serviceWorker).toContain("./favicon.svg");
    expect(serviceWorker).toContain("./favicon.ico");
    expect(getIcoPngSizes(faviconIco).sort((a, b) => a - b)).toEqual([16, 24, 32, 64]);

    for (const svg of [faviconSvg, appIconSvg]) {
      expect(svg).toBe(expectedSvg);
      expect(svg.split("\n")[0]).toContain('width="512" height="512"');
      expect(svg.split("\n")[0]).toContain(`viewBox="${appViewBox}"`);
      expect(svg.split("\n")[0]).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(svg).toContain("<style>");
      expect(svg).toContain(`points="${appPolygonPoints}" class="${appPolygonClass}"`);
      expect(svg).toContain(`points="${appCastlePoints}" class="${appCastleClass}"`);
      expect(svg).toContain(".castle-owned-white");
      expect(svg).toContain(".castle-owned-black");
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
