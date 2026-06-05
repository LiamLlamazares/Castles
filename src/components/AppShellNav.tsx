import React from "react";
import "../css/AppShellNav.css";
import castleIcon from "../Assets/Images/misc/wcastle.svg";
import flagIcon from "../Assets/Images/misc/flag.svg";
import lightbulbIcon from "../Assets/Images/misc/lightbulb.svg";
import scrollsIcon from "../Assets/Images/misc/scroll2.svg";
import shieldIcon from "../Assets/Images/Board/shield.svg";

export type AppDestinationId = "play" | "learn" | "library" | "online" | "tools";

export interface AppShellDestination {
  id: AppDestinationId;
  label: string;
  onClick?: () => void;
}

interface AppShellNavProps {
  ariaLabel: string;
  activeDestination: AppDestinationId;
  title: string;
  kicker?: string;
  description?: string;
  backLabel?: string;
  onBack?: () => void;
  destinations: AppShellDestination[];
  endSlot?: React.ReactNode;
}

const destinationIcons: Record<AppDestinationId, string> = {
  play: flagIcon,
  learn: lightbulbIcon,
  online: castleIcon,
  library: scrollsIcon,
  tools: shieldIcon,
};

const AppShellNav: React.FC<AppShellNavProps> = ({
  ariaLabel,
  activeDestination,
  title,
  kicker,
  description,
  backLabel,
  onBack,
  destinations,
  endSlot,
}) => {
  return (
    <header className="app-shell-header">
      <nav className="app-shell-nav" aria-label={ariaLabel}>
        <div className="app-shell-nav-primary">
          <div className="app-shell-brand" aria-label="Castles">
            <span className="app-shell-brand-mark" aria-hidden="true">C</span>
            <span className="app-shell-brand-name">Castles</span>
          </div>
          {onBack && backLabel && (
            <button type="button" className="app-shell-back-button" onClick={onBack} title={backLabel}>
              {backLabel}
            </button>
          )}
          <div className="app-shell-destinations" aria-label="App destinations">
            {destinations.map((destination) => {
              const isActive = destination.id === activeDestination;
              return (
                <button
                  key={destination.id}
                  type="button"
                  className={`app-shell-destination ${isActive ? "active" : ""}`}
                  onClick={destination.onClick}
                  disabled={isActive || !destination.onClick}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={destination.label}
                  title={destination.label}
                >
                  <span className="app-shell-destination-icon" aria-hidden="true">
                    <img src={destinationIcons[destination.id]} alt="" />
                  </span>
                  <span className="app-shell-destination-label">{destination.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {endSlot && <div className="app-shell-nav-actions">{endSlot}</div>}
      </nav>
      <div className="app-shell-title-block">
        {kicker && <div className="app-shell-kicker">{kicker}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
    </header>
  );
};

export default AppShellNav;
