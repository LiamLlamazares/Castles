/**
 * HamburgerMenu component - slide-out menu for secondary game controls.
 * Contains Export/Import PGN, Flip Board, Toggle Coordinates.
 */
import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";

// SVG icon imports
import scrollIcon from "../Assets/Images/misc/scroll.svg";
import rotateIcon from "../Assets/Images/Board/rotate.svg";
import scrollsIcon from "../Assets/Images/misc/scroll2.svg";

const menuIconStyle: React.CSSProperties = { width: '18px', height: '18px', verticalAlign: 'middle' };

interface HamburgerMenuProps {
  onExportPGN: () => void;
  onImportPGN: () => void;
  onFlipBoard: () => void;
  onToggleCoordinates: () => void;
  onShowRules: () => void;
  onNewGame?: () => void;
  onEnableAnalysis?: () => void;
  onSaveGameToLibrary?: () => void;
  onOpenLibrary?: () => void;
  onEditPosition?: () => void;
  onTutorial?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
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
  onNewGame,
  onEnableAnalysis,
  onSaveGameToLibrary,
  onOpenLibrary,
  onEditPosition,
  onTutorial,
  onOpenChange,
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

  const setMenuOpen = React.useCallback((nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setIsIconsMenuOpen(false);
    }
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, setMenuOpen]);

  // Close menu when Escape is pressed
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, setMenuOpen]);

  const handleMenuItemClick = (action: () => void) => {
    action();
    setMenuOpen(false);
  };

  const handleToggleClick = (action: () => void) => {
    action();
    // Do not close menu
  };

  const renderIcon = (icon: React.ReactNode) => (
    <span className="menu-item-icon" aria-hidden="true">
      {icon}
    </span>
  );

  const renderImageIcon = (src: string, alt = "") => (
    <img src={src} alt={alt} style={menuIconStyle} />
  );

  return (
    <div className="hamburger-container" ref={menuRef}>
      {/* Hamburger Icon */}
      <button
        className="hamburger-button"
        onClick={() => setMenuOpen(!isOpen)}
        aria-label="Menu"
        aria-expanded={isOpen}
      >
        <span className="hamburger-icon">☰</span>
      </button>

      {/* Slide-out Menu */}
      {isOpen && (
        <div className="hamburger-menu open">
          <div className="menu-header">
            <span>Castles</span>
            <button className="menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button>
          </div>

          <div className="menu-items">
            <section className="menu-section" aria-labelledby="menu-section-play">
              <div id="menu-section-play" className="menu-section-label">Play</div>

              {onNewGame && (
                <button
                  className="menu-item primary"
                  onClick={() => handleMenuItemClick(onNewGame)}
                >
                  {renderIcon("+")}
                  <span>New Game</span>
                </button>
              )}
            </section>

            {(onSaveGameToLibrary || onOpenLibrary) && (
              <section className="menu-section" aria-labelledby="menu-section-library">
                <div id="menu-section-library" className="menu-section-label">Library</div>

                {onSaveGameToLibrary && (
                  <button
                    className="menu-item primary"
                    onClick={() => handleMenuItemClick(onSaveGameToLibrary)}
                  >
                    {renderImageIcon(scrollIcon)}
                    <span>Save Game</span>
                  </button>
                )}

                {onOpenLibrary && (
                  <button
                    className="menu-item primary"
                    onClick={() => handleMenuItemClick(onOpenLibrary)}
                  >
                    {renderImageIcon(scrollsIcon)}
                    <span>Game Library</span>
                  </button>
                )}
              </section>
            )}

            <section className="menu-section" aria-labelledby="menu-section-learn">
              <div id="menu-section-learn" className="menu-section-label">Learn</div>

              {onTutorial && (
                <button
                  className="menu-item"
                  onClick={() => handleMenuItemClick(onTutorial)}
                >
                  {renderIcon("?")}
                  <span>Tutorial</span>
                </button>
              )}

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onShowRules)}
              >
                {renderIcon("i")}
                <span>Rules</span>
              </button>
            </section>

            <div className="menu-divider" />
            <section className="menu-section" aria-labelledby="menu-section-board">
              <div id="menu-section-board" className="menu-section-label">Board</div>

              {/* Theme Toggle */}
              <button
                className="menu-item"
                onClick={() => toggleTheme()}
                style={{ justifyContent: 'space-between' }}
              >
                <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onExportPGN)}
              >
                {renderImageIcon(scrollIcon)}
                <span>Export PGN</span>
              </button>

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onImportPGN)}
              >
                {renderImageIcon(scrollsIcon)}
                <span>Import PGN</span>
              </button>

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onFlipBoard)}
              >
                {renderImageIcon(rotateIcon)}
                <span>Flip Board</span>
              </button>

              {/* Icon Settings Collapsible */}
              <button
                className="menu-item"
                onClick={() => setIsIconsMenuOpen(!isIconsMenuOpen)}
                style={{ justifyContent: 'space-between', backgroundColor: isIconsMenuOpen ? 'rgba(255,255,255,0.05)' : 'transparent' }}
              >
                <span>{renderIcon("Ic")} Icon Settings</span>
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

                <label className="menu-toggle-item" style={{ paddingLeft: '24px', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={showCoordinates}
                    onChange={() => handleToggleClick(onToggleCoordinates)}
                  />
                  Coordinates
                </label>

                {onToggleTerrainIcons && (
                  <label className="menu-toggle-item" style={{ paddingLeft: '24px', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={showTerrainIcons}
                      onChange={() => handleToggleClick(onToggleTerrainIcons)}
                    />
                    Terrain
                  </label>
                )}

                {onToggleSanctuaryIcons && (
                  <label className="menu-toggle-item" style={{ paddingLeft: '24px', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={showSanctuaryIcons}
                      onChange={() => handleToggleClick(onToggleSanctuaryIcons)}
                    />
                    Sanctuary Icons
                  </label>
                )}

                {onToggleShields && (
                  <label className="menu-toggle-item" style={{ paddingLeft: '24px', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={showShields}
                      onChange={() => handleToggleClick(onToggleShields)}
                    />
                    Protected Shields
                  </label>
                )}

                {onToggleCastleRecruitment && (
                  <label className="menu-toggle-item" style={{ paddingLeft: '24px', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={showCastleRecruitment}
                      onChange={() => handleToggleClick(onToggleCastleRecruitment)}
                    />
                    Castle Recruitment
                  </label>
                )}
              </div>
              )}
            </section>

            <div className="menu-divider" />
            <section className="menu-section" aria-labelledby="menu-section-tools">
            <div id="menu-section-tools" className="menu-section-label">Tools</div>

            {onEnableAnalysis && !isAnalysisMode && (
              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onEnableAnalysis)}
              >
                {renderIcon("A")}
                <span>Analysis Board</span>
              </button>
            )}

            {onEditPosition && (
              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onEditPosition)}
              >
                {renderIcon("E")}
                <span>Edit Position</span>
              </button>
            )}
            </section>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}
    </div>
  );
};

export default HamburgerMenu;
