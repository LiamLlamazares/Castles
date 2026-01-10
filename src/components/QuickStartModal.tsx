/**
 * QuickStartModal - A briefly dismissible modal that introduces the game in 60 seconds.
 * Shows on first visit only (localStorage check).
 */
import React, { useState, useEffect } from "react";
import "../css/QuickStartModal.css";

// SVG imports
import castleIcon from "../Assets/Images/misc/castle.svg";
import flagIcon from "../Assets/Images/misc/flag.svg";
import bootsIcon from "../Assets/Images/Banner/boots.svg";
import swordsIcon from "../Assets/Images/misc/swords-crossed.svg";
import lightbulbIcon from "../Assets/Images/misc/lightbulb.svg";
import starIcon from "../Assets/Images/misc/star.svg";
import shieldIcon from "../Assets/Images/Board/shield.svg";

interface QuickStartModalProps {
  onClose: () => void;
}

const iconStyle: React.CSSProperties = { width: '24px', height: '24px', verticalAlign: 'middle', filter: 'invert(1)' };
const smallIconStyle: React.CSSProperties = { width: '20px', height: '20px', verticalAlign: 'middle', filter: 'invert(1)' };

const QuickStartModal: React.FC<QuickStartModalProps> = ({ onClose }) => {
  return (
    <div className="quickstart-backdrop" onClick={onClose}>
      <div className="quickstart-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quickstart-header">
          <h1><img src={castleIcon} alt="" style={iconStyle} /> Castles in 60 Seconds</h1>
          <button className="quickstart-close" onClick={onClose}>×</button>
        </div>

        <div className="quickstart-content">
          {/* Goal Section */}
          <div className="quickstart-goal">
            <span className="goal-icon"><img src={flagIcon} alt="" style={iconStyle} /></span>
            <div className="goal-text">
              <strong>GOAL:</strong> Capture the enemy Monarch OR control all 6 Castles
            </div>
          </div>

          {/* Turn Structure */}
          <div className="quickstart-turns">
            <h3>Each Turn:</h3>
            <div className="turn-phases">
              <div className="phase-item">
                <span className="phase-num">1</span>
                <span className="phase-icon"><img src={bootsIcon} alt="" style={smallIconStyle} /></span>
                <div className="phase-desc">
                  <strong>Move</strong>
                  <span>Up to 2 pieces</span>
                </div>
              </div>
              <div className="phase-item">
                <span className="phase-num">2</span>
                <span className="phase-icon"><img src={swordsIcon} alt="" style={smallIconStyle} /></span>
                <div className="phase-desc">
                  <strong>Attack</strong>
                  <span>Up to 2 attacks</span>
                </div>
              </div>
              <div className="phase-item">
                <span className="phase-num">3</span>
                <span className="phase-icon"><img src={castleIcon} alt="" style={smallIconStyle} /></span>
                <div className="phase-desc">
                  <strong>Castles</strong>
                  <span>Recruit reinforcements</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="quickstart-tips">
            <div className="tip-item">
              <span className="tip-icon"><img src={lightbulbIcon} alt="" style={smallIconStyle} /></span>
              <span><strong>Right-click</strong> any piece for detailed info</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon"><img src={starIcon} alt="" style={smallIconStyle} /></span>
              <span><strong>Sanctuaries</strong> summon special units — step on them!</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon"><img src={shieldIcon} alt="" style={smallIconStyle} /></span>
              <span><strong>Stay together</strong> — grouped pieces can't be sniped by archers</span>
            </div>
          </div>
        </div>

        <div className="quickstart-footer">
          <button className="quickstart-play-btn" onClick={onClose}>
            <img src={swordsIcon} alt="" style={smallIconStyle} /> Let's Play!
          </button>
          <span className="quickstart-hint">Press ESC or click outside to close</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook to manage first-time user experience.
 * Returns [shouldShow, dismiss] tuple.
 */
export const useQuickStart = (): [boolean, () => void] => {
  const [showQuickStart, setShowQuickStart] = useState(false);

  useEffect(() => {
    const hasSeenQuickStart = localStorage.getItem("hasSeenQuickStart");
    if (!hasSeenQuickStart) {
      setShowQuickStart(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem("hasSeenQuickStart", "true");
    setShowQuickStart(false);
  };

  return [showQuickStart, dismiss];
};

export default QuickStartModal;
