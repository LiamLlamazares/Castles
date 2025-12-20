# Future Ideas

> **Priority Legend:** 🔴 High (In Development) | 🟡 Medium | 🟢 Low (Long-term)

---

## 🔴 Sanctuary System (In Development)

Special map locations where players can pledge powerful fantasy creatures to their cause.

### Sanctuary Types & Placement Zones

| Sanctuary | Piece | Tier | Activation | Placement Zone |
|-----------|-------|------|------------|----------------|
| Wolf Covenant | Wolf | 1 | Occupy (Str 1+) | Neutral (near river) |
| Sacred Spring | Healer | 1 | Occupy (Str 1+) | Neutral (near river) |
| Warden's Watch | Ranger | 2 | Str 3+ surrounding | Opponent's shallow |
| Arcane Refuge | Wizard | 2 | Str 3+ surrounding | Opponent's shallow |
| Forsaken Grounds | Necromancer | 3 | Str 4+ + sacrifice | Opponent's deep |
| Pyre Eternal | Phoenix | 3 | Str 4+ + sacrifice | Opponent's deep |

Spy (dissapears every 2 turns)

### Special Pieces

| Piece | Move | Attack | Str | Ability |
|-------|------|--------|-----|---------|
| **Wolf** | 3 (ground) | Melee | 1 | Pack Tactics: +1 str per adjacent Wolf |
| **Healer** | 1 | None | 1 | Bolster: Adjacent allies +1 str |
| **Ranger** | 2 | Long-Range (3) | 1 | Snipe: Ignore supporting defenders |
| **Wizard** | 1 | Range (2) | 1 | One-time: Fireball OR Teleport |
| **Necromancer** | 1 | Melee | 1 | Soul Harvest: Kill → Soul → Raise Dead |
| **Phoenix** | Flying 3 | Melee | 2 | Rebirth: Respawn after 3 turns |

### Mechanics
- **Placement**: Random + mirrored (like castles)
- **Cooldown**: 5 turns after pledging
- **Sacrifice** (Tier 3): Remove a piece to unlock Necromancer/Phoenix
- **Exile**: Revived pieces are exiled (removed permanently) when killed again

---

## 🔴 Drafting System

**Status:** Designed, awaiting implementation

### Tiered Drafting
| Tier | Options |
|------|---------|
| 1 | Swordsman or Archer |
| 2 | Knight or Eagle |
| 3 | Giant, Trebuchet, or Assassin |
| 4 | Dragon or Monarch |

---

## 🟡 Game Analysis & Storage

### PGN Export/Import ✅ (Implemented)
### History Navigation (Planned)
- Left/Right arrow keys to cycle through moves
### Analysis Mode (Planned)
- Post-game review with annotations

---

## 🟡 Terrain Features

| Terrain | Effect |
|---------|--------|
| **Forests** | Block ranged attacks, +1 stealth |
| **Ruins** | +1 defensive strength |
| **High Ground** ✅ | +1 range for ranged units |

**Design Note**: Start with 2-3 terrain features per map.

---

## 🟡 Training Camps

**Location**: Near river, in enemy territory

**Mechanic**: Occupy to upgrade piece to next tier (Swordsman → Archer → Knight...)

---

## 🟡 New Game Modes

### Asymmetric Siege Mode
- Defender: Fortified position, reinforcements every N turns
- Attacker: Larger army, must capture Throne within time limit

### King of the Hill
- Central hexes grant VP each turn
- First to X VP wins

### Capture the Flag
- Carrying flag reduces movement

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

---

## 🟢 Hybrid Mechanics (Spin-off Ideas)

### Deck-Building
- Cards drive actions (Move, Attack, Recruit)
- Market for powerful cards

### Worker Placement
- Resource hexes (Mines, Shrines)
- Occupy for resources, defend position

### Victory Points
- First to 10 VP wins
- VP from battles, castle control, secret objectives