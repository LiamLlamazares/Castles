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
import { PieceType, AbilityType } from "../Constants";

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
        className={`ability-btn ${activeAbility === AbilityType.Fireball ? "active" : ""}`}
        onClick={() => onAbilitySelect(activeAbility === AbilityType.Fireball ? null : AbilityType.Fireball)}
      >
        {activeAbility === AbilityType.Fireball ? "TARGETING..." : "Fireball"}
      </button>
      <button
        className={`ability-btn ${activeAbility === AbilityType.Teleport ? "active" : ""}`}
        onClick={() => onAbilitySelect(activeAbility === AbilityType.Teleport ? null : AbilityType.Teleport)}
      >
        {activeAbility === AbilityType.Teleport ? "TARGETING..." : "Teleport"}
      </button>
    </>
  );

  const renderNecromancerAbilities = () => (
    <button
      className={`ability-btn ${activeAbility === AbilityType.RaiseDead ? "active" : ""}`}
      onClick={() => onAbilitySelect(activeAbility === AbilityType.RaiseDead ? null : AbilityType.RaiseDead)}
    >
      {activeAbility === AbilityType.RaiseDead ? "TARGETING..." : "Raise Dead"}
    </button>
  );

  // Don't render anything if piece has no abilities to show
  const hasWizardAbilities = movingPiece.type === PieceType.Wizard && !movingPiece.abilityUsed;
  const hasNecromancerAbilities = movingPiece.type === PieceType.Necromancer && movingPiece.souls > 0;
  
  if (!hasWizardAbilities && !hasNecromancerAbilities) {
    return null;
  }

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
      {hasWizardAbilities && renderWizardAbilities()}
      {hasNecromancerAbilities && renderNecromancerAbilities()}
    </div>
  );
};

export default AbilityBar;
