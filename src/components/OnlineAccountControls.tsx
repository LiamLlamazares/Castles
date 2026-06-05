import React from "react";
import {
  ONLINE_ACCOUNT_DISPLAY_NAME_MAX_LENGTH,
  ONLINE_ACCOUNT_DISPLAY_NAME_MIN_LENGTH,
  ONLINE_ACCOUNT_PASSWORD_MAX_LENGTH,
  ONLINE_ACCOUNT_PASSWORD_MIN_LENGTH,
  type OnlineAccount,
  type OnlineAccountOAuthProvidersResponse,
} from "../online/accounts";
import { OnlineRequestError } from "../online/client";
import "../css/OnlineAccountControls.css";

export type OnlineAccountUiStatus =
  | "signed-out"
  | "checking"
  | "creating"
  | "signing-in"
  | "signing-out"
  | "signing-out-all"
  | "deleting"
  | "ready"
  | "error";

export type IdentityKind = "human" | "bot";

interface IdentityIconProps {
  kind: IdentityKind;
  className?: string;
}

export function IdentityIcon({ kind, className = "" }: IdentityIconProps) {
  return (
    <span
      className={["player-identity-icon", kind, className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}

interface OnlineAccountButtonProps {
  displayName: string;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  title?: string;
}

export function OnlineAccountButton({
  displayName,
  onClick,
  ariaLabel = "Open account sign in",
  className = "",
  title = "Open account sign in",
}: OnlineAccountButtonProps) {
  return (
    <button
      type="button"
      className={["online-account-chip", className].filter(Boolean).join(" ")}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
    >
      <IdentityIcon kind="human" className="online-account-chip-icon" />
      <span className="online-account-chip-name">{displayName}</span>
    </button>
  );
}

interface OnlineAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  account?: OnlineAccount | null;
  accountStatus?: OnlineAccountUiStatus;
  accountError?: string | null;
  onCreateAccount?: (displayName: string, password: string) => void | Promise<void>;
  onSignInAccount?: (displayName: string, password: string) => void | Promise<void>;
  loadAccountOAuthProviders?: () => Promise<OnlineAccountOAuthProvidersResponse>;
  onSignOutAccount?: () => void | Promise<void>;
}

function onlineRequestErrorMessage(error: unknown): string | null {
  return error instanceof OnlineRequestError ? error.message : null;
}

function accountStatusLabel(status: OnlineAccountUiStatus | undefined): string {
  switch (status) {
    case "checking":
      return "Checking account...";
    case "creating":
      return "Creating account...";
    case "signing-in":
      return "Signing in...";
    case "signing-out":
      return "Signing out...";
    case "signing-out-all":
      return "Signing out everywhere...";
    case "deleting":
      return "Deleting account...";
    default:
      return "";
  }
}

function isActionErrorMessage(message: string): boolean {
  return message !== "" && message !== "Online account created." && message !== "Signed in.";
}

export function OnlineAccountDialog({
  isOpen,
  onClose,
  account,
  accountStatus = "signed-out",
  accountError,
  onCreateAccount,
  onSignInAccount,
  loadAccountOAuthProviders,
  onSignOutAccount,
}: OnlineAccountDialogProps) {
  const [displayName, setDisplayName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [actionMessage, setActionMessage] = React.useState("");
  const [oauthProviders, setOAuthProviders] = React.useState<OnlineAccountOAuthProvidersResponse["providers"]>([]);
  const [oauthStatus, setOAuthStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const titleId = React.useId();
  const descriptionId = React.useId();
  const dialogRef = React.useRef<HTMLElement>(null);
  const displayNameInputRef = React.useRef<HTMLInputElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    window.setTimeout(() => {
      if (account) {
        closeButtonRef.current?.focus();
        return;
      }
      displayNameInputRef.current?.focus();
    }, 0);
  }, [account, isOpen]);

  React.useEffect(() => {
    if (!isOpen || account || !loadAccountOAuthProviders) {
      setOAuthProviders([]);
      setOAuthStatus("idle");
      return;
    }

    let cancelled = false;
    setOAuthStatus("loading");
    loadAccountOAuthProviders()
      .then((response) => {
        if (cancelled) return;
        setOAuthProviders(response.providers);
        setOAuthStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setOAuthProviders([]);
        setOAuthStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [account, isOpen, loadAccountOAuthProviders]);

  React.useEffect(() => {
    if (!account) return;
    setDisplayName("");
    setPassword("");
  }, [account?.accountId]);

  if (!isOpen) return null;

  const googleProviderSummary = oauthProviders.find((provider) => provider.provider === "google");
  const googleProvider = googleProviderSummary?.enabled ? googleProviderSummary : undefined;
  const oauthMessage =
    oauthStatus === "loading"
      ? "Checking Google sign-in..."
      : oauthStatus === "ready" && googleProviderSummary && !googleProvider
        ? "Google sign-in is not configured on this server."
        : oauthStatus === "error"
          ? "Could not check Google sign-in availability."
          : "";
  const statusMessage = accountStatusLabel(accountStatus) || accountError || actionMessage;
  const statusIsError =
    accountStatus === "error" || Boolean(accountError) || isActionErrorMessage(actionMessage);
  const canSubmit =
    displayName.trim().length >= ONLINE_ACCOUNT_DISPLAY_NAME_MIN_LENGTH &&
    password.length >= ONLINE_ACCOUNT_PASSWORD_MIN_LENGTH &&
    accountStatus !== "creating" &&
    accountStatus !== "signing-in";

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !onCreateAccount) return;
    setActionMessage("");
    try {
      await onCreateAccount(displayName.trim(), password);
      setDisplayName("");
      setPassword("");
      setActionMessage("Online account created.");
    } catch (error) {
      setActionMessage(onlineRequestErrorMessage(error) ?? "Could not create that online account name.");
    }
  };

  const handleSignIn = async () => {
    if (!canSubmit || !onSignInAccount) return;
    setActionMessage("");
    try {
      await onSignInAccount(displayName.trim(), password);
      setDisplayName("");
      setPassword("");
      setActionMessage("Signed in.");
    } catch (error) {
      setActionMessage(
        onlineRequestErrorMessage(error) ?? "Could not sign in with that display name and password."
      );
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!focusable.includes(active as HTMLElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="online-account-dialog-backdrop app-modal-backdrop">
      <section
        className="online-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <div className="online-account-dialog-header">
          <div>
            <span className="online-account-dialog-kicker">Account</span>
            <h2 id={titleId}>Online account</h2>
          </div>
          <button
            type="button"
            className="online-account-dialog-close"
            onClick={onClose}
            aria-label="Close account dialog"
            ref={closeButtonRef}
          >
            x
          </button>
        </div>

        {account ? (
          <div className="online-account-dialog-signed-in">
            <p id={descriptionId}>Signed in as</p>
            <strong>{account.displayName}</strong>
            {statusMessage && (
              <p className={["online-account-dialog-message", statusIsError ? "error" : ""].filter(Boolean).join(" ")} role="status" aria-live="polite">
                {statusMessage}
              </p>
            )}
            <div className="online-account-dialog-actions single">
              <button
                type="button"
                className="online-account-dialog-button subtle"
                onClick={onSignOutAccount}
                disabled={!onSignOutAccount || accountStatus === "signing-out"}
              >
                {accountStatus === "signing-out" ? "Signing Out" : "Sign Out"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p id={descriptionId} className="online-account-dialog-description">
              Continue as Guest, sign in with Google when available, or use a display name and password.
            </p>
            {googleProvider?.startUrl ? (
              <a
                className="online-account-google-link online-account-oauth-button"
                href={googleProvider.startUrl}
                aria-label="Continue with Google"
              >
                Continue with Google
              </a>
            ) : null}
            {oauthMessage && (
              <p
                className={[
                  "online-account-dialog-oauth-message",
                  oauthStatus === "error" || (googleProviderSummary && !googleProvider) ? "error" : "",
                ].filter(Boolean).join(" ")}
                role="status"
                aria-live="polite"
              >
                {oauthMessage}
              </p>
            )}
            {statusMessage && (
              <p className={["online-account-dialog-message", statusIsError ? "error" : ""].filter(Boolean).join(" ")} role="status" aria-live="polite">
                {statusMessage}
              </p>
            )}
            <form className="online-account-dialog-form" onSubmit={handleCreate}>
              <label htmlFor="online-account-display-name">
                <span>Display name</span>
                <input
                  id="online-account-display-name"
                  ref={displayNameInputRef}
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.currentTarget.value)}
                  minLength={ONLINE_ACCOUNT_DISPLAY_NAME_MIN_LENGTH}
                  maxLength={ONLINE_ACCOUNT_DISPLAY_NAME_MAX_LENGTH}
                  autoComplete="nickname"
                />
              </label>
              <label htmlFor="online-account-password">
                <span>Password</span>
                <input
                  id="online-account-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  minLength={ONLINE_ACCOUNT_PASSWORD_MIN_LENGTH}
                  maxLength={ONLINE_ACCOUNT_PASSWORD_MAX_LENGTH}
                  autoComplete="current-password"
                />
              </label>
              <div className="online-account-dialog-actions">
                <button
                  type="submit"
                  className="online-account-dialog-button primary"
                  disabled={!canSubmit || !onCreateAccount}
                >
                  {accountStatus === "creating" ? "Creating..." : "Create Account"}
                </button>
                <button
                  type="button"
                  className="online-account-dialog-button subtle"
                  onClick={handleSignIn}
                  disabled={!canSubmit || !onSignInAccount}
                >
                  {accountStatus === "signing-in" ? "Signing In..." : "Sign In"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
