/**
 * QuickStartModal - A briefly dismissible modal that introduces the game in 60 seconds.
 * Shows on first visit only (localStorage check).
 */
import React, { useState, useEffect } from "react";
import "../css/QuickStartModal.css";

interface QuickStartModalProps {
  onClose: () => void;
}

const QuickStartModal: React.FC<QuickStartModalProps> = ({ onClose }) => {
  return (
    <div className="quickstart-backdrop" onClick={onClose}>
      <div className="quickstart-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quickstart-header">
          <h1>🏰 Castles in 60 Seconds</h1>
          <button className="quickstart-close" onClick={onClose}>×</button>
        </div>

        <div className="quickstart-content">
          {/* Goal Section */}
          <div className="quickstart-goal">
            <span className="goal-icon">🎯</span>
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
                <span className="phase-icon">🥾</span>
                <div className="phase-desc">
                  <strong>Move</strong>
                  <span>Up to 2 pieces</span>
                </div>
              </div>
              <div className="phase-item">
                <span className="phase-num">2</span>
                <span className="phase-icon">⚔️</span>
                <div className="phase-desc">
                  <strong>Attack</strong>
                  <span>Up to 2 attacks</span>
                </div>
              </div>
              <div className="phase-item">
                <span className="phase-num">3</span>
                <span className="phase-icon">🏰</span>
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
              <span className="tip-icon">💡</span>
              <span><strong>Right-click</strong> any piece for detailed info</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">🌟</span>
              <span><strong>Sanctuaries</strong> summon special units — step on them!</span>
            </div>
            <div className="tip-item">
              <span className="tip-icon">🛡️</span>
              <span><strong>Stay together</strong> — grouped pieces can't be sniped by archers</span>
            </div>
          </div>
        </div>

        <div className="quickstart-footer">
          <button className="quickstart-play-btn" onClick={onClose}>
            ⚔️ Let's Play!
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
