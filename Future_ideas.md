# Future Ideas

> **Priority Legend:** 🔴 High (In Development) | 🟡 Medium | 🟢 Low (Long-term)

---

## 🔴 Sanctuary System ✅ (Implemented)

Special map locations where players can pledge powerful fantasy creatures to their cause.
See `rules.md` for full documentation.

---

## 🔴 Drafting System

**Status:** Designed, needs balancing work

### Design Considerations
- Self-balancing through point costs per piece
- Placement constraints (where pieces can start)
- Adds pre-game decision delay (tradeoff with immediate play)

### Tiered Drafting
| Tier | Options | Draft Points |
|------|---------|--------------|
| 1 | Swordsman, Archer | 1, 2 |
| 2 | Knight, Eagle | 3, 4 |
| 3 | Giant, Trebuchet, Assassin | 5, 5, 7 |
| 4 | Dragon, Monarch | 10, - |

---

## 🟡 Game Analysis & Storage

### PGN Export/Import ✅ (Implemented)
### History Navigation ✅ (Implemented)
- Arrow keys cycle through moves

### Analysis Mode (Partial)
- Post-game review with annotations

---

## 🟡 Terrain Features

| Terrain | Effect |
|---------|--------|
| **Forests** | Block ranged attacks, +1 stealth |
| **Ruins** | +1 defensive strength |
| **High Ground** ✅ | +1 range for ranged units |

---

## 🟡 Asymmetric Factions

| Faction | Modifications |
|---------|---------------|
| Standard Army | Default |
| River Folk | 2 Eagles replace Swordsmen; Eagles cross river |
| Lord Arken's Host | 2 Knights replace Archers; Assassin +1 move |
| Siege Masters | 3 Trebuchets replace 2 Giants; non-heavy |
| The Horde | +4 Swordsmen; no Assassin |

---

## 🟡 New Game Modes

### Victory Points Mode ✅ (Implemented)
- Score VP each round based on castle control
- 4 castles = +1 VP, 5 castles = +3 VP
- First to 10 VP wins

### Breakthrough Mode (Testing)
- First melee kill each turn grants +1 movement to attacker
- Rewards aggressive play

### Asymmetric Siege Mode
- Defender: Fortified position, reinforcements every N turns
- Attacker: Larger army, must capture Throne within time limit

### King of the Hill
- Central hexes grant VP each turn
- First to X VP wins

---

## 🟡 Economy/Market System (Inspired by Dune Imperium)

**Design Challenge**: Avoid "win more" mechanics where leading players get more pieces.

### Brandon Sanderson Principle
> "Weaknesses are always more interesting than strengths"

**Design Ideas**:
- Spending gold should have opportunity cost (forgo something else)
- Stronger pieces have movement/placement restrictions
- Gold earned through risky plays (deep territory, sacrifices) not just winning

### Current Thinking
- Gold from sanctuaries (risky to pledge) not kills
- Or: Gold from pieces that survive in enemy territory
- Creates: Risk/reward tension rather than snowball

---

## 🟢 Legacy/Veteran System

Pieces gain experience and abilities through gameplay.

### Option A: Session-Based Veterans
Within a single game:
- **1 kill** → "Blooded" - +1 movement OR attack range
- **3 kills** → "Veteran" - Choose: +1 strength OR special ability
- **5 kills** → "Legend" - Named, unique power

**Complexity**: Requires per-piece kill tracking UI

### Option B: Equipment Drops
Certain hexes or events grant buffs:
- Capture a **Shrine** → Next piece gains buff
- Kill **Assassin** → Killer gains instant-kill ability
- Simpler to implement than per-piece tracking

---

## 🟢 Fog of War Mode (Requires Online)

Hidden information game mode:
- Only see your pieces + enemies within 3 hexes
- Scouts (Eagles, Wolves) become essential
- Assassin becomes terrifying

**Status**: Needs multiplayer first (local hotseat reveals positions)

---

## 🟢 AI Development

### Phase 1: Heuristic AI
- Piece-value evaluation
- Position and threat scoring

### Phase 2: Neural Network (Long-term)
- AlphaZero-style self-play

---

## 🟢 Online Features (Requires Server)

- Matchmaking & ELO ratings
- Ranked seasons
- Spectator mode
- Replay sharing
- Fog of War mode

---

## 🟢 Hybrid Mechanics (Spin-off Ideas)

### Deck-Building
- Cards drive actions (Move, Attack, Recruit)
- Market for powerful cards

### Worker Placement
- Resource hexes (Mines, Shrines)
- Occupy for resources, defend position

---

## Recently Implemented (Archive)

- ✅ Phase counter showing remaining moves/attacks
- ✅ Quick Start modal for first-time users
- ✅ Defended piece badges (shield icons)
- ✅ Friendly castle passability (pieces can move through owned castles)
- ✅ VP for castle control system