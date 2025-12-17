/**
 * @file AbilityBar.tsx
 * @description Floating ability bar for special piece abilities.
 *
 * Displays context-sensitive ability buttons when a piece with usable
 * abilities is selected:
 * - **Wizard**: Fireball (AoE damage), Teleport (move to distant hex)
 * - **Necromancer**: Raise Dead (resurrect from graveyard)
 *
 * @usage Rendered by Game.tsx when movingPiece has available abilities.
 * @see Game.tsx - Parent component that renders AbilityBar
 */
import React from "react";
import { Piece } from "../Classes/Entities/Piece";
import { PieceType } from "../Constants";

type AbilityType = "Fireball" | "Teleport" | "RaiseDead";

interface AbilityBarProps {
  /** The currently selected piece (must have abilities) */
  movingPiece: Piece;
  /** Currently active ability (if targeting) */
  activeAbility: AbilityType | null;
  /** Callback to set/toggle the active ability */
  onAbilitySelect: (ability: AbilityType | null) => void;
}

/**
 * Renders ability buttons based on the selected piece's type.
 */
const AbilityBar: React.FC<AbilityBarProps> = ({
  movingPiece,
  activeAbility,
  onAbilitySelect,
}) => {
  const renderWizardAbilities = () => (
    <>
      <button
        className={`ability-btn ${activeAbility === "Fireball" ? "active" : ""}`}
        onClick={() => onAbilitySelect(activeAbility === "Fireball" ? null : "Fireball")}
      >
        {activeAbility === "Fireball" ? "TARGETING..." : "Fireball"}
      </button>
      <button
        className={`ability-btn ${activeAbility === "Teleport" ? "active" : ""}`}
        onClick={() => onAbilitySelect(activeAbility === "Teleport" ? null : "Teleport")}
      >
        {activeAbility === "Teleport" ? "TARGETING..." : "Teleport"}
      </button>
    </>
  );

  const renderNecromancerAbilities = () => (
    <button
      className={`ability-btn ${activeAbility === "RaiseDead" ? "active" : ""}`}
      onClick={() => onAbilitySelect(activeAbility === "RaiseDead" ? null : "RaiseDead")}
    >
      {activeAbility === "RaiseDead" ? "TARGETING..." : "Raise Dead"}
    </button>
  );

  return (
    <div
      className="ability-bar"
      style={{
        position: "absolute",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: "10px",
        pointerEvents: "auto",
      }}
    >
      {movingPiece.type === PieceType.Wizard && !movingPiece.abilityUsed && renderWizardAbilities()}
      {movingPiece.type === PieceType.Necromancer && movingPiece.souls > 0 && renderNecromancerAbilities()}
    </div>
  );
};

export default AbilityBar;
