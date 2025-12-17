# Future Ideas

## Drafting System

**Current State:** Players start with fixed pieces.

### Tiered Drafting (Recommended Approach)
Players draft pieces in tiers, choosing one option per tier:

| Tier | Options | Notes |
|------|---------|-------|
| 1 | **S**wordsman or **A**rcher | Basic infantry choice |
| 2 | **K**night or **E**agle | Mobility vs flying |
| 3 | **G**iant, **T**rebuchet, or **A**ssassin | Power tier |
| 4 | **D**ragon or **M**onarch | Offensive power vs VIP piece |

**Open Questions:**
- Simultaneous hidden drafting or turn-based?
- How many tiers before game starts?
- Placement zones (within 2 hexes of starting area?)

### Alternative: Point-Based Drafting
- Players start with a set number of points
- Spend points to draft pieces
- Place drafted pieces on the board

---

## Game Analysis & Storage

### PGN Export/Import ✅ (Implemented)
- Save/load games via PGN string
- Includes initial board state (Castle positions) and piece configuration in header

### History Navigation
- Use Left/Right arrow keys to cycle through move history

### Analysis Mode
- After game ends, enter "Analysis Mode"
- Cycle through moves with annotations
- Dedicated "Analyze" button at game end

---

## New Game Mode Ideas

### 1. Asymmetric Siege Mode
- **Setup:** One player defends a heavily fortified castle (fewer pieces, better position). The other player attacks with a larger army.
- **Win Condition:** Attacker must capture the "Throne" hex within N turns. Defender must survive.
- **Defender Countdown:** Defender receives reinforcements every N turns to balance the asymmetry. Example: 1 Swordsman every 3 turns, 1 Archer every 5 turns.

### 2. King of the Hill / Relic Control
- **Mechanic:** Central hexes or mobile "Relics" grant Victory Points (VP) at the start of each turn.
- **Win Condition:** First to X VP wins, discouraging turtling and forcing engagement.

### 3. Capture the Flag
- **Mechanic:** Pick up a flag from the enemy base and return it to yours.
- **Twist:** Carrying the flag reduces unit movement speed or prevents attacking.

## Map & Environment Features
- **Portals/Teleporters:** Linked hexes for instant travel across the map.
- **High Ground:** Hills/Mountains grant +1 Range or combat bonuses to units standing on them.
- **Destructible Terrain:** bridges that can be cut, or walls that can be breached.
- **Fog of War:** Map is hidden until units explore. Great for "imperfect information" strategies.

## Hybrid Mechanics (inspired by Dune: Imperium)
### Deck-Building & Action Economy
*Instead of purely abstract moves (Chess), the game could use a deck of cards to drive actions.*
- **The Deck:** Players start with a basic deck (e.g., "Move 1", "Attack", "Recruit").
- **The Hand:** Draw 5 cards per turn. You can only strictly perform actions allowed by your cards.
- **The Market:** Use resources (earned from board control) to buy powerful cards (e.g., "Cavalry Charge: Move 3 spaces through enemies", "Fireball", "Reinforce").

### Worker Placement via "Board Control"
*Integrating board dominance with resource management.*
- **Resource Hexes:** Specific hexes (Mines, Libraries, Shrines) act as "Worker Placement" spots.
- **Choice:** Occupying a Mine gives you Gold (to buy cards/units) but leaves your unit vulnerable or out of position for combat.
- **Conflict:** You don't just "place" a worker; you have to *march* a unit there and defend it.

### Victory Points (VP) Race
*Moving away from straightforward "Elimination".*
- **Goal:** First to 10 VP wins.
- **Sources of VP:**
    - Winning a battle (1 VP).
    - Controlling a Castle at end of round (2 VP).
    - Secret Objectives (e.g., "Control all 3 river crossings").
- **Effect:** Creates multiple valid strategies (Military dominance vs. Economic dominance/Board Control).

---

## Training Camps (New Concept)

**Location:** Near the river, in opponent's territory (contested zone).

**Mechanic:**
- If a piece occupies an enemy Training Camp hex, it can be **upgraded** to the next tier
- Upgrade follows the same tier progression as castle recruitment:
  - Swordsman → Archer → Knight → Eagle → Giant → Trebuchet → Assassin → Dragon → Monarch
- Upgrading consumes the Castle Phase action

**Strategic Value:**
- Creates natural conflict zones near the river
- Rewards aggressive territorial play
- Doesn't flood the board with new pieces—improves existing ones
- Thematically fits "captured enemy training grounds"

---

## Terrain Features

### Forests
- Block ranged attacks (line of sight)
- Units inside have +1 "stealth" (hidden from 3+ hexes away in Fog of War mode)
- Ground units may enter; flying units may land

### Ruins
- Defensive bonus: attackers require +1 strength to capture units inside
- Limited capacity (1 unit per ruin hex)

### High Ground / Mountains ✅ (Partially implemented)
- +1 attack range for ranged units (Archers: 3, Trebuchets: 4)
- Flying units ignore terrain bonus

### Design Note
Start with **sparse terrain** (2-3 features per map) to avoid "every hex is special" complexity. Can expand to terrain-themed maps later.

---

## Asymmetric Factions (Pre-Game Army Selection)

Instead of symmetric armies, players choose a **faction** that modifies their starting army:

| Faction | Modifications |
|---------|---------------|
| **Standard Army** | Default setup (current implementation) |
| **River Folk** | Replace 2 Swordsmen with 2 Eagles; Eagles can land on river hexes |
| **Lord Arken's Host** | Replace 2 Archers with 2 Knights; Assassin has +1 movement |
| **Siege Masters** | Replace 2 Giants with 3 Trebuchets; Trebuchets don't count as heavy |
| **The Horde** | +4 Swordsmen; no Assassin |

**Implementation Notes:**
- Faction selection happens before drafting (if drafting is enabled)
- Can be combined with tiered drafting for maximum customization
- Requires balance testing

---

## Special Fantasy Pieces (New)

### Proposed Pieces

| Piece | Movement | Attack | Strength | Special Ability |
|-------|----------|--------|----------|-----------------|
| **Necromancer** | 1 hex | Melee | 1 | **Raise Dead**: Once per game, resurrect a captured friendly piece adjacent to Necromancer |
| **Wizard** | 1 hex | Ranged (2) | 1 | **Fireball** (AoE attack) OR **Teleport** (move any friendly piece within 3 hexes) |
| **Ranger** | 2 hex | Long-Ranged (3) | 1 | **Snipe**: Ignores defender's supporting pieces (kill protected units) |
| **Wolf** | 3 hex | Melee | 1 | **Pack Tactics**: +1 strength per adjacent friendly Wolf |
| **Healer** | 1 hex | None | 1 | **Heal/Shield**: Remove damage OR grant +1 strength to adjacent piece |
| **Phoenix** | Flying (3) | Melee | 2 | **Rebirth**: Respawns at nearest castle after 2 turns when captured |

### Earning Mechanics (How to Unlock Special Pieces)

#### Option A: Shrine Hexes (Recommended First Implementation)
Special map locations that enable recruitment:
- **Wolf Den** (near river) → Wolves
- **Wizard Tower** (center) → Wizards
- **Ancient Graveyard** (corner) → Necromancer
- **Ranger Outpost** (high ground) → Rangers

Control the shrine to recruit its piece during Castle Phase.

#### Option B: Achievement Unlocks
| Achievement | Unlocked Piece |
|-------------|----------------|
| Capture 3 pieces in one turn | Ranger |
| Control 2 enemy castles | Necromancer |
| Move a piece across the river | Wolf |
| Survive 10 turns without losing | Healer |

#### Option C: Resource Economy (Deck-Builder Style)
- Gain resources from castle control and captures
- Spend resources to recruit from a "market"
- Adds strategic depth but increases complexity

#### Recommended Approach: Hybrid
1. **Shrines** as primary unlock (control shrine → recruit any special piece)
2. **Achievements** as secondary path (complete achievement → recruit specific piece without shrine)

---

## AI Development

### Phase 1: Heuristic AI
- Piece-value evaluation (similar to chess engines)
- Position scoring (control of center, castle proximity)
- Basic threat detection
- Good enough for testing and casual play

### Phase 2: Neural Network AI (Long-term)
- AlphaZero-style self-play training
- State representation for hex boards
- Handle multi-phase turn structure
- Requires significant compute resources

---

## Online Features (Requires Server)

- **Matchmaking:** Ranked and casual queues
- **ELO Rating System:** Separate ratings for each game mode
- **Ranked Seasons:** Monthly resets with rewards
- **Leaderboards:** Global and friends-only
- **Spectator Mode:** Watch live games
- **Replay Sharing:** Share PGN links