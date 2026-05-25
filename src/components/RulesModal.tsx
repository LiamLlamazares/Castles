import React, { useEffect } from "react";
import "../css/RulesModal.css";
import { getImageByPieceType } from "./PieceImages";
import { useTheme } from "../contexts/ThemeContext";
import castleImage from "../Assets/Images/Banner/castle.svg";
import bootsImage from "../Assets/Images/Banner/boots.svg";
import swordImage from "../Assets/Images/Banner/sword.svg";
import castleIcon from "../Assets/Images/misc/wcastle.svg";
import flagIcon from "../Assets/Images/misc/flag.svg";
import rotateIcon from "../Assets/Images/Board/rotate.svg";
import swordsIcon from "../Assets/Images/misc/swords-crossed.svg";
import starIcon from "../Assets/Images/misc/star.svg";
import trophyIcon from "../Assets/Images/misc/trophy.svg";
import { PieceType } from "../Constants";
import {
  castleRules,
  combatRules,
  phaseRules,
  sanctuaryRules,
  standardPieceReferenceRows,
  terrainRules,
  winningRules,
} from "../rules/rulesContent";

const terrainHexClasses: Record<string, string> = {
  River: "rules-terrain-river",
  Castle: "rules-terrain-castle",
  "High ground": "rules-terrain-high-ground",
  Sanctuary: "rules-terrain-sanctuary",
};

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const { isDark } = useTheme();

  const headerIconStyle: React.CSSProperties = {
    width: "24px",
    height: "24px",
    verticalAlign: "middle",
    marginRight: "8px",
    filter: isDark ? "invert(1)" : "none",
  };

  const smallIconStyle: React.CSSProperties = {
    width: "16px",
    height: "16px",
    verticalAlign: "middle",
    marginRight: "4px",
    filter: isDark ? "invert(1)" : "none",
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const openFullRules = () => {
    window.open(`${window.location.origin}/rules`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="rules-modal-backdrop" onClick={onClose}>
      <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rules-header">
          <h1><img src={castleIcon} alt="" style={headerIconStyle} /> Quick Rules</h1>
          <button className="rules-header-full-link" onClick={openFullRules}>
            Full Rules
          </button>
          <button className="rules-close" onClick={onClose} aria-label="Close rules">x</button>
        </div>

        <div className="rules-content">
          <section id="quick-start">
            <h2><img src={flagIcon} alt="" style={headerIconStyle} />Quick Start</h2>
            <div className="rules-box highlight">
              <p><strong>Win:</strong> {winningRules[0].text} You also win by controlling every castle.</p>
              <ol>
                <li><img src={bootsImage} alt="" style={smallIconStyle} /><strong>Movement:</strong> {phaseRules[0].text}</li>
                <li><img src={swordImage} alt="" style={smallIconStyle} /><strong>Attack:</strong> {phaseRules[1].text}</li>
                <li><img src={castleImage} alt="" style={smallIconStyle} /><strong>Castles:</strong> {phaseRules[2].text}</li>
              </ol>
              <button className="rules-full-link" onClick={openFullRules}>
                Open Full Rules
              </button>
            </div>
          </section>

          <section id="turn-phases">
            <h2><img src={rotateIcon} alt="" style={headerIconStyle} />Turn Phases</h2>
            <div className="phase-cards">
              {phaseRules.map((rule, index) => (
                <div className="phase-card" key={rule.title}>
                  <h4>{index + 1}. {rule.title}</h4>
                  <p>{rule.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="terrain">
            <h2>Terrain</h2>
            <div className="rules-grid">
              {terrainRules.map((rule) => (
                <div className="rule-tile" key={rule.title}>
                  <svg viewBox="0 0 110 110" className="tile-visual-svg">
                    <polygon
                      points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5"
                      className={terrainHexClasses[rule.title] || "hexagon"}
                    />
                    {rule.title === "Sanctuary" && (
                      <image
                        href={getImageByPieceType(PieceType.Wolf, "w")}
                        x="34"
                        y="34"
                        width="42"
                        height="42"
                      />
                    )}
                  </svg>
                  <strong>{rule.title}</strong>
                  <span>{rule.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="combat">
            <h2><img src={swordsIcon} alt="" style={headerIconStyle} />Combat</h2>
            <div className="rules-box">
              {combatRules.map((rule) => (
                <p key={rule.title}><strong>{rule.title}:</strong> {rule.text}</p>
              ))}
            </div>
          </section>

          <section id="castles-and-sanctuaries">
            <h2><img src={starIcon} alt="" style={headerIconStyle} />Castles and Sanctuaries</h2>
            <div className="rules-note">
              {[...castleRules, ...sanctuaryRules].map((rule) => (
                <p key={rule.title}><strong>{rule.title}:</strong> {rule.text}</p>
              ))}
            </div>
          </section>

          <section id="pieces">
            <h2><img src={trophyIcon} alt="" style={headerIconStyle} />Standard Pieces</h2>
            <table className="rules-table pieces-table">
              <thead>
                <tr>
                  <th>Piece</th>
                  <th>Attack</th>
                  <th>STR</th>
                  <th>Rule</th>
                </tr>
              </thead>
              <tbody>
                {standardPieceReferenceRows.map((piece) => (
                  <tr key={piece.type}>
                    <td><img src={getImageByPieceType(piece.type, "w")} alt="" className="rule-icon" />{piece.name}</td>
                    <td>{piece.attackType}</td>
                    <td>{piece.strength}</td>
                    <td>{piece.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
};

export default RulesModal;
