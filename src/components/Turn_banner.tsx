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
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          width: "20px",
          height: "20px",
          backgroundColor: color === "w" ? "white" : "black",
          borderRadius: "50%",
        }}
      />
      <img
        src={
          phase === "Movement"
            ? bootsImage
            : phase === "Attack"
            ? swordImage
            : castleImage
        }
        alt={phase}
        style={{ width: "50px", height: "50px" }} // Set the size of the images here
      />
    </div>
  );
};

export default TurnBanner;
