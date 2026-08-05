import { LogIn, UserPlus, X } from "lucide-react";
import { useState } from "react";
import type { AccountSession } from "../account/store";
import type { AuthMode } from "./AccessPortal";

interface AuthDialogProps {
  initialMode?: AuthMode;
  onClose: () => void;
  onSubmit: (
    mode: AuthMode,
    email: string,
    password: string,
  ) => Promise<AccountSession>;
}

export function AuthDialog({
  initialMode = "signin",
  onClose,
  onSubmit,
}: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(mode, email, password);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not continue.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop compact" role="presentation">
      <form
        aria-labelledby="auth-title"
        aria-modal="true"
        className="auth-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        role="dialog"
      >
        <div className="auth-heading">
          <div>
            <span>AirLab account</span>
            <h2 id="auth-title">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </h2>
          </div>
          <button aria-label="Close sign in" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="auth-mode" role="tablist">
          <button
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "is-active" : ""}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            role="tab"
            type="button"
          >
            Sign in
          </button>
          <button
            aria-selected={mode === "register"}
            className={mode === "register" ? "is-active" : ""}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            role="tab"
            type="button"
          >
            Create account
          </button>
        </div>

        <p>
          {mode === "signin"
            ? "Sign in to access your local AirLab workspace."
            : "Only an email and password are required. Your account stays on this device."}
        </p>
        <label>
          Email
          <input
            autoComplete="email"
            autoFocus
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          Password
          <input
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
            type="password"
            value={password}
          />
        </label>
        {error ? <div className="auth-error">{error}</div> : null}
        <button className="auth-submit" disabled={busy} type="submit">
          {mode === "signin" ? (
            <LogIn size={16} />
          ) : (
            <UserPlus size={16} />
          )}
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
        <small>
          Passwords are protected with a salted one-way hash. AirLab does not
          send your login details anywhere.
        </small>
      </form>
    </div>
  );
}
