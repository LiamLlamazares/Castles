import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Browser, chromium } from "playwright";
import { renderEmptyBoardFaviconSvg } from "./render-empty-board-favicon";

const PUBLIC_DIR = resolve(process.cwd(), "public");
const SVG_TARGETS = ["favicon.svg", "castles-icon.svg"];
const ICO_TARGET = "favicon.ico";
const ICO_SIZES = [16, 24, 32, 64];

function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

function createIco(pngImages: Array<{ size: number; bytes: Buffer }>): Buffer {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const directorySize = headerSize + directoryEntrySize * pngImages.length;
  const imageBytes = pngImages.reduce((total, image) => total + image.bytes.length, 0);
  const ico = Buffer.alloc(directorySize + imageBytes);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(pngImages.length, 4);

  let imageOffset = directorySize;
  pngImages.forEach((image, index) => {
    const entryOffset = headerSize + directoryEntrySize * index;
    ico.writeUInt8(image.size >= 256 ? 0 : image.size, entryOffset);
    ico.writeUInt8(image.size >= 256 ? 0 : image.size, entryOffset + 1);
    ico.writeUInt8(0, entryOffset + 2);
    ico.writeUInt8(0, entryOffset + 3);
    ico.writeUInt16LE(1, entryOffset + 4);
    ico.writeUInt16LE(32, entryOffset + 6);
    ico.writeUInt32LE(image.bytes.length, entryOffset + 8);
    ico.writeUInt32LE(imageOffset, entryOffset + 12);
    image.bytes.copy(ico, imageOffset);
    imageOffset += image.bytes.length;
  });

  return ico;
}

async function renderPng(browser: Browser, svg: string, size: number): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden"><img alt="" src="${dataUrl}" width="${size}" height="${size}"></body></html>`
  );
  const image = page.locator("img");
  await image.waitFor({ state: "visible" });
  const png = await image.screenshot({ type: "png", omitBackground: false });
  await page.close();
  return png;
}

async function main(): Promise<void> {
  const svg = renderEmptyBoardFaviconSvg();

  for (const target of SVG_TARGETS) {
    writeText(resolve(PUBLIC_DIR, target), svg);
  }

  const browser = await chromium.launch();
  const pngImages = [];
  try {
    for (const size of ICO_SIZES) {
      pngImages.push({ size, bytes: await renderPng(browser, svg, size) });
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(PUBLIC_DIR, ICO_TARGET), createIco(pngImages));

  console.log(`Generated ${SVG_TARGETS.join(", ")} and ${ICO_TARGET} from the app empty board.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
