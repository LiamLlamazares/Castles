import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyBoard, getStartingLayout } from "../../src/ConstantImports";
import { Hex } from "../../src/Classes/Entities/Hex";
import { getHexVisualClass } from "../../src/utils/HexRenderUtils";

const ICON_SIZE = 512;
const BOARD_CSS_PATH = "src/css/Board.css";

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface FaviconGeometry {
  scale: number;
  offsetX: number;
  offsetY: number;
  viewBox: ViewBox;
}

const selectorCache = new Map<string, string>();
const variableCache = new Map<string, string>();

function readBoardCss(): string {
  return readFileSync(resolve(process.cwd(), BOARD_CSS_PATH), "utf8");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRuleBody(css: string, selector: string): string {
  const cached = selectorCache.get(selector);
  if (cached !== undefined) return cached;

  const match = css.match(new RegExp(`${escapeRegex(selector)}\\s*\\{([^}]*)\\}`, "s"));
  if (!match) {
    throw new Error(`Could not find ${selector} in ${BOARD_CSS_PATH}`);
  }

  selectorCache.set(selector, match[1]);
  return match[1];
}

function getDeclaration(css: string, selector: string, property: string): string {
  const body = getRuleBody(css, selector);
  const match = body.match(new RegExp(`${escapeRegex(property)}\\s*:\\s*([^;]+);`, "i"));
  if (!match) {
    throw new Error(`Could not find ${property} for ${selector} in ${BOARD_CSS_PATH}`);
  }
  return match[1].trim();
}

function getCssVariable(css: string, name: string): string {
  const cached = variableCache.get(name);
  if (cached !== undefined) return cached;

  const match = css.match(new RegExp(`--${escapeRegex(name)}\\s*:\\s*([^;]+);`, "i"));
  if (!match) {
    throw new Error(`Could not find --${name} in ${BOARD_CSS_PATH}`);
  }

  variableCache.set(name, match[1].trim());
  return match[1].trim();
}

function normalizeColor(css: string, value: string): string {
  const trimmed = value.trim();
  const variableMatch = trimmed.match(/^var\(--([^)]+)\)$/);
  if (variableMatch) {
    return normalizeColor(css, getCssVariable(css, variableMatch[1]));
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((part) => part.trim());
    const [red, green, blue, alpha] = parts;
    if (!alpha || alpha === "1") {
      return `rgb(${red},${green},${blue})`;
    }
    return `rgba(${red},${green},${blue},${alpha})`;
  }

  return trimmed.toLowerCase();
}

function getFill(css: string, selector: string): string {
  return normalizeColor(css, getDeclaration(css, selector, "fill"));
}

function getStroke(css: string, selector: string): string {
  return normalizeColor(css, getDeclaration(css, selector, "stroke"));
}

function getStrokeWidth(css: string, selector: string): number {
  return Number(getDeclaration(css, selector, "stroke-width"));
}

function parseViewBox(viewBox: string): ViewBox {
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number);
  if ([minX, minY, width, height].some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid board viewBox: ${viewBox}`);
  }
  return { minX, minY, width, height };
}

function getFaviconGeometry(): FaviconGeometry {
  const layout = getStartingLayout(emptyBoard);
  const viewBox = parseViewBox(layout.calculateViewBox());
  const scale = ICON_SIZE / Math.max(viewBox.width, viewBox.height);
  return {
    scale,
    offsetX: (ICON_SIZE - viewBox.width * scale) / 2,
    offsetY: (ICON_SIZE - viewBox.height * scale) / 2,
    viewBox,
  };
}

function formatNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function scalePoint(point: string, geometry: FaviconGeometry): string {
  const [rawX, rawY] = point.split(",").map(Number);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    throw new Error(`Invalid polygon point: ${point}`);
  }
  const x = (rawX - geometry.viewBox.minX) * geometry.scale + geometry.offsetX;
  const y = (rawY - geometry.viewBox.minY) * geometry.scale + geometry.offsetY;
  return `${formatNumber(x)},${formatNumber(y)}`;
}

function getHexFill(css: string, hex: Hex): string {
  const visualClass = getHexVisualClass(hex, emptyBoard);

  if (visualClass.includes("hexagon-river")) return getFill(css, ".hexagon-river");
  if (visualClass.includes("hexagon-white-castle")) return getFill(css, ".hexagon-white-castle");
  if (visualClass.includes("hexagon-black-castle")) return getFill(css, ".hexagon-black-castle");

  const baseClass = visualClass.match(/hexagon-(dark|mid|light)/)?.[0];
  if (!baseClass) return getFill(css, ".hexagon");

  if (visualClass.includes("hexagon-high-ground")) {
    return getFill(css, `.${baseClass}.hexagon-high-ground`);
  }

  return getFill(css, `.${baseClass}`);
}

function sortLikeBoardRenderer(hexes: Hex[]): Hex[] {
  return [...hexes].sort((a, b) => {
    const priority = (hex: Hex): number => (emptyBoard.castleHexSet.has(hex.getKey()) ? 2 : 0);
    return priority(a) - priority(b);
  });
}

export function renderEmptyBoardFaviconSvg(): string {
  selectorCache.clear();
  variableCache.clear();

  const css = readBoardCss();
  const geometry = getFaviconGeometry();
  const layout = getStartingLayout(emptyBoard);
  const stroke = getStroke(css, ".hexagon-dark");
  const strokeWidth = formatNumber(getStrokeWidth(css, ".hexagon-dark") * geometry.scale);
  const background = normalizeColor(css, getCssVariable(css, "backgroundColor"));
  const shadowBlur = formatNumber(5 * geometry.scale);
  const shadowOffset = formatNumber(-2 * geometry.scale);

  const polygons = sortLikeBoardRenderer(emptyBoard.hexes).map((hex) => {
    const points = layout.hexCornerString[hex.getKey()]
      .split(/\s+/)
      .map((point) => scalePoint(point, geometry))
      .join(" ");
    const fill = getHexFill(css, hex);
    const filter = getHexVisualClass(hex, emptyBoard).includes("hexagon-high-ground")
      ? ' filter="url(#shadow)"'
      : "";
    return `  <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${filter}/>`;
  });

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Empty Castles hex board">',
    `  <rect width="512" height="512" fill="${background}"/>`,
    "  <defs>",
    '    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">',
    `      <feGaussianBlur in="SourceAlpha" stdDeviation="${shadowBlur}"/>`,
    `      <feOffset dx="${shadowOffset}" dy="${shadowOffset}" result="offsetblur"/>`,
    '      <feFlood flood-color="rgba(0,0,0,0.5)"/>',
    '      <feComposite in2="offsetblur" operator="in"/>',
    "      <feMerge>",
    "        <feMergeNode/>",
    '        <feMergeNode in="SourceGraphic"/>',
    "      </feMerge>",
    "    </filter>",
    "  </defs>",
    ...polygons,
    "</svg>",
    "",
  ].join("\n");
}
