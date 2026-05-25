import {
  AbilityType,
  AttackType,
  PHOENIX_RESPAWN_TURNS,
  PieceType,
  PROMOTABLE_TYPES,
  SanctuaryConfig,
  SANCTUARY_EVOLUTION_COOLDOWN,
  SanctuaryType,
} from "../Constants";
import { AbilityTypeConfig } from "../Classes/Config/AbilityConfig";
import { getPieceConfig } from "../Classes/Config/PieceTypeConfig";

export interface RuleText {
  title: string;
  text: string;
}

export interface PieceReferenceRow {
  type: PieceType;
  name: string;
  strength: number;
  attackType: AttackType;
  description: string;
  category: "standard" | "special";
}

export interface SanctuaryReferenceRow {
  type: SanctuaryType;
  name: string;
  summons: PieceType;
  tier: number;
  requirement: string;
}

export interface AbilityReferenceRow {
  type: AbilityType;
  name: string;
  range: string;
  timing: string;
  description: string;
}

const promotablePieceNames = PROMOTABLE_TYPES.join(", ");

export const setupRules: RuleText[] = [
  {
    title: "Coordinates",
    text: "The board uses cube coordinates q, r, s with q + r + s = 0. White begins on the southern side where r is positive; Black begins on the northern side where r is negative.",
  },
  {
    title: "Default board",
    text: "The standard game uses six castles, a patterned river on the center r = 0 line, high ground near the center, and sanctuaries chosen by the setup. Edited games and imported PGNs can override the setup.",
  },
  {
    title: "Enemy side",
    text: "A White piece is across the river on hexes with r < 0. A Black piece is across the river on hexes with r > 0. This matters for Swordsman strength and sanctuary cooldown acceleration.",
  },
];

export const winningRules: RuleText[] = [
  {
    title: "Monarch survival",
    text: "A side loses when it has no Monarch pieces remaining. Recruited Monarchs count, so capturing one Monarch is not enough if that side still has another Monarch.",
  },
  {
    title: "Castle control",
    text: "Control every castle on the board to win immediately.",
  },
  {
    title: "Victory points",
    text: "If experimental VP mode is enabled, castle control can also score VP at round boundaries. The optional-mode section gives the exact scoring rule.",
  },
];

export const phaseRules: RuleText[] = [
  {
    title: "Movement slots",
    text: "Each player turn has two Movement slots. A piece can move at most once during that player's turn.",
  },
  {
    title: "Attack slots",
    text: "Each player turn has two Attack slots. A piece can attack or use an attack-phase ability at most once during that player's turn.",
  },
  {
    title: "Castles phase",
    text: "After Movement and Attack, the active player has one Castles phase for recruitment and sanctuary pledging.",
  },
  {
    title: "Pass and auto-pass",
    text: "Passing skips the current slot or phase. If no legal action exists in a phase, the game may advance automatically.",
  },
  {
    title: "Turn reset",
    text: "At the start of each player turn, all pieces regain move and attack availability, temporary damage is cleared from all pieces, and all castles become available again.",
  },
];

export const terrainRules: RuleText[] = [
  {
    title: "River",
    text: "Ground pieces cannot enter river hexes or pass through them. Flying pieces can cross river hexes, but cannot land on them.",
  },
  {
    title: "Castle",
    text: "A castle has an original side and a current controller. Enemy-controlled castles block movement and can be captured during the Attack phase.",
  },
  {
    title: "High ground",
    text: "A ranged or long-ranged attacker standing on high ground gains one additional legal attack distance.",
  },
  {
    title: "Sanctuary",
    text: "A ready sanctuary can grant a special unit when your piece occupies it during your Castles phase and the pledge requirements are met.",
  },
];

export const movementRules: RuleText[] = [
  {
    title: "Blocked hexes",
    text: "Occupied hexes, river hexes, and enemy-controlled castles are blocked movement destinations. Friendly-controlled castles may be entered.",
  },
  {
    title: "Line movement",
    text: "Knights, Giants, and Assassins move along their listed straight lines until the board edge or the first blocked hex. They cannot turn during that move or jump over blockers.",
  },
  {
    title: "Path movement",
    text: "Wolves and Rangers move a limited number of hexes and may turn between steps. Every step must pass through an unblocked hex.",
  },
  {
    title: "Flying pieces",
    text: "Flying pieces ignore blockers between start and destination, but their destination still must be a legal unblocked board hex.",
  },
];

export const combatRules: RuleText[] = [
  {
    title: "Strength and damage",
    text: "An attack deals damage equal to the attacker's effective combat strength. A target is captured when its accumulated damage reaches its effective combat strength.",
  },
  {
    title: "Combat bonuses",
    text: "Effective combat strength includes Swordsman river strength, Wolf pack bonuses, and adjacent friendly Healer aura bonuses. These bonuses affect both damage dealt and damage required to capture.",
  },
  {
    title: "Temporary damage",
    text: "Damage accumulates only during the current player's turn and is cleared at the start of each player turn.",
  },
  {
    title: "Combined attacks",
    text: "Multiple attackers can combine damage on one target during the same player turn. An attack is legal only if it can still help capture that target this turn.",
  },
  {
    title: "Capture movement",
    text: "Melee and Swordsman attackers move onto the defender's hex when they capture. Ranged and long-ranged attackers stay where they are.",
  },
  {
    title: "Defended targets",
    text: "A target is defended against normal ranged and long-ranged attacks only when it is adjacent to a friendly melee or Swordsman-type defender. Defended status does not stop melee attacks.",
  },
  {
    title: "Assassin exception",
    text: "An Assassin that legally attacks a Monarch captures it regardless of the Monarch's strength or defended status.",
  },
];

export const castleRules: RuleText[] = [
  {
    title: "Persistent control",
    text: "A castle remains controlled by the side that captured it until the opponent captures it back, even if no piece remains on the castle.",
  },
  {
    title: "Capturing an empty castle",
    text: "An enemy-controlled empty castle can be attacked during the Attack phase. The attacker moves onto the castle and control changes to the attacker's side.",
  },
  {
    title: "Capturing a piece on a castle",
    text: "If you capture an enemy piece standing on a castle, control of that castle changes to your side.",
  },
  {
    title: "Recruitment source",
    text: "You may recruit only from enemy starting castles you currently control. Your own starting castles never recruit for you, even if they were lost and retaken.",
  },
  {
    title: "Recruitment squares",
    text: "Recruits appear on empty adjacent hexes that are on the board and are not river or castle hexes.",
  },
];

export const recruitmentCycle: PieceType[] = [
  PieceType.Swordsman,
  PieceType.Archer,
  PieceType.Knight,
  PieceType.Eagle,
  PieceType.Giant,
  PieceType.Trebuchet,
  PieceType.Assassin,
  PieceType.Dragon,
  PieceType.Monarch,
];

export const recruitmentDetailRules: RuleText[] = [
  {
    title: "Eligibility",
    text: "A castle can recruit during your Castles phase only if it is an enemy starting castle, you currently control it, it has not recruited this phase, and it has a valid adjacent spawn hex.",
  },
  {
    title: "One use",
    text: "Each eligible castle can recruit once during your Castles phase.",
  },
  {
    title: "Castle counter",
    text: "Each castle has its own recruitment counter. The counter advances only when that castle recruits and does not reset when ownership changes.",
  },
  {
    title: "Cycle",
    text: `The current cycle is ${recruitmentCycle.join(" -> ")}. After Monarch, the cycle repeats from Swordsman.`,
  },
  {
    title: "Spawn space",
    text: "The recruit must appear on an empty adjacent non-river, non-castle board hex.",
  },
];

export const promotionRules: RuleText[] = [
  {
    title: "Trigger",
    text: "A Swordsman may promote immediately after a legal Movement action ends on that Swordsman's opponent-side promotion edge.",
  },
  {
    title: "Promotion edges",
    text: "With coordinates shown, White promotes on the two northern outer edges, r = -N or s = N. Black promotes on the two southern outer edges, r = N or s = -N. River hexes are excluded.",
  },
  {
    title: "Choices",
    text: `Promotion choices are ${promotablePieceNames}. Monarchs and sanctuary pieces are not promotion choices.`,
  },
  {
    title: "Free action",
    text: "Promotion replaces the Swordsman on the same hex and does not advance the turn. The promoted piece keeps the Swordsman's remaining move/attack availability for that turn.",
  },
];

export const combatExampleRules: RuleText[] = [
  {
    title: "Strength 1 target",
    text: "One effective strength-1 attacker can capture a strength-1 target if the attack is legal.",
  },
  {
    title: "Strength 2 target",
    text: "A strength-2 target needs either one effective strength-2 attacker or two effective strength-1 attackers during the same player turn.",
  },
  {
    title: "Illegal low-value attack",
    text: "If your remaining legal attackers cannot ever add enough damage to capture the target this turn, the attack is illegal.",
  },
  {
    title: "Defended target",
    text: "A defended piece blocks normal ranged and long-ranged attacks, but it can still be attacked in melee or by legal special abilities.",
  },
];

export const rangeDetailRules: RuleText[] = [
  {
    title: "Line of sight",
    text: "Normal ranged and long-ranged attacks use hex distance only. Intervening pieces, rivers, castles, and high ground do not block the shot.",
  },
  {
    title: "Archer",
    text: "Attacks exactly distance 2. From high ground, it can attack distance 2 or 3. Adjacent targets are too close.",
  },
  {
    title: "Trebuchet",
    text: "Attacks exactly distance 3. From high ground, it can attack distance 3 or 4. Closer targets are too close.",
  },
  {
    title: "Ranger",
    text: "Moves up to 2 walking hexes. Attacks exactly distance 3, or distance 3 or 4 from high ground.",
  },
  {
    title: "Wizard",
    text: "Its normal attack follows the Ranged rule: distance 2, or distance 2 or 3 from high ground. Fireball is a separate ability with range 1 to 2.",
  },
  {
    title: "Special abilities",
    text: "High ground extends normal Ranged and Long-Ranged attacks only. It does not extend Fireball, Teleport, or Raise Dead.",
  },
];

export const sanctuaryRules: RuleText[] = [
  {
    title: "Pledging",
    text: "In your Castles phase, occupy a ready sanctuary with your piece, meet the sanctuary's strength requirement, and choose an adjacent valid spawn hex to gain its special unit.",
  },
  {
    title: "Spawn hex",
    text: "The special unit appears on an adjacent empty board hex that is not a river or castle hex.",
  },
  {
    title: "Strength requirement",
    text: "Pledge strength is the occupying piece plus adjacent friendly pieces. It uses piece strength for the pledge; combat-only Wolf pack and Healer aura bonuses do not add to the pledge requirement.",
  },
  {
    title: "Availability",
    text: "Tier 1 sanctuaries can start available. Higher-tier sanctuaries stay locked until the configured unlock turn unless setup rules say otherwise.",
  },
  {
    title: "Cooldown",
    text: "A sanctuary on cooldown cannot be pledged. Its cooldown ticks at the start of the turn for the board side the sanctuary belongs to, not necessarily the side that last pledged it.",
  },
];

export const sanctuaryDetailRules: RuleText[] = [
  {
    title: "Tier 1",
    text: "Requires one friendly piece occupying the sanctuary.",
  },
  {
    title: "Tier 2",
    text: "Requires total pledge strength 3 on or beside the sanctuary.",
  },
  {
    title: "Tier 3",
    text: "Requires total pledge strength 4 and sacrifices the occupying piece.",
  },
  {
    title: "Sacrifice",
    text: "A sacrifice removes the occupying piece from play. It is not a capture, does not enter the graveyard, does not grant souls, and does not trigger Phoenix rebirth.",
  },
  {
    title: "Evolution",
    text: `After a pledge, the sanctuary evolves to the next available higher-tier sanctuary from the pool and enters cooldown. If no higher tier remains, it keeps its current type and recharges. Default cooldown is ${SANCTUARY_EVOLUTION_COOLDOWN} ticks.`,
  },
  {
    title: "Cooldown badge",
    text: "A number on the sanctuary icon shows how many cooldown ticks remain before it can be pledged again.",
  },
  {
    title: "Cooldown acceleration",
    text: "When the sanctuary's board side starts a turn, cooldown drops by 1 plus that side's non-Swordsman pieces across the river. Swordsmen do not accelerate cooldown.",
  },
];

export const abilityReferenceRows: AbilityReferenceRow[] = Object.entries(AbilityTypeConfig).map(
  ([type, config]) => ({
    type: type as AbilityType,
    name: config.name,
    range:
      config.minRange === config.range
        ? `exactly ${config.range}`
        : `${config.minRange}-${config.range}`,
    timing: "Attack phase",
    description: config.description,
  })
);

export const specialAbilityRules: RuleText[] = [
  {
    title: "Ability timing",
    text: "Fireball, Teleport, and Raise Dead are Attack-phase actions. Using one consumes that piece's attack action for the turn.",
  },
  {
    title: "Wizard limit",
    text: "Each Wizard can use exactly one Wizard ability in the game: either Fireball or Teleport. After using either one, that Wizard cannot use another Wizard ability.",
  },
  {
    title: "Fireball",
    text: "Targets a non-self hex at range 1 to 2. It deals 1 damage to every piece on the target hex and adjacent hexes, friendly or enemy.",
  },
  {
    title: "Teleport",
    text: "Moves the Wizard to an unoccupied board hex within range 1 to 3. Teleport does not follow normal movement paths.",
  },
  {
    title: "Raise Dead",
    text: "A Necromancer spends 1 soul to revive the latest friendly piece in the graveyard onto an adjacent unoccupied hex. The revived piece cannot move or attack immediately.",
  },
  {
    title: "Souls",
    text: "A Necromancer starts with 1 soul and gains 1 soul when it captures a piece with an attack.",
  },
  {
    title: "Revived pieces",
    text: "A revived piece that dies again is exiled instead of returning to the graveyard.",
  },
  {
    title: "Phoenix rebirth",
    text: `When a Phoenix dies, it schedules rebirth after ${PHOENIX_RESPAWN_TURNS} full rounds at a friendly-controlled castle or adjacent open hex. If all spawn spots are blocked, it retries on later rounds up to the engine retry limit.`,
  },
];

export const commonBlockerRules: RuleText[] = [
  {
    title: "Cannot move",
    text: "The piece may have already moved, the phase may be wrong, or the path/destination may be blocked by a piece, river, or enemy-controlled castle.",
  },
  {
    title: "Cannot attack",
    text: "The phase may be wrong, the attacker may have already attacked, the target may be out of range, the target may be defended against ranged attacks, or the target may be impossible to capture this turn.",
  },
  {
    title: "Cannot recruit",
    text: "The castle may be your own starting castle, not controlled by you, already used this phase, or lacking an adjacent empty non-river, non-castle spawn hex.",
  },
  {
    title: "Cannot promote",
    text: "Only Swordsmen promote, only after movement, and only on valid opponent-edge non-river hexes.",
  },
  {
    title: "Cannot pledge",
    text: "The sanctuary may be locked, on cooldown, not occupied by your piece, missing required pledge strength, or lacking an adjacent valid spawn hex.",
  },
];

export const optionalModeRules: RuleText[] = [
  {
    title: "Victory points",
    text: "Experimental VP mode adds a point race for castle control. At round boundaries, controlling 4 castles scores +1 VP and controlling 5 castles scores +3 VP. Controlling all castles still wins immediately. First to 10 VP wins.",
  },
];

export const standardPieceOrder: PieceType[] = [
  PieceType.Swordsman,
  PieceType.Archer,
  PieceType.Knight,
  PieceType.Trebuchet,
  PieceType.Eagle,
  PieceType.Giant,
  PieceType.Assassin,
  PieceType.Dragon,
  PieceType.Monarch,
];

export const specialPieceOrder: PieceType[] = [
  PieceType.Wolf,
  PieceType.Healer,
  PieceType.Ranger,
  PieceType.Wizard,
  PieceType.Necromancer,
  PieceType.Phoenix,
];

const createPieceReferenceRow = (
  type: PieceType,
  category: "standard" | "special"
): PieceReferenceRow => {
  const config = getPieceConfig(type);
  return {
    type,
    name: type,
    strength: config.strength,
    attackType: config.attackType,
    description: config.description,
    category,
  };
};

export const standardPieceReferenceRows: PieceReferenceRow[] = standardPieceOrder.map((type) =>
  createPieceReferenceRow(type, "standard")
);

export const specialPieceReferenceRows: PieceReferenceRow[] = specialPieceOrder.map((type) =>
  createPieceReferenceRow(type, "special")
);

export const allPieceReferenceRows: PieceReferenceRow[] = [
  ...standardPieceReferenceRows,
  ...specialPieceReferenceRows,
];

export const sanctuaryReferenceRows: SanctuaryReferenceRow[] = Object.entries(SanctuaryConfig).map(
  ([type, config]) => ({
    type: type as SanctuaryType,
    name: config.displayName,
    summons: config.pieceType,
    tier: config.tier,
    requirement: config.requiresSacrifice
      ? `${config.requiredStrength} pledge strength and a sacrifice`
      : `${config.requiredStrength} pledge strength`,
  })
);
