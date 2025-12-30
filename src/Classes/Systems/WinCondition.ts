import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Color, PieceType } from "../../Constants";

/** VP threshold for victory in VP mode */
export const VP_VICTORY_THRESHOLD = 10;

export class WinCondition {
  /**
   * Checks if the game has been won.
   *
   * Victory conditions:
   * 1. Monarch Capture: Opponent's Monarch (king) has been captured
   * 2. Castle Control: Player controls all 6 castles on the board
   * 3. Victory Points: Player reaches 10 VP (if VP mode enabled)
   *
   * @returns The winning player's color, or null if game is ongoing
   */
  public static getWinner(pieces: Piece[], castles: Castle[], victoryPoints?: { w: number, b: number }): Color | null {
    // Check for Monarch capture
    const monarchCaptureWinner = this.checkMonarchCapture(pieces);
    if (monarchCaptureWinner) return monarchCaptureWinner;

    // Check for castle control
    const castleControlWinner = this.checkCastleControl(pieces, castles);
    if (castleControlWinner) return castleControlWinner;

    // Check for VP victory (if VP mode enabled)
    if (victoryPoints) {
      const vpWinner = this.checkVictoryPoints(victoryPoints);
      if (vpWinner) return vpWinner;
    }

    return null;
  }

  /**
   * Checks if either player has lost their Monarch.
   * @returns The winning player (opponent of the player who lost their Monarch), or null
   */
  private static checkMonarchCapture(pieces: Piece[]): Color | null {
    const whiteMonarch = pieces.find(
      (p) => p.type === PieceType.Monarch && p.color === "w"
    );
    const blackMonarch = pieces.find(
      (p) => p.type === PieceType.Monarch && p.color === "b"
    );

    // If white's monarch is gone, black wins
    if (!whiteMonarch) return "b";

    // If black's monarch is gone, white wins
    if (!blackMonarch) return "w";

    return null;
  }

  /**
   * Checks if either player controls all castles.
   *
   * Control rules:
   * - A player controls their OWN castles by default (castle.color === player)
   * - A player controls an ENEMY castle if they have a piece ON it (captured)
   *
   * @returns The winning player who controls all castles, or null
   */
  private static checkCastleControl(
    pieces: Piece[],
    castles: Castle[]
  ): Color | null {
    const controlledByWhite = castles.filter((castle) =>
      this.playerControlsCastle(castle, "w")
    ).length;

    const controlledByBlack = castles.filter((castle) =>
      this.playerControlsCastle(castle, "b")
    ).length;

    const totalCastles = castles.length;

    // Player must control ALL castles to win
    if (controlledByWhite === totalCastles) return "w";
    if (controlledByBlack === totalCastles) return "b";

    return null;
  }

  /**
   * Checks if either player has reached the VP threshold.
   */
  private static checkVictoryPoints(vp: { w: number, b: number }): Color | null {
    if (vp.w >= VP_VICTORY_THRESHOLD) return "w";
    if (vp.b >= VP_VICTORY_THRESHOLD) return "b";
    return null;
  }

  /**
   * Calculates VP gain for a player based on castle control.
   * VP is earned when controlling MORE than 3 castles (your starting 3 don't count).
   * - 4 castles = +1 VP/round
   * - 5 castles = +3 VP/round
   * - 6 castles = instant win (handled separately)
   */
  public static calculateVPGain(castles: Castle[], player: Color): number {
    const controlled = castles.filter(c => this.playerControlsCastle(c, player)).length;
    if (controlled === 4) return 1;
    if (controlled === 5) return 3;
    // 6 = instant win, 3 or less = no VP
    return 0;
  }

  /**
   * Checks if a specific player controls a castle.
   * Uses the castle's `owner` property which tracks persistent ownership.
   */
  private static playerControlsCastle(
    castle: Castle,
    player: Color
  ): boolean {
    return castle.owner === player;
  }

  /**
   * Returns a human-readable description of the victory.
   */
  public static getVictoryMessage(pieces: Piece[], castles: Castle[], victoryPoints?: { w: number, b: number }): string | null {
    const winner = this.getWinner(pieces, castles, victoryPoints);
    if (!winner) return null;

    const winnerName = winner === "w" ? "White" : "Black";

    // Determine victory type
    if (this.checkMonarchCapture(pieces)) {
      return `${winnerName} wins by capturing the Monarch!`;
    }

    if (this.checkCastleControl(pieces, castles)) {
      return `${winnerName} wins by controlling all castles!`;
    }

    if (victoryPoints && this.checkVictoryPoints(victoryPoints)) {
      return `${winnerName} wins by reaching ${VP_VICTORY_THRESHOLD} Victory Points!`;
    }

    return `${winnerName} wins!`;
  }
}
