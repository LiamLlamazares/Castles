import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Color, PieceType } from "../../Constants";

export class WinCondition {
  /**
   * Checks if the game has been won.
   *
   * Victory conditions:
   * 1. Monarch Capture: Opponent's Monarch (king) has been captured
   * 2. Castle Control: Player controls all 6 castles on the board
   *
   * @returns The winning player's color, or null if game is ongoing
   */
  public static getWinner(pieces: Piece[], castles: Castle[]): Color | null {
    // Check for Monarch capture
    const monarchCaptureWinner = this.checkMonarchCapture(pieces);
    if (monarchCaptureWinner) return monarchCaptureWinner;

    // Check for castle control
    const castleControlWinner = this.checkCastleControl(pieces, castles);
    if (castleControlWinner) return castleControlWinner;

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
  public static getVictoryMessage(pieces: Piece[], castles: Castle[]): string | null {
    const winner = this.getWinner(pieces, castles);
    if (!winner) return null;

    const winnerName = winner === "w" ? "White" : "Black";

    // Determine victory type
    if (this.checkMonarchCapture(pieces)) {
      return `${winnerName} wins by capturing the Monarch!`;
    }

    if (this.checkCastleControl(pieces, castles)) {
      return `${winnerName} wins by controlling all castles!`;
    }

    return `${winnerName} wins!`;
  }
}
