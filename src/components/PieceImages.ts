/**
 * Piece image mappings for the game UI.
 * Supports multiple piece themes (Chess, Castles, etc.)
 */
import { PieceType, Color, PieceTheme } from "../Constants";

// ========== CHESS THEME ==========
import wSwordsmanChess from "../Assets/Images/Chess/wSwordsman.svg";
import bSwordsmanChess from "../Assets/Images/Chess/bSwordsman.svg";
import wDragonChess from "../Assets/Images/Chess/wDragon.svg";
import bDragonChess from "../Assets/Images/Chess/bDragon.svg";
import wArcherChess from "../Assets/Images/Chess/wArcher.svg";
import bArcherChess from "../Assets/Images/Chess/bArcher.svg";
import wGiantChess from "../Assets/Images/Chess/wGiant.svg";
import bGiantChess from "../Assets/Images/Chess/bGiant.svg";
import wAssassinChess from "../Assets/Images/Chess/wAssassin.svg";
import bAssassinChess from "../Assets/Images/Chess/bAssassin.svg";
import wMonarchChess from "../Assets/Images/Chess/wMonarch.svg";
import bMonarchChess from "../Assets/Images/Chess/bMonarch.svg";
import wTrebuchetChess from "../Assets/Images/Chess/wTrebuchet.svg";
import bTrebuchetChess from "../Assets/Images/Chess/bTrebuchet.svg";
import wKnightChess from "../Assets/Images/Chess/wKnight.svg";
import bKnightChess from "../Assets/Images/Chess/bKnight.svg";
import wEagleChess from "../Assets/Images/Chess/wEagle.svg";
import bEagleChess from "../Assets/Images/Chess/bEagle.svg";
import wWolfChess from "../Assets/Images/Chess/wWolf.svg";
import bWolfChess from "../Assets/Images/Chess/bWolf.svg";
import wHealerChess from "../Assets/Images/Chess/wHealer.svg";
import bHealerChess from "../Assets/Images/Chess/bHealer.svg";
import wRangerChess from "../Assets/Images/Chess/wRanger.svg";
import bRangerChess from "../Assets/Images/Chess/bRanger.svg";
import wWizardChess from "../Assets/Images/Chess/wWizard.svg";
import bWizardChess from "../Assets/Images/Chess/bWizard.svg";
import wNecromancerChess from "../Assets/Images/Chess/wNecromancer.svg";
import bNecromancerChess from "../Assets/Images/Chess/bNecromancer.svg";
import wPhoenixChess from "../Assets/Images/Chess/wPhoenix.svg";
import bPhoenixChess from "../Assets/Images/Chess/bPhoenix.svg";

// ========== CASTLES THEME ==========
import wSwordsmanCastles from "../Assets/Images/Castles/wSwordsman.svg";
import bSwordsmanCastles from "../Assets/Images/Castles/bSwordsman.svg";
import wDragonCastles from "../Assets/Images/Castles/wDragon.svg";
import bDragonCastles from "../Assets/Images/Castles/bDragon.svg";
import wArcherCastles from "../Assets/Images/Castles/wArcher.svg";
import bArcherCastles from "../Assets/Images/Castles/bArcher.svg";
import wGiantCastles from "../Assets/Images/Castles/wGiant.svg";
import bGiantCastles from "../Assets/Images/Castles/bGiant.svg";
import wAssassinCastles from "../Assets/Images/Castles/wAssassin.svg";
import bAssassinCastles from "../Assets/Images/Castles/bAssassin.svg";
import wMonarchCastles from "../Assets/Images/Castles/wMonarch.svg";
import bMonarchCastles from "../Assets/Images/Castles/bMonarch.svg";
import wTrebuchetCastles from "../Assets/Images/Castles/wTrebuchet.svg";
import bTrebuchetCastles from "../Assets/Images/Castles/bTrebuchet.svg";
import wKnightCastles from "../Assets/Images/Castles/wKnight.svg";
import bKnightCastles from "../Assets/Images/Castles/bKnight.svg";
import wEagleCastles from "../Assets/Images/Castles/wEagle.svg";
import bEagleCastles from "../Assets/Images/Castles/bEagle.svg";
import wWolfCastles from "../Assets/Images/Castles/wWolf.svg";
import bWolfCastles from "../Assets/Images/Castles/bWolf.svg";
import wHealerCastles from "../Assets/Images/Castles/wHealer.svg";
import bHealerCastles from "../Assets/Images/Castles/bHealer.svg";
import wRangerCastles from "../Assets/Images/Castles/wRanger.svg";
import bRangerCastles from "../Assets/Images/Castles/bRanger.svg";
import wWizardCastles from "../Assets/Images/Castles/wWizard.svg";
import bWizardCastles from "../Assets/Images/Castles/bWizard.svg";
import wNecromancerCastles from "../Assets/Images/Castles/wNecromancer.svg";
import bNecromancerCastles from "../Assets/Images/Castles/bNecromancer.svg";
import wPhoenixCastles from "../Assets/Images/Castles/wPhoenix.svg";
import bPhoenixCastles from "../Assets/Images/Castles/bPhoenix.svg";

// ========== THEME IMAGE MAPS ==========
type PieceImageMap = Record<PieceType, string>;

const chessWhite: PieceImageMap = {
  [PieceType.Swordsman]: wSwordsmanChess,
  [PieceType.Dragon]: wDragonChess,
  [PieceType.Archer]: wArcherChess,
  [PieceType.Giant]: wGiantChess,
  [PieceType.Assassin]: wAssassinChess,
  [PieceType.Monarch]: wMonarchChess,
  [PieceType.Trebuchet]: wTrebuchetChess,
  [PieceType.Knight]: wKnightChess,
  [PieceType.Eagle]: wEagleChess,
  [PieceType.Wolf]: wWolfChess,
  [PieceType.Healer]: wHealerChess,
  [PieceType.Ranger]: wRangerChess,
  [PieceType.Wizard]: wWizardChess,
  [PieceType.Necromancer]: wNecromancerChess,
  [PieceType.Phoenix]: wPhoenixChess,
};

const chessBlack: PieceImageMap = {
  [PieceType.Swordsman]: bSwordsmanChess,
  [PieceType.Dragon]: bDragonChess,
  [PieceType.Archer]: bArcherChess,
  [PieceType.Giant]: bGiantChess,
  [PieceType.Assassin]: bAssassinChess,
  [PieceType.Monarch]: bMonarchChess,
  [PieceType.Trebuchet]: bTrebuchetChess,
  [PieceType.Knight]: bKnightChess,
  [PieceType.Eagle]: bEagleChess,
  [PieceType.Wolf]: bWolfChess,
  [PieceType.Healer]: bHealerChess,
  [PieceType.Ranger]: bRangerChess,
  [PieceType.Wizard]: bWizardChess,
  [PieceType.Necromancer]: bNecromancerChess,
  [PieceType.Phoenix]: bPhoenixChess,
};

const castlesWhite: PieceImageMap = {
  [PieceType.Swordsman]: wSwordsmanCastles,
  [PieceType.Dragon]: wDragonCastles,
  [PieceType.Archer]: wArcherCastles,
  [PieceType.Giant]: wGiantCastles,
  [PieceType.Assassin]: wAssassinCastles,
  [PieceType.Monarch]: wMonarchCastles,
  [PieceType.Trebuchet]: wTrebuchetCastles,
  [PieceType.Knight]: wKnightCastles,
  [PieceType.Eagle]: wEagleCastles,
  [PieceType.Wolf]: wWolfCastles,
  [PieceType.Healer]: wHealerCastles,
  [PieceType.Ranger]: wRangerCastles,
  [PieceType.Wizard]: wWizardCastles,
  [PieceType.Necromancer]: wNecromancerCastles,
  [PieceType.Phoenix]: wPhoenixCastles,
};

const castlesBlack: PieceImageMap = {
  [PieceType.Swordsman]: bSwordsmanCastles,
  [PieceType.Dragon]: bDragonCastles,
  [PieceType.Archer]: bArcherCastles,
  [PieceType.Giant]: bGiantCastles,
  [PieceType.Assassin]: bAssassinCastles,
  [PieceType.Monarch]: bMonarchCastles,
  [PieceType.Trebuchet]: bTrebuchetCastles,
  [PieceType.Knight]: bKnightCastles,
  [PieceType.Eagle]: bEagleCastles,
  [PieceType.Wolf]: bWolfCastles,
  [PieceType.Healer]: bHealerCastles,
  [PieceType.Ranger]: bRangerCastles,
  [PieceType.Wizard]: bWizardCastles,
  [PieceType.Necromancer]: bNecromancerCastles,
  [PieceType.Phoenix]: bPhoenixCastles,
};

const themeImages: Record<PieceTheme, { white: PieceImageMap; black: PieceImageMap }> = {
  Chess: { white: chessWhite, black: chessBlack },
  Castles: { white: castlesWhite, black: castlesBlack },
};

/** Default theme used when none specified */
export const DEFAULT_PIECE_THEME: PieceTheme = "Castles";

/**
 * Returns the appropriate image URL for a given piece type, color, and theme.
 * @param type - The piece type (Swordsman, Dragon, etc.)
 * @param color - The piece color ('w' or 'b')
 * @param theme - The piece theme (Chess, Castles, etc.). Defaults to DEFAULT_PIECE_THEME.
 */
export const getImageByPieceType = (
  type: PieceType,
  color: Color,
  theme: PieceTheme = DEFAULT_PIECE_THEME
): string => {
  const themeMap = themeImages[theme];
  return color === "w" ? themeMap.white[type] : themeMap.black[type];
};
