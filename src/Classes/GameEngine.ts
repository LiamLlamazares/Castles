import { Piece } from "./Piece";
import { Castle } from "./Castle";
import { Hex } from "./Hex";
import { Board } from "./Board";
import { Color, AttackType, turnPhase, defendedPieceIsProtectedRanged, PieceType } from "../Constants";

export interface GameState {
  pieces: Piece[];
  Castles: Castle[];
  turnCounter: number;
  movingPiece: Piece | null;
  history: any[]; // Todo: Define history type stricter
}
// Rulebook for game: Can I move here? Is this a legal attack?...
export class GameEngine {
  constructor(public board: Board) {}

  public getTurnPhase(turnCounter: number): turnPhase {
    return turnCounter % 5 < 2
      ? "Movement"
      : turnCounter % 5 < 4
      ? "Attack"
      : "Castles";
  }

  public getCurrentPlayer(turnCounter: number): Color {
    return turnCounter % 10 < 5 ? "w" : "b";
  }

  public getOccupiedHexes(pieces: Piece[]): Hex[] {
    return pieces.map((piece) => piece.hex);
  }

  public getBlockedHexes(pieces: Piece[], castles: Castle[]): Hex[] {
    // Assuming board logic is used here, logic from Game.tsx:
    // blockedHexes = [...riverHexes, ...castleHexes, ...occupiedHexes]
    // The river/castle hexes are static on the board.
    const occupied = this.getOccupiedHexes(pieces);
    return [
        ...this.board.riverHexes, 
        ...this.board.castleHexes, 
        ...occupied
    ];
  }

  // ... Transferring more logic
  
  public getEnemyHexes(pieces: Piece[], currentPlayer: Color): Hex[] {
    return pieces
      .filter((piece) => piece.color !== currentPlayer)
      .map((piece) => piece.hex);
  }

  public getEnemyCastleHexes(castles: Castle[], currentPlayer: Color): Hex[] {
    return castles.filter(
      (castle) => castle.color !== currentPlayer
    ).map((castle) => castle.hex);
  }

  public getAttackableHexes(pieces: Piece[], castles: Castle[], currentPlayer: Color): Hex[] {
    return [...this.getEnemyHexes(pieces, currentPlayer), ...this.getEnemyCastleHexes(castles, currentPlayer)];
  }

  public getDefendedHexes(pieces: Piece[], currentPlayer: Color): Hex[] {
    if (defendedPieceIsProtectedRanged) {
      let enemyMeleePieces = pieces.filter(
        (piece) =>
          piece.color !== currentPlayer &&
          piece.AttackType === AttackType.Melee
      );
      //Gets squares attacked by enemy pieces
      // Note: legalAttacks logic in Piece depends on enemyHexes.
      // Enemy melee pieces attack YOUR hexes.
      // So enemyHexes for THEM is YOUR pieces.
      // Wait, Piece.legalAttacks takes 'enemyHexes'.
      // If we want to know what squares are defended by ENEMY melee pieces (so ranged can't attack them),
      // we need to see where enemy melee pieces can attack.
      // They can attack anything adjacent (usually).
      // Piece.legalAttacks checks if the target is in 'enemyHexes'.
      // If we pass ALL hexes as 'enemyHexes', we get all VALID attacks.
      // But 'defendedHexes' in Game.tsx implies "squares attacked by enemy pieces".
      // Game.tsx:136: `piece.legalAttacks(this.hexagons)`
      // It passes ALL hexagons. So it checks if any hexagon is attackable.
      // Piece code: `isValidAttack` checks if `newHex` is in `enemyHexes`.
      // So passing `this.hexagons` (all hexes) means it returns all adjacent hexes (since all are "valid" targets if we consider space).
      return enemyMeleePieces
        .map((piece) => piece.legalAttacks(this.board.hexes)) 
        .flat(1);
    }
    return [];
  }

  // This method calculates legal moves for a specific piece
  public getLegalMoves(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    const phase = this.getTurnPhase(turnCounter);
    if (piece && phase === "Movement" && piece.canMove) {
        const blocked = this.getBlockedHexes(pieces, castles);
        return piece.legalmoves(blocked, piece.color);
    }
    return [];
  }

  public getLegalAttacks(piece: Piece | null, pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
      const phase = this.getTurnPhase(turnCounter);
      const currentPlayer = this.getCurrentPlayer(turnCounter);

      if (piece && phase === "Attack" && piece.canAttack) {
          const attackable = this.getAttackableHexes(pieces, castles, currentPlayer);
          
          if (piece.AttackType === AttackType.Ranged) {
              const defended = this.getDefendedHexes(pieces, currentPlayer);
              return piece
                .legalAttacks(attackable)
                .filter(
                  (hex) =>
                    !defended.some((defendedHex) => defendedHex.equals(hex))
                );
          }
          return piece.legalAttacks(attackable);
      }
      return [];
  }

  public getFutureLegalAttacks(pieces: Piece[], castles: Castle[], turnCounter: number): Hex[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    const attackable = this.getAttackableHexes(pieces, castles, currentPlayer);
    
    // Adapted from Game.tsx logic
    return pieces
      .filter((piece) => piece.color === currentPlayer && piece.canAttack)
      .flatMap((piece) => {
        if (piece.AttackType === AttackType.Ranged) {
            const defended = this.getDefendedHexes(pieces, currentPlayer);
            return piece
              .legalAttacks(attackable)
              .filter(
                (hex) =>
                  !defended.some((defendedHex) =>
                    defendedHex.equals(hex)
                  )
              );
        }
        return piece.legalAttacks(attackable);
      });
  }

  public castleIsControlledByActivePlayer(castle: Castle, pieces: Piece[], currentPlayer: Color): boolean {
    const piece = pieces.find((piece) =>
      piece.hex.equals(castle.hex)
    );
    return (
      !!piece &&
      piece.color !== castle.color &&
      castle.color !== currentPlayer
    );
  }

  public getControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    const phase = this.getTurnPhase(turnCounter);
    return castles.filter((castle) => {
      if (phase !== "Castles") return false;
      return this.castleIsControlledByActivePlayer(castle, pieces, currentPlayer);
    });
  }

  public getFutureControlledCastlesActivePlayer(castles: Castle[], pieces: Piece[], turnCounter: number): Castle[] {
    const currentPlayer = this.getCurrentPlayer(turnCounter);
    return castles.filter((castle) => {
      // Logic from Game.tsx: similar to above but without phase check?
      // Game.tsx:191 uses same condition without phase check.
      return this.castleIsControlledByActivePlayer(castle, pieces, currentPlayer);
    });
  }

  public getTurnCounterIncrement(pieces: Piece[], castles: Castle[], turnCounter: number): number {
      const futureAttacks = this.getFutureLegalAttacks(pieces, castles, turnCounter);
      const hasFutureAttacks = futureAttacks.length > 0;
      
      const futureControlledCastles = this.getFutureControlledCastlesActivePlayer(castles, pieces, turnCounter);
      const hasFutureControlledCastles = futureControlledCastles.length > 0;
      
      const phase = this.getTurnPhase(turnCounter);
      const mod5 = turnCounter % 5;

    if (!hasFutureAttacks && !hasFutureControlledCastles && mod5 === 1) {
      return 4;
    } else if (!hasFutureAttacks && hasFutureControlledCastles && mod5 === 1) {
      return 3;
    } else if (!hasFutureAttacks && !hasFutureControlledCastles && mod5 === 2) {
      return 3;
    } else if (!hasFutureAttacks && hasFutureControlledCastles && mod5 === 2) {
      return 2;
    } else if (!hasFutureControlledCastles && mod5 === 3) {
      // Logic check: Game.tsx line 236
      return 2;
    } else if (
      phase === "Castles" &&
      castles.filter(
        (castle) =>
          this.castleIsControlledByActivePlayer(castle, pieces, this.getCurrentPlayer(turnCounter)) &&
          !castle.used_this_turn
      ).length === 0
    ) {
      return 1;
    } else if (phase === "Castles") {
      // all castles are not used
      return 0;
    } else {
      return 1;
    }
  }

  // Combat Logic
  public resolveCombat(attacker: Piece, defender: Piece, pieces: Piece[]): { newPieces: Piece[], attackerMoved: boolean } {
      defender.damage = defender.damage + attacker.Strength;
      let newPieces = [...pieces];
      let attackerMoved = false;

      if (
        defender.damage >= defender.Strength ||
        (defender.type === PieceType.Monarch && attacker.type === PieceType.Assassin)
      ) {
        // Defender dies
        newPieces = newPieces.filter((p) => p !== defender);
        
        if (
          attacker.AttackType === AttackType.Melee ||
          attacker.AttackType === AttackType.Swordsman
        ) {
          // Move attacker to defender hex
          attacker.hex = defender.hex;
          attackerMoved = true;
        }
      }
      return { newPieces, attackerMoved };
  }
}
