/**
 * HamburgerMenu component - slide-out menu for secondary game controls.
 * Contains Export/Import PGN, Flip Board, Toggle Coordinates.
 */
import React, { useState, useRef, useEffect } from "react";

interface HamburgerMenuProps {
  onExportPGN: () => void;
  onImportPGN: () => void;
  onFlipBoard: () => void;
  onToggleCoordinates: () => void;
  onShowRules: () => void;
  onEnableAnalysis?: () => void;
  onEditPosition?: () => void;
  onTutorial?: () => void;
  isAnalysisMode?: boolean;
  onToggleShields?: () => void;
  onToggleCastleRecruitment?: () => void;
  showShields?: boolean;
  showCastleRecruitment?: boolean;
  showCoordinates?: boolean;
}

const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  onExportPGN,
  onImportPGN,
  onFlipBoard,
  onToggleCoordinates,
  onShowRules,
  onEnableAnalysis,
  onEditPosition,
  onTutorial,
  isAnalysisMode = false,
  onToggleShields,
  onToggleCastleRecruitment,
  showShields = true,
  showCastleRecruitment = true,
  showCoordinates = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close menu when Escape is pressed
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleMenuItemClick = (action: () => void) => {
    action();
    // Keep menu open for toggles if desired, but standard behavior is close. 
    // For toggles, it might be annoying to reopen. Let's keep it closing for now unless user complains.
    // Actually, for checkboxes, users often want to toggle multiple things. 
    // Let's NOT close for the toggle items.
  };

  const handleToggleClick = (action: () => void) => {
    action();
    // Do not close menu
  };

  return (
    <div className="hamburger-container" ref={menuRef}>
      {/* Hamburger Icon */}
      <button 
        className="hamburger-button" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Menu"
        aria-expanded={isOpen}
      >
        <span className="hamburger-icon">☰</span>
      </button>

      {/* Slide-out Menu */}
      <div className={`hamburger-menu ${isOpen ? "open" : ""}`}>
        <div className="menu-header">
          <span>Menu</span>
          <button className="menu-close" onClick={() => setIsOpen(false)}>×</button>
        </div>
        
        <div className="menu-items">
          <button 
            className="menu-item" 
            onClick={() => handleMenuItemClick(onExportPGN)}
          >
            <span className="menu-icon">📋</span>
            Export PGN
          </button>
          
          <button 
            className="menu-item" 
            onClick={() => handleMenuItemClick(onImportPGN)}
          >
            <span className="menu-icon">📥</span>
            Import PGN
          </button>
          
          <div className="menu-divider" />
          
          <button 
            className="menu-item" 
            onClick={() => handleMenuItemClick(onFlipBoard)}
          >
            <span className="menu-icon">🔄</span>
            Flip Board
          </button>
          
          <button 
            className="menu-item" 
            onClick={() => handleToggleClick(onToggleCoordinates)}
          >
            <span className="menu-icon">{showCoordinates ? '☑️' : '⬜'}</span>
            Show Coordinates
          </button>

          {onToggleShields && (
            <button 
              className="menu-item" 
              onClick={() => handleToggleClick(onToggleShields)}
            >
              <span className="menu-icon">{showShields ? '☑️' : '⬜'}</span>
              Show Protected Shields
            </button>
          )}

          {onToggleCastleRecruitment && (
            <button 
              className="menu-item" 
              onClick={() => handleToggleClick(onToggleCastleRecruitment)}
            >
              <span className="menu-icon">{showCastleRecruitment ? '☑️' : '⬜'}</span>
              Show Castle Icons
            </button>
          )}
          
          <div className="menu-divider" />
          
          <button 
            className="menu-item" 
            onClick={() => handleMenuItemClick(onShowRules)}
          >
            <span className="menu-icon">📖</span>
            Rules
          </button>

          {onTutorial && (
            <button 
              className="menu-item" 
              onClick={() => handleMenuItemClick(onTutorial)}
            >
              <span className="menu-icon">🎓</span>
              Tutorial
            </button>
          )}
          
          {onEnableAnalysis && !isAnalysisMode && (
            <>
              <div className="menu-divider" />
              <button 
                className="menu-item" 
                onClick={() => handleMenuItemClick(onEnableAnalysis)}
              >
                <span className="menu-icon">🔍</span>
                Analysis Board
              </button>
            </>
          )}
          
          {onEditPosition && (
            <>
              <div className="menu-divider" />
              <button 
                className="menu-item" 
                onClick={() => handleMenuItemClick(onEditPosition)}
              >
                <span className="menu-icon">🛠️</span>
                Edit Position
              </button>
            </>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && <div className="menu-backdrop" onClick={() => setIsOpen(false)} />}
    </div>
  );
};

export default HamburgerMenu;
