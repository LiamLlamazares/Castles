import rotateIcon from "../Assets/Images/Board/rotate.svg";
import shieldIcon from "../Assets/Images/Board/shield.svg";
import candleIcon from "../Assets/Images/misc/candle.svg";
import castleIcon from "../Assets/Images/misc/wcastle.svg";
import crownIcon from "../Assets/Images/misc/crown.svg";
import exportScrollIcon from "../Assets/Images/misc/export-scroll.svg";
import flagIcon from "../Assets/Images/misc/flag.svg";
import footprintIcon from "../Assets/Images/misc/footprint.svg";
import hexTilesIcon from "../Assets/Images/misc/hex-tiles.svg";
import importScrollIcon from "../Assets/Images/misc/import-scroll.svg";
import moonIcon from "../Assets/Images/misc/moon.svg";
import pawnIcon from "../Assets/Images/misc/pawn.svg";
import scrollIcon from "../Assets/Images/misc/scroll.svg";
import scrollsIcon from "../Assets/Images/misc/scroll2.svg";
import sunIcon from "../Assets/Images/misc/sun.svg";
import swordsIcon from "../Assets/Images/misc/swords-crossed.svg";

export const APP_ICON_ASSETS = {
  play: flagIcon,
  tutorial: candleIcon,
  online: castleIcon,
  people: pawnIcon,
  profile: crownIcon,
  library: scrollsIcon,
  tools: shieldIcon,
  rules: scrollIcon,
  rotate: rotateIcon,
  boardDisplay: hexTilesIcon,
  import: importScrollIcon,
  export: exportScrollIcon,
  day: sunIcon,
  night: moonIcon,
  analysis: swordsIcon,
  editPosition: shieldIcon,
  returnToGame: footprintIcon,
} as const;

export type AppIconName = keyof typeof APP_ICON_ASSETS;

export const APP_DESTINATION_ICONS = {
  play: APP_ICON_ASSETS.play,
  learn: APP_ICON_ASSETS.tutorial,
  online: APP_ICON_ASSETS.online,
  people: APP_ICON_ASSETS.people,
  profile: APP_ICON_ASSETS.profile,
  library: APP_ICON_ASSETS.library,
  tools: APP_ICON_ASSETS.tools,
} as const;
