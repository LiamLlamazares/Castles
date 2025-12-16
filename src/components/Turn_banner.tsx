import React from "react";
import { TurnPhase, Color } from "../Constants";
import castleImage from "../Assets/Images/Banner/castle.svg";
import bootsImage from "../Assets/Images/Banner/boots.svg";
import swordImage from "../Assets/Images/Banner/sword.svg";
interface TurnBannerProps {
  color: Color;
  phase: TurnPhase;
}

const TurnBanner: React.FC<TurnBannerProps> = ({ color, phase }) => {
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
    </div>
  );
};

export default TurnBanner;
