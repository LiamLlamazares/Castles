/**
 * HamburgerMenu component - slide-out menu for secondary game controls.
 * Contains Export/Import PGN, Flip Board, Toggle Coordinates.
 */
import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { APP_ICON_ASSETS } from "./appIconRegistry";

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
  onOpenPeople?: () => void;
  onOpenProfile?: () => void;
  onlineNotificationCount?: number;
  onlineNotificationLabel?: string;
  onReturnFromAnalysis?: () => void;
  analysisReturnLabel?: string;
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
  onOpenPeople,
  onOpenProfile,
  onlineNotificationCount = 0,
  onlineNotificationLabel = "notifications",
  onReturnFromAnalysis,
  analysisReturnLabel = "Return to Game",
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
  const normalizedOnlineNotificationCount =
    typeof onlineNotificationCount === "number" && Number.isFinite(onlineNotificationCount)
      ? Math.max(0, Math.floor(onlineNotificationCount))
      : 0;
  const onlineLobbyLabel = "Online Lobby";
  const peopleLabel =
    normalizedOnlineNotificationCount > 0
      ? `People, ${normalizedOnlineNotificationCount} ${onlineNotificationLabel}`
      : "People";
  const peopleShortcutLabel =
    normalizedOnlineNotificationCount > 0
      ? `Open people, ${normalizedOnlineNotificationCount} ${onlineNotificationLabel}`
      : "Open people";
  const peopleBadge =
    normalizedOnlineNotificationCount > 99 ? "99+" : String(normalizedOnlineNotificationCount);

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
      } else if (menuButtonRef.current && document.contains(menuButtonRef.current)) {
        menuButtonRef.current.focus();
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

  const handleMenuButtonClick = () => {
    setMenuOpen(!isOpen);
  };

  const renderImageIcon = (src: string) => (
    <span className="menu-item-icon-frame" aria-hidden="true">
      <img className="menu-item-icon" src={src} alt="" />
    </span>
  );

  const renderCornerIcon = (src: string) => (
    <img className="game-corner-icon" src={src} alt="" aria-hidden="true" />
  );

  const cornerButton = (
    label: string,
    action: (() => void) | undefined,
    icon: React.ReactNode,
    options: {
      active?: boolean;
      badge?: string;
      className?: string;
      mobileOptional?: boolean;
      visibleLabel?: string;
    } = {}
  ) => {
    if (!action) return null;
    return (
      <button
        type="button"
        className={[
          "game-corner-button",
          options.active ? "active" : "",
          options.mobileOptional ? "mobile-optional" : "",
          options.className ?? "",
        ].filter(Boolean).join(" ")}
        onClick={action}
        aria-label={label}
        title={label}
        aria-pressed={options.active === undefined ? undefined : options.active}
      >
        {icon}
        {options.visibleLabel && <span className="game-corner-button-label">{options.visibleLabel}</span>}
        {options.badge && <span className="game-corner-badge" aria-hidden="true">{options.badge}</span>}
      </button>
    );
  };

  return (
    <div
      className={[
        "hamburger-container",
        isOpen ? "open" : "",
      ].filter(Boolean).join(" ")}
      ref={menuRef}
    >
      <div className="game-corner-bars" aria-label="Game shortcuts">
        <div className="game-corner-bar game-corner-nav-column" role="toolbar" aria-label="Navigation shortcuts">
          <button
            className={`hamburger-button game-corner-button ${isOpen ? "active" : ""}`}
            ref={menuButtonRef}
            onClick={handleMenuButtonClick}
            aria-label="Menu"
            aria-expanded={isOpen}
            title="Menu"
          >
            <span className="hamburger-icon">☰</span>
            <span className="game-corner-button-label">Menu</span>
          </button>
          {!isOpen && (
            <>
              {cornerButton("Play setup", onNewGame, renderCornerIcon(APP_ICON_ASSETS.play), {
                visibleLabel: "Play",
              })}
              {cornerButton("Open tutorial", onTutorial, renderCornerIcon(APP_ICON_ASSETS.tutorial), {
                visibleLabel: "Tutorial",
              })}
              {cornerButton("Open online lobby", onOpenOnlineBrowser, renderCornerIcon(APP_ICON_ASSETS.online), {
                visibleLabel: "Online",
              })}
              {cornerButton(peopleShortcutLabel, onOpenPeople, renderCornerIcon(APP_ICON_ASSETS.people), {
                badge: normalizedOnlineNotificationCount > 0 ? peopleBadge : undefined,
                visibleLabel: "People",
              })}
              {cornerButton("Open profile", onOpenProfile, renderCornerIcon(APP_ICON_ASSETS.profile), {
                visibleLabel: "Profile",
              })}
              {cornerButton("Open library", onOpenLibrary, renderCornerIcon(APP_ICON_ASSETS.library), {
                visibleLabel: "Library",
              })}
            </>
          )}
        </div>
      </div>

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

              {onReturnFromAnalysis && (
                <button
                  className="menu-item primary"
                  onClick={() => handleMenuItemClick(onReturnFromAnalysis)}
                >
                  {renderImageIcon(APP_ICON_ASSETS.returnToGame)}
                  <span>{analysisReturnLabel}</span>
                </button>
              )}

              {onNewGame && (
                <button
                  className={`menu-item ${onReturnFromAnalysis ? "" : "primary"}`}
                  onClick={() => handleMenuItemClick(onNewGame)}
                >
                  {renderImageIcon(APP_ICON_ASSETS.play)}
                  <span>Configure New Game</span>
                </button>
              )}
            </section>

            <section className="menu-section" aria-labelledby="menu-section-learn">
              <div id="menu-section-learn" className="menu-section-label">Tutorial</div>
              <p className="menu-section-note">Lessons and rules</p>

              {onTutorial && (
                <button
                  className="menu-item"
                  onClick={() => handleMenuItemClick(onTutorial)}
                >
                  {renderImageIcon(APP_ICON_ASSETS.tutorial)}
                  <span>Tutorial</span>
                </button>
              )}

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onShowRules)}
              >
                {renderImageIcon(APP_ICON_ASSETS.rules)}
                <span>Rules</span>
              </button>
            </section>

            {(onOpenOnlineBrowser || onOpenPeople) && (
              <section className="menu-section" aria-labelledby="menu-section-online">
                <div id="menu-section-online" className="menu-section-label">Online</div>
                <p className="menu-section-note">Lobby, people, archive</p>
                {onOpenOnlineBrowser && (
                  <button
                    className="menu-item"
                    onClick={() => handleMenuItemClick(onOpenOnlineBrowser)}
                    aria-label={onlineLobbyLabel}
                    title={onlineLobbyLabel}
                  >
                    {renderImageIcon(APP_ICON_ASSETS.online)}
                    <span>Online Lobby</span>
                  </button>
                )}
                {onOpenPeople && (
                  <button
                    className="menu-item"
                    onClick={() => handleMenuItemClick(onOpenPeople)}
                    aria-label={peopleLabel}
                    title={peopleLabel}
                  >
                    {renderImageIcon(APP_ICON_ASSETS.people)}
                    <span>People</span>
                    {normalizedOnlineNotificationCount > 0 && (
                      <span className="menu-item-badge" aria-hidden="true">
                        {peopleBadge}
                      </span>
                    )}
                  </button>
                )}
              </section>
            )}

            {onOpenProfile && (
              <section className="menu-section" aria-labelledby="menu-section-profile">
                <div id="menu-section-profile" className="menu-section-label">Profile</div>
                <p className="menu-section-note">Account dashboard</p>
                <button
                  className="menu-item"
                  onClick={() => handleMenuItemClick(onOpenProfile)}
                >
                  {renderImageIcon(APP_ICON_ASSETS.profile)}
                  <span>Profile</span>
                </button>
              </section>
            )}

            {(onSaveGameToLibrary || onOpenLibrary) && (
              <section className="menu-section" aria-labelledby="menu-section-library">
                <div id="menu-section-library" className="menu-section-label">Library</div>
                <p className="menu-section-note">Local named saves on this device</p>

                {onSaveGameToLibrary && (
                  <button
                    className="menu-item"
                    onClick={() => handleMenuItemClick(onSaveGameToLibrary)}
                  >
                    {renderImageIcon(APP_ICON_ASSETS.export)}
                    <span>Save to Library</span>
                  </button>
                )}

                {onOpenLibrary && (
                  <button
                    className="menu-item primary"
                    onClick={() => handleMenuItemClick(onOpenLibrary)}
                  >
                    {renderImageIcon(APP_ICON_ASSETS.library)}
                    <span>Open Library</span>
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
              >
                {renderImageIcon(isDark ? APP_ICON_ASSETS.day : APP_ICON_ASSETS.night)}
                <span>{isDark ? 'Day Mode' : 'Night Mode'}</span>
              </button>

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onExportPGN)}
              >
                {renderImageIcon(APP_ICON_ASSETS.export)}
                <span>Export PGN</span>
              </button>

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onImportPGN)}
              >
                {renderImageIcon(APP_ICON_ASSETS.import)}
                <span>Import PGN</span>
              </button>

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(onFlipBoard)}
              >
                {renderImageIcon(APP_ICON_ASSETS.rotate)}
                <span>Flip Board</span>
              </button>

              <button
                className="menu-item"
                onClick={() => setIsIconsMenuOpen(!isIconsMenuOpen)}
                aria-expanded={isIconsMenuOpen}
              >
                <span className="menu-item-label">{renderImageIcon(APP_ICON_ASSETS.boardDisplay)}<span>Board Display</span></span>
                <span className="menu-item-disclosure" aria-hidden="true">{isIconsMenuOpen ? "-" : "+"}</span>
              </button>

              {isIconsMenuOpen && (
                <div className="menu-submenu">
                {onSetAllIcons && (
                  <div className="menu-toggle-actions">
                      <button
                        type="button"
                        className="menu-mini-button"
                        onClick={() => onSetAllIcons(true)}
                      >
                        Show All
                      </button>
                      <button
                        type="button"
                        className="menu-mini-button"
                        onClick={() => onSetAllIcons(false)}
                      >
                        Hide All
                      </button>
                  </div>
                )}

                <label className="menu-toggle-item">
                  <input
                    type="checkbox"
                    checked={showCoordinates}
                    onChange={() => handleToggleClick(onToggleCoordinates)}
                  />
                  Coordinates
                </label>

                {onToggleTerrainIcons && (
                  <label className="menu-toggle-item">
                    <input
                      type="checkbox"
                      checked={showTerrainIcons}
                      onChange={() => handleToggleClick(onToggleTerrainIcons)}
                    />
                    Terrain
                  </label>
                )}

                {onToggleSanctuaryIcons && (
                  <label className="menu-toggle-item">
                    <input
                      type="checkbox"
                      checked={showSanctuaryIcons}
                      onChange={() => handleToggleClick(onToggleSanctuaryIcons)}
                    />
                    Sanctuary Icons
                  </label>
                )}

                {onToggleShields && (
                  <label className="menu-toggle-item">
                    <input
                      type="checkbox"
                      checked={showShields}
                      onChange={() => handleToggleClick(onToggleShields)}
                    />
                    Protected Shields
                  </label>
                )}

                {onToggleCastleRecruitment && (
                  <label className="menu-toggle-item">
                    <input
                      type="checkbox"
                      checked={showCastleRecruitment}
                      onChange={() => handleToggleClick(onToggleCastleRecruitment)}
                    />
                    Recruitment markers
                  </label>
                )}
              </div>
              )}
            </section>

            {((onEnableAnalysis && !isAnalysisMode) || onEditPosition) && (
              <>
                <div className="menu-divider" />
                <section className="menu-section" aria-labelledby="menu-section-tools">
                  <div id="menu-section-tools" className="menu-section-label">Tools</div>

                  {onEnableAnalysis && !isAnalysisMode && (
                    <button
                      className="menu-item"
                      onClick={() => handleMenuItemClick(onEnableAnalysis)}
                    >
                      {renderImageIcon(APP_ICON_ASSETS.analysis)}
                      <span>Analysis Board</span>
                    </button>
                  )}

                  {onEditPosition && (
                    <button
                      className="menu-item"
                      onClick={() => handleMenuItemClick(onEditPosition)}
                    >
                      {renderImageIcon(APP_ICON_ASSETS.editPosition)}
                      <span>Edit Position</span>
                    </button>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}
    </div>
  );
};

export default HamburgerMenu;
