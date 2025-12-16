import { Hex } from "./Hex";

/**
 * Helper to check if a target hex is valid for attack.
 */
const isValidAttack = (targetHex: Hex, attackableHexSet: Set<string>): boolean => {
  return attackableHexSet.has(targetHex.getKey());
};

/**
 * Melee attacks: all adjacent hexes (radius 1).
 */
export const meleeAttacks = (hex: Hex, attackableHexSet: Set<string>): Hex[] => {
  const attacks: Hex[] = [];
  const potentialAttacks = hex.cubeRing(1);

  for (const target of potentialAttacks) {
    if (isValidAttack(target, attackableHexSet)) {
      attacks.push(target);
    }
  }

  return attacks;
};

/**
 * Ranged attacks: ring at distance 2 (+3 from high ground).
 */
export const rangedAttacks = (
  hex: Hex,
  attackableHexSet: Set<string>,
  highGroundHexSet?: Set<string>
): Hex[] => {
  const attacks: Hex[] = [];
  let potentialAttacks = hex.cubeRing(2);
  if (highGroundHexSet && highGroundHexSet.has(hex.getKey())) {
    potentialAttacks.push(...hex.cubeRing(3));
  }

  for (const newHex of potentialAttacks) {
    if (isValidAttack(newHex, attackableHexSet)) {
      attacks.push(newHex);
    }
  }
  return attacks;
};

/**
 * Long-ranged attacks: ring at distance 3 (+4 from high ground).
 */
export const longRangedAttacks = (
  hex: Hex,
  attackableHexSet: Set<string>,
  highGroundHexSet?: Set<string>
): Hex[] => {
  const attacks: Hex[] = [];
  let potentialAttacks = hex.cubeRing(3);
  if (highGroundHexSet && highGroundHexSet.has(hex.getKey())) {
    potentialAttacks.push(...hex.cubeRing(4));
  }

  for (const newHex of potentialAttacks) {
    if (isValidAttack(newHex, attackableHexSet)) {
      attacks.push(newHex);
    }
  }
  return attacks;
};

/**
 * Swordsman attacks: diagonal-forward only.
 */
export const swordsmanAttacks = (
  hex: Hex,
  attackableHexSet: Set<string>,
  color: string // 'w' or 'b'
): Hex[] => {
  const attacks: Hex[] = [];
  const { q, r, s } = hex;
  const direction = color === "b" ? -1 : 1;

  const attackDirections = [
    { q: direction, r: -direction, s: 0 },
    { q: -direction, r: 0, s: direction },
  ];

  for (const dir of attackDirections) {
    const newHex = new Hex(q + dir.q, r + dir.r, s + dir.s);
    if (isValidAttack(newHex, attackableHexSet)) {
      attacks.push(newHex);
    }
  }
  return attacks;
};
