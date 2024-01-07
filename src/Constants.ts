//Size of board
export const NSquaresc = 5;
export const HEX_SIZE_FACTORc = 4;
export const X_OFFSETc = 100;
export const layoutTypec = "flat";
export const colorsc = ["w", "b"];
export enum PieceType {
    Swordsman = "Swordsman",
    Archer = "Archer",
    Knight = "Knight",
    Eagle = "Eagle",
    Giant = "Giant",
    Assassin = "Assassin",
    Dragon = "Dragon",
    Monarch = "Monarch",
    Trebuchet = "Trebuchet",
    

  }

const IMAGE_FOLDER = 'fantasyd';

export const imagePaths = {
  [PieceType.Swordsman]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wSwordsman.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bSwordsman.svg`,
  },
  [PieceType.Archer]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wArcher.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bArcher.svg`,
  },
  [PieceType.Knight]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wKnight.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bKnight.svg`,
  },
  [PieceType.Eagle]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wEagle.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bEagle.svg`,
  },
  [PieceType.Giant]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wGiant.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bGiant.svg`,
  },
  [PieceType.Assassin]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wAssassin.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bAssassin.svg`,
  },
  [PieceType.Dragon]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wDragon.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bDragon.svg`,
  },
  [PieceType.Monarch]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wMonarch.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bMonarch.svg`,
  },
  [PieceType.Trebuchet]: {
    white: `../Assets/Images/${IMAGE_FOLDER}/wTrebuchet.svg`,
    black: `../Assets/Images/${IMAGE_FOLDER}/bTrebuchet.svg`,
  },
};



export{}