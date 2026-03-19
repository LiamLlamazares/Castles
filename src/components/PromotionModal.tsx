/**
 * @file PromotionModal.tsx
 * @description Modal shown when a Swordsman reaches the opponent's back row.
 * Allows the player to select which piece type to promote to.
 */
import React from "react";
import { PieceType } from "../Constants";
import { PromotionPending } from "../Classes/Core/GameState";
import { getPieceConfig } from "../Classes/Config/PieceTypeConfig";

interface PromotionModalProps {
  promotion: PromotionPending;
  onSelect: (type: PieceType) => void;
  playerColor: "w" | "b";
}

const PromotionModal: React.FC<PromotionModalProps> = ({
  promotion,
  onSelect,
  playerColor,
}) => {
  const playerName = playerColor === "w" ? "White" : "Black";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "#1a1a2e",
          border: "2px solid #c9a959",
          borderRadius: "12px",
          padding: "24px 32px",
          maxWidth: "500px",
          width: "90%",
          color: "#e0d5c0",
          fontFamily: "'Georgia', serif",
        }}
      >
        <h2
          style={{
            textAlign: "center",
            color: "#c9a959",
            marginTop: 0,
            fontSize: "1.4em",
          }}
        >
          Coronation
        </h2>
        <p style={{ textAlign: "center", fontSize: "0.95em", opacity: 0.85 }}>
          {playerName}'s Swordsman has reached the back row. Choose a piece to
          promote to:
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "10px",
            marginTop: "16px",
          }}
        >
          {promotion.options.map((type) => {
            const config = getPieceConfig(type);
            return (
              <button
                key={type}
                onClick={() => onSelect(type)}
                style={{
                  backgroundColor: "#2a2a4a",
                  border: "1px solid #555",
                  borderRadius: "8px",
                  color: "#e0d5c0",
                  padding: "12px 8px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontFamily: "'Georgia', serif",
                  fontSize: "0.9em",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#3a3a6a";
                  e.currentTarget.style.borderColor = "#c9a959";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#2a2a4a";
                  e.currentTarget.style.borderColor = "#555";
                }}
              >
                <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                  {config.displayName || type}
                </div>
                <div style={{ fontSize: "0.75em", opacity: 0.7 }}>
                  Str: {config.strength}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PromotionModal;
