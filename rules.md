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
- Hexagonal grid with sides of length 8
- **River hexes** divide the board (impassable except for flying units)
- **6 Castles** positioned in corners (3 per player)
- **6 Sanctuaries** scattered across the board (for summoning special pieces)

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
- Multiple pieces can combine attacks on one target
- Melee attackers move onto captured hex

### 3. Castles Phase 🏰
- Recruit **one piece per controlled castle**
- Recruitment order: Swordsman → Archer → Knight → Eagle → Giant → Trebuchet → Assassin → Dragon → Monarch
- Pieces spawn on unoccupied hex adjacent to castle

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
| **Melee** | Eagle, Giant, Dragon, Assassin, Monarch | Adjacent | Move onto captured hex |
| **Swordsman** | Swordsman | Forward diagonal | Move onto captured hex |
| **Ranged** | Archer | 2 hexes | Does not move |
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
| **Wolf** | Walk 3 hexes | Melee | 1 | **Pack Tactics**: +1 strength per adjacent friendly Wolf |
| **Healer** | 1 hex | None | 1 | **Heal**: Removes damage from adjacent friendly piece |
| **Ranger** | Walk 2 hexes | Long-Range (3) | 1 | Mobile archer |
| **Wizard** | 1 hex | Ranged (2) | 1 | **Fireball**: One-time area damage |
| **Necromancer** | 1 hex | Melee | 1 | **Raise Dead**: Revive a captured piece (one-time) |
| **Phoenix** | Fly 3 hexes | Melee | 2 | **Rebirth**: Returns 3 turns after death |

---

## Combat

### Damage Resolution
1. Attacker deals damage equal to their **strength**
2. Damage accumulates on the defender
3. Defender dies when damage **≥ their strength**
4. All damage resets at the end of each round

### Combining Attacks
- Multiple pieces can attack the same target in one phase
- Damage stacks, enabling takedowns of high-strength pieces
- Example: 3 Swordsmen (1+1+1 = 3 damage) can kill a Monarch (3 strength)

### Assassin Special
- Assassin **instantly kills** any Monarch, regardless of damage

### Coronation
- Swordsman reaching opponent's back row can **promote** to any piece type

---

## Sanctuaries

Sanctuaries are special hexes where players can **pledge** to summon powerful creatures.

### Tiers

| Tier | Sanctuaries | Requirement | Location |
|------|-------------|-------------|----------|
| **1** | Wolf Covenant, Sacred Spring | Occupy (strength ≥ 1) | Near river (neutral zone) |
| **2** | Warden's Watch, Arcane Refuge | Strength ≥ 3 | Opponent's shallow territory |
| **3** | Forsaken Grounds, Pyre Eternal | Strength ≥ 4 + sacrifice | Opponent's deep territory |

### How to Pledge
1. Have a piece on the sanctuary hex
2. Meet the strength requirement (sum of adjacent friendly pieces)
3. For Tier 3: Sacrifice one adjacent piece
4. Spawned creature appears on an adjacent unoccupied hex

### Sanctuary Types

| Sanctuary | Summons | Tier |
|-----------|---------|------|
| Wolf Covenant | Wolf | 1 |
| Sacred Spring | Healer | 1 |
| Warden's Watch | Ranger | 2 |
| Arcane Refuge | Wizard | 2 |
| Forsaken Grounds | Necromancer | 3 |
| Pyre Eternal | Phoenix | 3 |

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
