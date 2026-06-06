import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyBoard, getStartingLayout } from "../../src/ConstantImports";
import { Hex } from "../../src/Classes/Entities/Hex";
import { getCastleOwnerClass, getHexVisualClass } from "../../src/utils/HexRenderUtils";

const BOARD_CSS_PATH = "src/css/Board.css";
const BOARD_VARIABLES = [
  "backgroundColor",
  "river-color",
  "high-ground-dark",
  "high-ground-mid",
  "high-ground-light",
  "castle-neutral",
  "castle-white",
  "castle-black",
] as const;
const BOARD_STYLE_SELECTORS = [
  ".hexagon",
  ".hexagon-dark",
  ".hexagon-mid",
  ".hexagon-light",
  ".hexagon-river",
  ".hexagon-dark.hexagon-high-ground",
  ".hexagon-mid.hexagon-high-ground",
  ".hexagon-light.hexagon-high-ground",
  ".hexagon-white-castle",
  ".hexagon-black-castle",
  ".castle-owned-white",
  ".castle-owned-black",
] as const;

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

function sortLikeBoardRenderer(hexes: Hex[]): Hex[] {
  const castleSet = new Set(emptyBoard.castles.map((castle) => castle.hex.getKey()));

  return [...hexes].sort((a, b) => {
    const priority = (hex: Hex): number => (castleSet.has(hex.getKey()) ? 2 : 0);
    return priority(a) - priority(b);
  });
}

function getAppBoardPolygonPoints(layout: ReturnType<typeof getStartingLayout>, hex: Hex): string {
  const points = layout.hexCornerString[hex.reflect().getKey(true)];
  if (!points) {
    throw new Error(`Could not find app board polygon points for ${hex.getKey()}`);
  }
  return points;
}

function getAppBoardPolygonClass(hex: Hex): string {
  const castleOwnerClass = emptyBoard.castles.some((castle) => castle.hex.equals(hex))
    ? getCastleOwnerClass(hex, emptyBoard.castles)
    : "";
  return [getHexVisualClass(hex, emptyBoard), castleOwnerClass].filter(Boolean).join(" ");
}

function renderCssBlock(css: string, selector: string): string {
  const declarations = getRuleBody(css, selector)
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [`    ${selector} {`, ...declarations.map((line) => `      ${line}`), "    }"].join("\n");
}

function renderEmbeddedBoardStyle(css: string): string {
  const variableLines = BOARD_VARIABLES.map((name) => {
    const value = normalizeColor(css, getCssVariable(css, name));
    return `      --${name}: ${value};`;
  });
  const ruleBlocks = BOARD_STYLE_SELECTORS.map((selector) => renderCssBlock(css, selector));

  return [
    "  <style>",
    "    svg {",
    ...variableLines,
    "      background-color: var(--backgroundColor);",
    "    }",
    "    .favicon-background {",
    "      fill: var(--backgroundColor);",
    "    }",
    ...ruleBlocks,
    "  </style>",
  ].join("\n");
}

export function renderEmptyBoardFaviconSvg(): string {
  selectorCache.clear();
  variableCache.clear();

  const css = readBoardCss();
  const layout = getStartingLayout(emptyBoard);
  const viewBox = layout.calculateViewBox();
  const [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = viewBox.split(/\s+/);

  const polygons = sortLikeBoardRenderer(emptyBoard.hexes).map((hex) => {
    const points = getAppBoardPolygonPoints(layout, hex);
    const className = getAppBoardPolygonClass(hex);
    const filter = className.includes("hexagon-high-ground")
      ? ' filter="url(#shadow)"'
      : "";
    return `  <polygon points="${points}" class="${className}"${filter}/>`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Empty Castles hex board">`,
    renderEmbeddedBoardStyle(css),
    `  <rect class="favicon-background" x="${viewBoxX}" y="${viewBoxY}" width="${viewBoxWidth}" height="${viewBoxHeight}"/>`,
    "  <defs>",
    '    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">',
    '      <feGaussianBlur in="SourceAlpha" stdDeviation="5"/>',
    '      <feOffset dx="-2" dy="-2" result="offsetblur"/>',
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
