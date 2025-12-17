Future Ideas
Drafting System
Current State: Players start with fixed pieces.
Proposed Feature:
Players start with a set number of points.
Spend points to draft pieces.
Place drafted pieces on the board (e.g., within 2 squares of starting zone).
Questions:
Point values for each piece?
Exact placement zones?
Turn-based drafting or simultaneous?
Game Analysis & Storage
PGN Export/Import:
Ability to save/load games via PGN string.
MUST include initial board state (Castle positions) and piece configuration in the PGN header (since maps are variable).
History Navigation:
Use Left/Right arrow keys to cycle through move history.
Analysis Mode:
After game ends, enter "Analysis Mode".
Cycle through moves.
Maybe a dedicated "Analyze" button at game end.

## New Game Mode Ideas
### 1. Asymmetric Siege Mode
- **Setup:** One player defends a heavily fortified castle (fewer pieces, better position). The other player attacks with a larger army.
- **Win Condition:** Attacker must capture the "Throne" hex within N turns. Defender must survive.

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