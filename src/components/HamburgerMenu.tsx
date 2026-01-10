/**
 * HamburgerMenu component - slide-out menu for secondary game controls.
 * Contains Export/Import PGN, Flip Board, Toggle Coordinates.
 */
import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";

// SVG icon imports
import scrollIcon from "../Assets/Images/misc/scroll.svg";
import rotateIcon from "../Assets/Images/Board/rotate.svg";
import flagIcon from "../Assets/Images/misc/flag.svg";
import scrollsIcon from "../Assets/Images/misc/scroll2.svg";

const menuIconStyle: React.CSSProperties = { width: '18px', height: '18px', verticalAlign: 'middle' };

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
  onToggleTerrainIcons?: () => void;
  onToggleSanctuaryIcons?: () => void;
  onSetAllIcons?: (visible: boolean) => void;
  onToggleShields?: () => void;
  onToggleCastleRecruitment?: () => void;
  showTerrainIcons?: boolean;
  showSanctuaryIcons?: boolean;
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
  onToggleTerrainIcons,
  onToggleSanctuaryIcons,
  onSetAllIcons,
  showShields = true,
  showCastleRecruitment = true,
  showTerrainIcons = true,
  showSanctuaryIcons = true,
  showCoordinates = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isIconsMenuOpen, setIsIconsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toggleTheme, isDark } = useTheme();

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
          {/* Theme Toggle */}
          <button 
            className="menu-item" 
            onClick={() => toggleTheme()}
            style={{ justifyContent: 'space-between' }}
          >
            <span>{isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}</span>
          </button>
          
          <div className="menu-divider" />
          
          <button 
            className="menu-item" 
            onClick={() => handleMenuItemClick(onExportPGN)}
          >
            Export PGN
          </button>
          
          <button 
            className="menu-item" 
            onClick={() => handleMenuItemClick(onImportPGN)}
          >
            Import PGN
          </button>
          
          <div className="menu-divider" />
          
          <button 
            className="menu-item" 
            onClick={() => handleMenuItemClick(onFlipBoard)}
          >
            Flip Board
          </button>
          
          {/* Icon Settings Collapsible */}
          <button 
             className="menu-item"
             onClick={() => setIsIconsMenuOpen(!isIconsMenuOpen)}
             style={{ justifyContent: 'space-between', backgroundColor: isIconsMenuOpen ? 'rgba(255,255,255,0.05)' : 'transparent' }}
          >
             <span>Icon Settings</span>
             <span style={{ fontSize: '0.8em', opacity: 0.7 }}>{isIconsMenuOpen ? '-' : '+'}</span>
          </button>

          {isIconsMenuOpen && (
            <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
               {/* Show All / Hide All */}
               {onSetAllIcons && (
                 <div style={{ display: 'flex', gap: '8px', padding: '8px 12px 8px 12px' }}>
                    <button 
                      onClick={() => onSetAllIcons(true)}
                      style={{ flex: 1, padding: '6px', fontSize: '0.75rem', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', color: '#ddd', borderRadius: '4px' }}
                    > 
                      Show All
                    </button>
                    <button 
                      onClick={() => onSetAllIcons(false)}
                      style={{ flex: 1, padding: '6px', fontSize: '0.75rem', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', color: '#ddd', borderRadius: '4px' }}
                    > 
                      Hide All
                    </button>
                 </div>
               )}

               <button 
                  className="menu-item" 
                  onClick={() => handleToggleClick(onToggleCoordinates)}
                  style={{ paddingLeft: '24px', fontSize: '0.9rem' }}
                >
                  <input type="checkbox" checked={showCoordinates} readOnly style={{ marginRight: '8px' }} />
                  Coordinates
                </button>

               {onToggleTerrainIcons && (
                 <button 
                    className="menu-item" 
                    onClick={() => handleToggleClick(onToggleTerrainIcons)}
                    style={{ paddingLeft: '24px', fontSize: '0.9rem' }}
                  >
                    <input type="checkbox" checked={showTerrainIcons} readOnly style={{ marginRight: '8px' }} />
                    Terrain
                 </button>
               )}
               
               {onToggleSanctuaryIcons && (
                 <button 
                    className="menu-item" 
                    onClick={() => handleToggleClick(onToggleSanctuaryIcons)}
                    style={{ paddingLeft: '24px', fontSize: '0.9rem' }}
                  >
                    <input type="checkbox" checked={showSanctuaryIcons} readOnly style={{ marginRight: '8px' }} />
                    Sanctuary Icons
                 </button>
               )}
               
               {onToggleShields && (
                 <button 
                    className="menu-item" 
                    onClick={() => handleToggleClick(onToggleShields)}
                    style={{ paddingLeft: '24px', fontSize: '0.9rem' }}
                  >
                    <input type="checkbox" checked={showShields} readOnly style={{ marginRight: '8px' }} />
                    Protected Shields
                 </button>
               )}

               {onToggleCastleRecruitment && (
                 <button 
                    className="menu-item" 
                    onClick={() => handleToggleClick(onToggleCastleRecruitment)}
                    style={{ paddingLeft: '24px', fontSize: '0.9rem' }}
                  >
                    <input type="checkbox" checked={showCastleRecruitment} readOnly style={{ marginRight: '8px' }} />
                    Castle Recruitment
                 </button>
               )}
            </div>
          )}
          
          <div className="menu-divider" />
          
          <button 
            className="menu-item" 
            onClick={() => handleMenuItemClick(onShowRules)}
          >
            Rules
          </button>

          {onTutorial && (
            <button 
              className="menu-item" 
              onClick={() => handleMenuItemClick(onTutorial)}
            >
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
