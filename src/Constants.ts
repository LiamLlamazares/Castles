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
  Trebuchet = "Trebuchet",
  Eagle = "Eagle",
  Giant = "Giant",
  Assassin = "Assassin",
  Dragon = "Dragon",
  Monarch = "Monarch",
}
export enum AttackType {
  Melee = "Melee",
  Ranged = "Ranged",
  longRanged = "longRanged",
  Swordsman = "Swordsman",
}

export enum PieceStrength {
  Swordsman = 1,
  Archer = 1,
  Knight = 1,
  Trebuchet = 1,
  Eagle = 1,
  Giant = 2,
  Assassin = 1,
  Dragon = 3,
  Monarch = 3,
}

export type turnPhase = "Movement" | "Attack" | "Castles";
export type Color = "w" | "b";
export const startingTime = 20 * 60;
export const defendedPieceIsProtectedRanged = true; //if true, a defended piece is protected from ranged attacks
