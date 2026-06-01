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
  onOpenOnlineBrowser?: () => void;
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
  onOpenOnlineBrowser,
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
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const menuButtonModalStateRef = useRef<{
    ariaHidden: string | null;
    inert: boolean;
    tabIndex: string | null;
  } | null>(null);
  const { toggleTheme, isDark } = useTheme();

  const hideMenuButtonForModal = React.useCallback(() => {
    const menuButton = menuButtonRef.current;
    if (!menuButton || menuButtonModalStateRef.current) return;
    menuButtonModalStateRef.current = {
      ariaHidden: menuButton.getAttribute("aria-hidden"),
      inert: menuButton.hasAttribute("inert"),
      tabIndex: menuButton.getAttribute("tabindex"),
    };
    menuButton.setAttribute("aria-hidden", "true");
    menuButton.setAttribute("inert", "");
    menuButton.setAttribute("tabindex", "-1");
  }, []);

  const restoreMenuButtonAfterModal = React.useCallback(() => {
    const menuButton = menuButtonRef.current;
    const previousState = menuButtonModalStateRef.current;
    if (!menuButton || !previousState) return;
    if (previousState.ariaHidden === null) {
      menuButton.removeAttribute("aria-hidden");
    } else {
      menuButton.setAttribute("aria-hidden", previousState.ariaHidden);
    }
    if (!previousState.inert) {
      menuButton.removeAttribute("inert");
    }
    if (previousState.tabIndex === null) {
      menuButton.removeAttribute("tabindex");
    } else {
      menuButton.setAttribute("tabindex", previousState.tabIndex);
    }
    menuButtonModalStateRef.current = null;
  }, []);

  const setMenuOpen = React.useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      const activeElement = document.activeElement;
      restoreFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : menuButtonRef.current;
      hideMenuButtonForModal();
    }
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setIsIconsMenuOpen(false);
      restoreMenuButtonAfterModal();
      const restoreTarget = restoreFocusRef.current ?? menuButtonRef.current;
      if (restoreTarget && document.contains(restoreTarget)) {
        restoreTarget.focus();
      }
    }
    onOpenChange?.(nextOpen);
  }, [hideMenuButtonForModal, onOpenChange, restoreMenuButtonAfterModal]);

  useEffect(() => restoreMenuButtonAfterModal, [restoreMenuButtonAfterModal]);

  const getDrawerFocusables = React.useCallback(() => {
    if (!drawerRef.current) return [];
    const selectors = [
      "button:not(:disabled)",
      "input:not(:disabled)",
      "select:not(:disabled)",
      "textarea:not(:disabled)",
      "a[href]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    return Array.from(drawerRef.current.querySelectorAll<HTMLElement>(selectors))
      .filter((element) => element.getAttribute("aria-hidden") !== "true");
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const container = menuRef.current;
    if (!container) return;

    const backgroundElements: HTMLElement[] = [];
    let pathChild: HTMLElement = container;
    let parent = container.parentElement;

    while (parent) {
      for (const element of Array.from(parent.children)) {
        if (element instanceof HTMLElement && element !== pathChild) {
          backgroundElements.push(element);
        }
      }
      if (parent === document.body) {
        break;
      }
      pathChild = parent;
      parent = parent.parentElement;
    }

    const previousValues = Array.from(new Set(backgroundElements)).map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.hasAttribute("inert"),
    }));

    previousValues.forEach(({ element }) => {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("inert", "");
    });

    return () => {
      previousValues.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
        if (!inert) {
          element.removeAttribute("inert");
        }
      });
    };
  }, [isOpen]);

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

  // Close menu with Escape and keep keyboard focus inside the drawer.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusableElements = getDrawerFocusables();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!drawerRef.current?.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [getDrawerFocusables, isOpen, setMenuOpen]);

  const handleMenuItemClick = (action: () => void) => {
    menuButtonRef.current?.focus();
    action();
    setMenuOpen(false);
  };

  const handleToggleClick = (action: () => void) => {
    action();
    // Do not close menu
  };

  const renderMarker = () => (
    <span className="menu-item-icon menu-item-marker" aria-hidden="true" />
  );

  const renderImageIcon = (src: string, alt = "") => (
    <img src={src} alt={alt} style={menuIconStyle} />
  );

  return (
    <div className={`hamburger-container ${isOpen ? "open" : ""}`} ref={menuRef}>
      {/* Hamburger Icon */}
      <button
        className="hamburger-button"
        ref={menuButtonRef}
        onClick={() => setMenuOpen(!isOpen)}
        aria-label="Menu"
        aria-expanded={isOpen}
      >
        <span className="hamburger-icon">☰</span>
      </button>

      {/* Slide-out Menu */}
      {isOpen && (
        <div
          className="hamburger-menu open"
          role="dialog"
          aria-modal="true"
          aria-label="Castles menu"
          ref={drawerRef}
        >
          <div className="menu-header">
            <span>Castles</span>
            <button
              className="menu-close"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              ref={closeButtonRef}
            >
              ×
            </button>
          </div>

          <div className="menu-items">
            <section className="menu-section" aria-labelledby="menu-section-play">
              <div id="menu-section-play" className="menu-section-label">Play</div>

              {onNewGame && (
                <button
                  className="menu-item primary"
                  onClick={() => handleMenuItemClick(onNewGame)}
                >
                  {renderMarker()}
                  <span>New Game</span>
                </button>
              )}
            </section>

            <section className="menu-section" aria-labelledby="menu-section-learn">
              <div id="menu-section-learn" className="menu-section-label">Learn</div>
              <p className="menu-section-note">Lessons and rules</p>

              {onTutorial && (
                <button
                  className="menu-item"
                  onClick={() => handleMenuItemClick(onTutorial)}
                >
                  {renderMarker()}
                  <span>Tutorial</span>
                </button>
              )}

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onShowRules)}
              >
                {renderMarker()}
                <span>Rules</span>
              </button>
            </section>

            {onOpenOnlineBrowser && (
              <section className="menu-section" aria-labelledby="menu-section-watch">
                <div id="menu-section-watch" className="menu-section-label">Watch</div>
                <p className="menu-section-note">Live and archived games</p>
                <button
                  className="menu-item"
                  onClick={() => handleMenuItemClick(onOpenOnlineBrowser)}
                >
                  {renderMarker()}
                  <span>Watch</span>
                </button>
              </section>
            )}

            {(onSaveGameToLibrary || onOpenLibrary) && (
              <section className="menu-section" aria-labelledby="menu-section-library">
                <div id="menu-section-library" className="menu-section-label">Library</div>
                <p className="menu-section-note">Saved games</p>

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
                <span className="menu-item-label">{renderMarker()}<span>Icon Settings</span></span>
                <span aria-hidden="true" style={{ fontSize: '0.8em', opacity: 0.7 }}>{isIconsMenuOpen ? '-' : '+'}</span>
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
                {renderMarker()}
                <span>Analysis Board</span>
              </button>
            )}

            {onEditPosition && (
              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onEditPosition)}
              >
                {renderMarker()}
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
