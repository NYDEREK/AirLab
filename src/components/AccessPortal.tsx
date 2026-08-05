import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { AccountSession } from "../account/store";
import { BrandLogo } from "./BrandLogo";
import { PlanCards } from "./PlanCards";

export type AuthMode = "signin" | "register";

interface AccessPortalProps {
  account: AccountSession | null;
  onActivate: (code: string) => void;
  onOpenAuth: (mode: AuthMode) => void;
  onSignOut: () => void;
}

export function AccessPortal({
  account,
  onActivate,
  onOpenAuth,
  onSignOut,
}: AccessPortalProps) {
  const [code, setCode] = useState("");

  return (
    <main className="access-portal">
      <header className="access-header">
        <BrandLogo />
        <nav>
          <a href="#available-plans">Available plans</a>
          {account ? (
            <button onClick={onSignOut} type="button">
              <LogOut size={15} />
              Sign out
            </button>
          ) : (
            <button onClick={() => onOpenAuth("signin")} type="button">
              Sign in
            </button>
          )}
        </nav>
      </header>

      <section className="access-hero">
        <span>Airless ball design studio</span>
        <h1>Create the ball you want to print.</h1>
        <p>
          Choose a proven template, customize every important dimension and
          export watertight geometry for your 3D printer.
        </p>
        {!account ? (
          <div className="access-actions">
            <button
              className="access-primary"
              onClick={() => onOpenAuth("register")}
              type="button"
            >
              Create account
            </button>
            <button
              className="access-secondary"
              onClick={() => onOpenAuth("signin")}
              type="button"
            >
              Sign in
            </button>
          </div>
        ) : (
          <form
            className="activation-card"
            onSubmit={(event) => {
              event.preventDefault();
              onActivate(code);
            }}
          >
            <div>
              <ShieldCheck size={19} />
              <span>
                Signed in as <strong>{account.email}</strong>
              </span>
            </div>
            <p>
              Enter the access code received after backing AirLab on
              MakerWorld.
            </p>
            <label>
              <KeyRound size={16} />
              <input
                aria-label="Activation code"
                autoComplete="off"
                onChange={(event) => setCode(event.target.value)}
                placeholder="AIRLAB-..."
                required
                value={code}
              />
              <button type="submit">Activate</button>
            </label>
          </form>
        )}
      </section>

      <section className="available-plans" id="available-plans">
        <div className="available-plans-heading">
          <span>Available plans</span>
          <h2>Choose how far you want to take your ideas.</h2>
          <p>
            All plans include the AirLab ball creator. Higher tiers expand
            project capacity, export limits and licensing.
          </p>
        </div>
        <PlanCards currentPlan={account?.plan} />
        <div className="campaign-placeholder">
          <strong>MakerWorld campaign</strong>
          <span>The campaign link will appear here when it goes live.</span>
          <button disabled type="button">
            Coming soon
          </button>
        </div>
      </section>

      <footer className="access-footer">
        <span>
          <ShieldCheck size={13} />
          Local account · no personal profile data required
        </span>
        <span>AirLab stores your account and projects on this device.</span>
      </footer>
    </main>
  );
}
