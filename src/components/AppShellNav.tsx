import React from "react";
import "../css/AppShellNav.css";

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
}

const AppShellNav: React.FC<AppShellNavProps> = ({
  ariaLabel,
  activeDestination,
  title,
  kicker,
  description,
  backLabel,
  onBack,
  destinations,
}) => {
  return (
    <header className="app-shell-header">
      <nav className="app-shell-nav" aria-label={ariaLabel}>
        <div className="app-shell-nav-primary">
          {onBack && backLabel && (
            <button type="button" className="app-shell-back-button" onClick={onBack}>
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
                >
                  {destination.label}
                </button>
              );
            })}
          </div>
        </div>
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
