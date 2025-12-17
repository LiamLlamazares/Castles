# Castles: Game Rules

> A fantasy chess-like strategy game based on "The Ember Blade" by Chris Wooding

---

## Table of Contents
- [Quick Start](#quick-start)
- [Game Overview](#game-overview)
- [Turn Phases](#turn-phases)
- [Standard Pieces](#standard-pieces)
- [Special Pieces](#special-pieces)
- [Combat](#combat)
- [Sanctuaries](#sanctuaries)
- [Victory Conditions](#victory-conditions)

---

## Quick Start

**Objective:** Capture your opponent's Monarch OR control all 6 castles.

**Each Turn:**
1. **Movement Phase** – Move up to 2 pieces
2. **Attack Phase** – Attack with up to 2 pieces
3. **Castles Phase** – Recruit from controlled castles

---

## Game Overview

### The Board
- **Grass/Plains**: Standard movement terrain.
- **River**: Impassable to ground units, but flying units (Eagle, Dragon, Phoenix) can cross.
- **Castle**: Recruitment centers located in the corners.
- **Sanctuaries**: Magical circles for summoning special units.

### Starting Setup
Each player begins with:
| Piece | Qty | | Piece | Qty |
|-------|-----|-|-------|-----|
| Monarch | 1 | | Giants | 2 |
| Dragon | 1 | | Eagles | 2 |
| Assassin | 1 | | Trebuchets | 2 |
| Knights | 4 | | Archers | 6 |
| Swordsmen | 13 | | | |

---

## Turn Phases

### 1. Movement Phase 🥾
- Move **up to 2 pieces** (or 1 heavy unit)
- Heavy units: Monarch, Dragon, Giant, Trebuchet

### 2. Attack Phase ⚔️
- Attack with **up to 2 pieces**
- Multiple pieces can combine attacks on one target (damage stacks)
- Melee attackers move onto captured hex upon victory

### 3. Castles Phase 🏰
- Recruit **one piece per controlled castle**
- Recruitment order: Swordsman → Archer → Knight → Eagle → Giant → Trebuchet → Assassin → Dragon → Monarch
- Pieces spawn on unoccupied hex adjacent to castle
- You cannot recruit if all adjacent hexes are blocked

---

## Standard Pieces

### Movement Types
| Piece | Movement | Range | Notes |
|-------|----------|-------|-------|
| **Swordsman** | Forward diagonal (3 dirs) | 1 | Like a pawn |
| **Archer** | Any direction | 1 | Basic unit |
| **Trebuchet** | Any direction | 1 | Heavy unit |
| **Monarch** | Any direction | 1 | Heavy unit, must protect! |
| **Knight** | Diagonal sliding | Unlimited | Like a bishop |
| **Giant** | Orthogonal sliding | Unlimited | Like a rook, heavy |
| **Assassin** | Any sliding | Unlimited | Like a queen |
| **Eagle** | Flying | 3 | Ignores obstacles |
| **Dragon** | L-shaped jump | Fixed | Like chess knight, heavy, flying |

### Attack Types
| Type | Pieces | Range | Behavior |
|------|--------|-------|----------|
| **Melee** | Eagle, Giant, Dragon, Assassin, Monarch, Knight | Adjacent | Move onto captured hex |
| **Swordsman** | Swordsman | Forward diagonal | Move onto captured hex |
| **Ranged** | Archer, Wizard | 2 hexes | Does not move |
| **Long-Ranged** | Trebuchet, Ranger | 3 hexes | Does not move |

### Strength (HP)
| Strength 1 | Strength 2 | Strength 3 |
|------------|------------|------------|
| Swordsman, Archer, Knight, Trebuchet, Eagle, Assassin | Giant, Phoenix | Dragon, Monarch |

---

## Special Pieces

Special pieces are summoned from **Sanctuaries** located across the board.

| Piece | Movement | Attack | Strength | Special Ability |
|-------|----------|--------|----------|-----------------|
| **Wolf** | Walk 3 hexes | Melee | 1 | **Pack Tactics**: +1 strength per adjacent friendly Wolf (stackable) |
| **Healer** | 1 hex | None | 1 | **Heal**: Removes damage from adjacent friendly piece |
| **Ranger** | Walk 2 hexes | Long-Range (3) | 1 | Mobile sniper unit |
| **Wizard** | 1 hex | Ranged (2) | 1 | **Fireball**: Range 2, damages target (one-time use) |
| **Necromancer** | 1 hex | Melee | 1 | **Raise Dead**: Revive a captured piece to adjacent hex (one-time use) |
| **Phoenix** | Fly 3 hexes | Melee | 2 | **Rebirth**: Returns to board 3 turns after death |

---

## Combat

### Damage Resolution
1. Attacker deals damage equal to their **strength**.
2. Damage accumulates on the defender throughout the round.
3. Defender dies when **Total Damage ≥ Max Strength**.
4. All damage resets at the end of each round.

### Ranged Protection 🛡️
- **Defended Rule**: Any piece currently adjacent to a friendly unit is considered "Defended".
- **Benefit**: Defended pieces **cannot be targeted** by Ranged (Archer/Wizard) or Long-Ranged (Trebuchet/Ranger) attacks.
- **Counter**: You must attack Defended pieces using Melee units.

### Special Rules
- **Combined Arms**: Multiple pieces can attack the same target in one turn.
- **Assassin**: Instantly kills any Monarch regardless of HP/Strength.
- **Coronation**: Swordsman reaching opponent's back row can promote to any piece type (except Monarch).

---

## Sanctuaries

Sanctuaries are special hexes where players can **pledge** to summon powerful creatures.

### How to Pledge
1. Move a piece onto the Sanctuary hex.
2. Meet the **Strength Requirement** (Sum of adjacent friendly pieces).
3. (Tier 3 Only) Sacrifice an adjacent friendly unit.
4. Summon the special piece to an adjacent empty hex.

### Sanctuary Tiers & Rewards

| Tier | Requirement | Location | Rewards |
|------|-------------|----------|---------|
| **1** | Occupy (Any unit) | Neutral Zone | **Wolf** (Pack Tactics)<br>**Healer** (Heal Ally) |
| **2** | Occupy + 3 Strength | Shallow Enemy Territory | **Ranger** (Long Range)<br>**Wizard** (Fireball) |
| **3** | Occupy + 4 Strength + Sacrifice | Deep Enemy Territory | **Necromancer** (Raise Dead)<br>**Phoenix** (Rebirth) |

---

## Victory Conditions

### Win by Monarch Capture 👑
- Capture **all** opponent Monarchs (including summoned ones)

### Win by Castle Control 🏰
- Control **all 6 castles** on the board
- Your own 3 castles + opponent's 3 castles

### Draw Conditions
- Mutual agreement
- Three-fold repetition of board position

---

## Quick Reference

### Phase Summary
| Phase | Actions | Limit |
|-------|---------|-------|
| Movement | Move pieces | 2 regular OR 1 heavy |
| Attack | Attack enemies | 2 pieces |
| Castles | Recruit reinforcements | 1 per castle |

### Piece Comparison
| Piece | Move | Attack Type | Strength | Heavy | Flying |
|-------|------|-------------|----------|-------|--------|
| Swordsman | 1 fwd | Diagonal | 1 | ❌ | ❌ |
| Archer | 1 | Ranged (2) | 1 | ❌ | ❌ |
| Knight | ∞ diag | Melee | 1 | ❌ | ❌ |
| Trebuchet | 1 | Long (3) | 1 | ✅ | ❌ |
| Eagle | 3 | Melee | 1 | ❌ | ✅ |
| Giant | ∞ orth | Melee | 2 | ✅ | ❌ |
| Assassin | ∞ any | Melee | 1 | ❌ | ❌ |
| Dragon | L-jump | Melee | 3 | ✅ | ✅ |
| Monarch | 1 | Melee | 3 | ✅ | ❌ |

---

*Good luck, commander!*
