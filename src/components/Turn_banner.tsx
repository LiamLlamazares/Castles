import React from "react";
import { TurnPhase, Color } from "../Constants";
import castleImage from "../Assets/Images/Banner/castle.svg";
import bootsImage from "../Assets/Images/Banner/boots.svg";
import swordImage from "../Assets/Images/Banner/sword.svg";

interface TurnBannerProps {
  color: Color;
  phase: TurnPhase;
  phaseIndex?: number; // 0-4 within current player's turn
}

/**
 * Calculate remaining actions for the current phase.
 * Movement: indices 0,1 → 2 remaining at 0, 1 remaining at 1
 * Attack: indices 2,3 → 2 remaining at 2, 1 remaining at 3
 * Castles: index 4 → shows ∞ (can recruit from multiple castles)
 */
const getRemainingActions = (phase: TurnPhase, phaseIndex?: number): string => {
  if (phaseIndex === undefined) return "";
  
  if (phase === "Movement") {
    const remaining = 2 - phaseIndex; // 0→2, 1→1
    return `${remaining}/2`;
  } else if (phase === "Attack") {
    const remaining = 4 - phaseIndex; // 2→2, 3→1
    return `${remaining}/2`;
  } else {
    // Recruitment phase - can use multiple castles/sanctuaries
    return "∞";
  }
};

const TurnBanner: React.FC<TurnBannerProps> = ({ color, phase, phaseIndex }) => {
  const remaining = getRemainingActions(phase, phaseIndex);
  
  return (
    <div className="phase-badge">
      <img
        src={
          phase === "Movement"
            ? bootsImage
            : phase === "Attack"
            ? swordImage
            : castleImage
        }
        alt={phase}
      />
      {remaining && (
        <span className="phase-counter" title={`${phase} actions remaining`}>
          {remaining}
        </span>
      )}
    </div>
  );
};

export default TurnBanner;
