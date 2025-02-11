<link rel="stylesheet" type="text/css" href="css/styles.css">

# Castles: How to Play

This is a fantasy chess-like game based on the book [The ember blade](https://www.goodreads.com/book/show/34673711-the-ember-blade), by Chris Wooding. Below are the details of the game, including the win condition, board setup, pieces, and turn phases.

For more details about the pieces, see the [Pieces section](#pieces).

## General Summary <img src="/src/Assets/Images/misc/scroll.svg" width="30" height="30">

The following is an excerpt from the book that describes the game:

"The hexagonal board was divided into hundreds of smaller hexes, across which dozens of carved pieces were scattered, some of ivory and some of polished black stone. The castles which gave the game its name were unevenly placed around the board. The object was to capture and hold them while protecting your king. A broken line of blue counters, representing a river and its fords, meandered between them."

<p align="center">
<img src="/src/Assets/Images/misc/board.png" width="450">
</p>

Within the game each player controls a set of unique [pieces](#pieces) with different strengths, movement patterns, and abilities. The objective is to capture the opponent's Monarch or control the board by capturing their opponents castles.

---

## Turn Phases

The game proceeds in turns, each turn is divided into three phases:

### Movement Phase <img src="/src/Assets/Images/Banner/boots.svg" width="25" height="25">

During the movement phase, players can move up to two of their pieces according to their movement patterns. Pieces can move to any legal hex that is not occupied by another piece or blocked by an obstacle.

### Attack Phase <img src="/src/Assets/Images/Banner/sword.svg" width="25" height="25">

During the attack phase, players can use up to two of their pieces to attack opponent pieces within their attack range. If the sum of the strength of the attacking pieces exceed the strength of the piece that is attacked, the attacked piece is captured. Pieces can capture opponent pieces by moving into their hex or attacking from a distance.

### Castles Phase <img src="/src/Assets/Images/Banner/castle.svg" width="25" height="25">

During the castles phase, players can control castles by moving their pieces into castle hexes. In the castles phase, the active player can summon reinforcements by placing a new piece on an unoccupied hex adjacent to each controlled castle. The piece summoned from a controlled castle is initially a Swordsman, than an Archer, Knight, Eagle, Giant, Trebuchet, Assassin, Dragon, and Monarch.

## Win Condition <img src="/src/Assets/Images/misc/trophy.svg" width="30" height="30">

The game can be won in two ways:

1. **Capturing the Opponent's Monarch**: If a player captures all their opponent's Monarchs (there may be multiple if one is summoned from a castle), they win the game.
2. **Controlling the Opponent's Castles**: If a player controls all their opponents castles, they win the game.

---

## The Board <img src="/src/Assets/Images/misc/hex-tiles.svg" width="30" height="30">

The board is a hexagonal grid with sides of length 8 and with various types of hexes:

- **Normal Hexes**: Regular hexes where pieces can move and capture.
- **River Hexes**: Hexes that act as obstacles and cannot be occupied by pieces. Pieces with flying may cross the river.
- **Castle Hexes**: Key positions on the board located in the 6 corners of the board. Each player has three castles. Control of enemy's castles provides special advantages as well as being a win condition.

<a name="pieces"></a>

## The Pieces <img src="/src/Assets/Images/misc/dragon.svg" width="30" height="30">

Each player starts with the following pieces arranged on their side of the board. Each piece has unique attributes, including strength, type, movement, capture abilities, and coronation rules.

| Piece      | Icon                                                                       | Quantity | Strength | Description                                                  |
| ---------- | -------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------ |
| Monarch    | <img src="/src/Assets/Images/Chess/wMonarch.svg" width="50" height="50">   | 1        | 3        | The key piece that must be protected at all costs.           |
| Assassin   | <img src="/src/Assets/Images/Chess/wAssassin.svg" width="50" height="50">  | 1        | 1        | Stealthy unit with the ability to capture Monarchs.          |
| Dragon     | <img src="/src/Assets/Images/Chess/wDragon.svg" width="50" height="50">    | 1        | 3        | Powerful unit similar to a knight in chess.                  |
| Giants     | <img src="/src/Assets/Images/Chess/wGiant.svg" width="50" height="50">     | 2        | 2        | Strong mobile unit. Similar to a rook in chess.              |
| Eagles     | <img src="/src/Assets/Images/Chess/wEagle.svg" width="50" height="50">     | 2        | 1        | Highly mobile unit with the ability to fly.                  |
| Trebuchets | <img src="/src/Assets/Images/Chess/wTrebuchet.svg" width="50" height="50"> | 2        | 1        | Long-ranged unit with the ability to attack from a distance. |
| Knights    | <img src="/src/Assets/Images/Chess/wKnight.svg" width="50" height="50">    | 4        | 1        | Fast-moving unit. Akin to the bishop in chess.               |
| Archers    | <img src="/src/Assets/Images/Chess/wArcher.svg" width="50" height="50">    | 6        | 1        | Ranged unit with the ability to attack from a distance.      |
| Swordsmen  | <img src="/src/Assets/Images/Chess/wSwordsman.svg" width="50" height="50"> | 13       | 1        | Basic melee unit. Akin to a pawn in chess.                   |

The strength of a piece determines its ability to withstand attacks. Pieces with higher strength are harder to capture.
The three castles are positioned in the corners of each player's side.

## Movement <img src="/src/Assets/Images/Banner/boots.svg" width="30" height="30">

Each piece has a unique movement pattern:

### Ground Units <img src="/src/Assets/Images/misc/footprint.svg" width="25" height="25">

The movement of ground units is obstructed by river hexes and both friendly and enemy pieces.

- **Swordsman**: Moves one forward in any direction. Can move two forward on its first move.
- **Archer,Monarch, Trebuchet**: Moves one hex in any direction.
- **Knight**: The knight can move any distance in a straight line if unobstructed, jumping along the edge of any hexagon to another hexagon 2 squares away.
- **Giant**: The giant moves any distance in a straight line if unobstructed, through any hex which shares an edge with its current position.
- **Assassin**: Moves like the queen in chess, a combination in this case of the giant and knight.

### Flying Units <img src="/src/Assets/Images/misc/flying.svg" width="25" height="25">

Flying units can move over river hexes and other pieces.

- **Eagle**: Can fly up to 3 hexes in any direction.
- **Dragon**: Moves like a knight in chess, flying in an L-shaped pattern.

### Heavy units <img src="/src/Assets/Images/misc/dragon.svg" width="25" height="25">

Each turn a player may move two regular units or one heavy unit. The heavy units are the Trebuchet, Giant, Dragon and Monarch.

## Attack <img src="/src/Assets/Images/Banner/sword.svg" width="30" height="30">

During the attack phase, pieces up to two pieces can attack opponents within their attack range. The attack range of a piece is determined by its type:

- **Melee Units**: Swordsman, Eagle, Giant, Dragon. These pieces capture opponent pieces by moving into their hex. The swordsman can only attack diagonally. The remaining melee units can attack any adjacent piece.

- **Ranged Units**: Archer, Trebuchet. These pieces can attack opponents at an exact distance of 2 and 3 hexes respectively. When capturing, they do not move into the hex of the captured piece.

### Combat Resolution <img src="/src/Assets/Images/misc/swords-crossed.svg" width="25" height="25">

- Multiple pieces can contribute to a single attack
- The total strength of attacking pieces must exceed the defender's strength
- Pieces fully recover between turns
- When a castle is captured new pieces can be summoned from the captured castle starting from the current turn.

## Coronation <img src="/src/Assets/Images/misc/crown.svg" width="30" height="30">

Certain pieces can be promoted or gain special abilities under specific conditions:

- **Swordsman**: Can be promoted to any other piece when it reaches the opponent's back row.

---

## Game End Conditions <img src="/src/Assets/Images/misc/flag.svg" width="30" height="30">

The game can end in the following ways:

1. **Victory**

   - Capturing all enemy Monarchs
   - Controlling all enemy Castles
   - Stalemate (opponent has no legal moves)

2. **Draw**

   - Mutual agreement
   - Three-fold repetition of board position

Enjoy the game and may the best strategist win!

## Future Features <img src="/src/Assets/Images/misc/wizard.svg" width="30" height="30">

- Online multiplayer
- AI opponents
- Custom piece selection
- Custom board selection
- Custom game rules
- New pieces (e.g. wizards, healers, necromancers, etc.)
- Ratings and leaderboards
