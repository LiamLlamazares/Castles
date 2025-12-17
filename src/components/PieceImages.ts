/**
 * Piece image mappings for the game UI.
 * Extracted from Game.tsx for cleaner separation of concerns.
 */
import { PieceType, Color } from "../Constants";

import wSwordsmanImage from "../Assets/Images/Chess/wSwordsman.svg";
import bSwordsmanImage from "../Assets/Images/Chess/bSwordsman.svg";
import wDragonImage from "../Assets/Images/Chess/wDragon.svg";
import bDragonImage from "../Assets/Images/Chess/bDragon.svg";
import wArcherImage from "../Assets/Images/Chess/wArcher.svg";
import bArcherImage from "../Assets/Images/Chess/bArcher.svg";
import wGiantImage from "../Assets/Images/Chess/wGiant.svg";
import bGiantImage from "../Assets/Images/Chess/bGiant.svg";
import wAssassinImage from "../Assets/Images/Chess/wAssassin.svg";
import bAssassinImage from "../Assets/Images/Chess/bAssassin.svg";
import wMonarchImage from "../Assets/Images/Chess/wMonarch.svg";
import bMonarchImage from "../Assets/Images/Chess/bMonarch.svg";
import wTrebuchetImage from "../Assets/Images/Chess/wTrebuchet.svg";
import bTrebuchetImage from "../Assets/Images/Chess/bTrebuchet.svg";
import wKnightImage from "../Assets/Images/Chess/wKnight.svg";
import bKnightImage from "../Assets/Images/Chess/bKnight.svg";
import wEagleImage from "../Assets/Images/Chess/wEagle.svg";
import bEagleImage from "../Assets/Images/Chess/bEagle.svg";
import wWolfImage from "../Assets/Images/Chess/wWolf.svg";
import bWolfImage from "../Assets/Images/Chess/bWolf.svg";
import wHealerImage from "../Assets/Images/Chess/wHealer.svg";
import bHealerImage from "../Assets/Images/Chess/bHealer.svg";
import wRangerImage from "../Assets/Images/Chess/wRanger.svg";
import bRangerImage from "../Assets/Images/Chess/bRanger.svg";
import wWizardImage from "../Assets/Images/Chess/wWizard.svg";
import bWizardImage from "../Assets/Images/Chess/bWizard.svg";
import wNecromancerImage from "../Assets/Images/Chess/wNecromancer.svg";
import bNecromancerImage from "../Assets/Images/Chess/bNecromancer.svg";
import wPhoenixImage from "../Assets/Images/Chess/wPhoenix.svg";
import bPhoenixImage from "../Assets/Images/Chess/bPhoenix.svg";

/** Image mapping for white pieces */
const whitePieceImages: Record<PieceType, string> = {
  [PieceType.Swordsman]: wSwordsmanImage,
  [PieceType.Dragon]: wDragonImage,
  [PieceType.Archer]: wArcherImage,
  [PieceType.Giant]: wGiantImage,
  [PieceType.Assassin]: wAssassinImage,
  [PieceType.Monarch]: wMonarchImage,
  [PieceType.Trebuchet]: wTrebuchetImage,
  [PieceType.Knight]: wKnightImage,
  [PieceType.Eagle]: wEagleImage,
  [PieceType.Wolf]: wWolfImage,
  [PieceType.Healer]: wHealerImage,
  [PieceType.Ranger]: wRangerImage,
  [PieceType.Wizard]: wWizardImage,
  [PieceType.Necromancer]: wNecromancerImage,
  [PieceType.Phoenix]: wPhoenixImage,
};

/** Image mapping for black pieces */
const blackPieceImages: Record<PieceType, string> = {
  [PieceType.Swordsman]: bSwordsmanImage,
  [PieceType.Dragon]: bDragonImage,
  [PieceType.Archer]: bArcherImage,
  [PieceType.Giant]: bGiantImage,
  [PieceType.Assassin]: bAssassinImage,
  [PieceType.Monarch]: bMonarchImage,
  [PieceType.Trebuchet]: bTrebuchetImage,
  [PieceType.Knight]: bKnightImage,
  [PieceType.Eagle]: bEagleImage,
  [PieceType.Wolf]: bWolfImage,
  [PieceType.Healer]: bHealerImage,
  [PieceType.Ranger]: bRangerImage,
  [PieceType.Wizard]: bWizardImage,
  [PieceType.Necromancer]: bNecromancerImage,
  [PieceType.Phoenix]: bPhoenixImage,
};

/**
 * Returns the appropriate image URL for a given piece type and color.
 */
export const getImageByPieceType = (type: PieceType, color: Color): string => {
  return color === "w" ? whitePieceImages[type] : blackPieceImages[type];
};
