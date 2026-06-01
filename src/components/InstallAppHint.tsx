import React from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const InstallAppHint: React.FC = () => {
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(() => localStorage.getItem("castles_install_hint_dismissed") === "1");

  React.useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  if (!installPrompt || dismissed) return null;

  const handleInstall = async () => {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("castles_install_hint_dismissed", "1");
    setDismissed(true);
  };

  return (
    <div
      style={{
        position: "fixed",
        left: "18px",
        bottom: "18px",
        zIndex: 2500,
        background: "rgba(22, 18, 14, 0.92)",
        color: "#f8ead2",
        border: "1px solid rgba(246, 211, 139, 0.4)",
        borderRadius: "8px",
        padding: "14px",
        boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
        maxWidth: "300px",
        fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <strong>Install Castles</strong>
      <p style={{ margin: "6px 0 12px", color: "#d9c7aa", fontSize: "0.9rem" }}>
        Launch it like an app and keep local play available without starting the dev server.
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={handleInstall} style={{ border: "none", borderRadius: "8px", padding: "8px 10px", background: "#f6d38b", color: "#24150b", fontWeight: 700 }}>
          Install
        </button>
        <button onClick={handleDismiss} style={{ border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", padding: "8px 10px", background: "transparent", color: "#f8ead2" }}>
          Later
        </button>
      </div>
    </div>
  );
};

export default InstallAppHint;
