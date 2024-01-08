//Size of board
export const NSquaresc = 8;
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
export type turnPhase = 'Movement' | 'Attack' | 'Castles';
export type Color = "w" | "b";



export{}