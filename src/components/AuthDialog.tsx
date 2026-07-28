import { LogIn, X } from "lucide-react";
import { useState } from "react";
import type { AccountSession } from "../account/store";

interface AuthDialogProps {
  onClose: () => void;
  onSubmit: (name: string, email: string) => AccountSession;
}

export function AuthDialog({ onClose, onSubmit }: AuthDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="modal-backdrop compact" role="presentation">
      <form
        aria-labelledby="auth-title"
        aria-modal="true"
        className="auth-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name, email);
        }}
        role="dialog"
      >
        <div className="auth-heading">
          <div>
            <span>AirLab account</span>
            <h2 id="auth-title">Sign in</h2>
          </div>
          <button aria-label="Close sign in" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <p>
          Keep your profile and usage preferences together on this device.
        </p>
        <label>
          Display name
          <input
            autoFocus
            maxLength={48}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            value={name}
          />
        </label>
        <label>
          Email
          <input
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <button className="auth-submit" type="submit">
          <LogIn size={16} />
          Continue
        </button>
        <small>
          Prototype note: this version stores the session locally. Cloud sync
          will be connected with the production account backend.
        </small>
      </form>
    </div>
  );
}
