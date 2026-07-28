import {
  BarChart3,
  CreditCard,
  LogOut,
  Palette,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import type { AccountSession, UsageState } from "../account/store";
import type { AppearanceSettings } from "../projects/store";
import { AppearancePanel } from "./AppearancePanel";

type SettingsTab = "appearance" | "account" | "subscription" | "usage";

interface SettingsPanelProps {
  account: AccountSession | null;
  appearance: AppearanceSettings;
  projectCount: number;
  usage: UsageState;
  onAppearanceChange: (appearance: AppearanceSettings) => void;
  onClose: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

const tabs: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof Palette;
}> = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: UserRound },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "usage", label: "Usage", icon: BarChart3 },
];

const UsageBar = ({
  label,
  value,
  limit,
}: {
  label: string;
  value: number;
  limit: number;
}) => (
  <div className="usage-row">
    <div>
      <span>{label}</span>
      <strong>
        {value} / {limit}
      </strong>
    </div>
    <i>
      <b style={{ width: `${Math.min(100, (value / limit) * 100)}%` }} />
    </i>
  </div>
);

export function SettingsPanel({
  account,
  appearance,
  projectCount,
  usage,
  onAppearanceChange,
  onClose,
  onSignIn,
  onSignOut,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>("appearance");

  return (
    <div className="settings-backdrop" role="presentation">
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-panel"
        role="dialog"
      >
        <header>
          <div>
            <span>AirLab</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button aria-label="Close settings" onClick={onClose} type="button">
            <X size={19} />
          </button>
        </header>
        <nav aria-label="Settings sections">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={tab === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => setTab(item.id)}
                type="button"
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <main>
          {tab === "appearance" ? (
            <AppearancePanel
              appearance={appearance}
              embedded
              onChange={onAppearanceChange}
            />
          ) : null}

          {tab === "account" ? (
            <section className="settings-content">
              <span className="settings-eyebrow">Account</span>
              <h3>{account ? account.name : "You are not signed in"}</h3>
              {account ? (
                <>
                  <div className="account-card">
                    <span>{account.name.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{account.name}</strong>
                      <small>{account.email}</small>
                    </div>
                  </div>
                  <button className="settings-secondary" onClick={onSignOut}>
                    <LogOut size={15} />
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <p>
                    Sign in to prepare your workspace for future cloud project
                    sync.
                  </p>
                  <button className="settings-primary" onClick={onSignIn}>
                    Sign in to AirLab
                  </button>
                </>
              )}
            </section>
          ) : null}

          {tab === "subscription" ? (
            <section className="settings-content">
              <span className="settings-eyebrow">Current subscription</span>
              <div className="plan-card">
                <div>
                  <span>Free</span>
                  <strong>Starter workspace</strong>
                  <p>Local projects, STL and 3MF export, all ball templates.</p>
                </div>
                <b>Current plan</b>
              </div>
              <button className="settings-primary" disabled type="button">
                Pro plans coming later
              </button>
            </section>
          ) : null}

          {tab === "usage" ? (
            <section className="settings-content">
              <span className="settings-eyebrow">Monthly usage</span>
              <h3>{usage.month}</h3>
              <div className="usage-list">
                <UsageBar label="Exports" limit={25} value={usage.exports} />
                <UsageBar
                  label="Generated previews"
                  limit={500}
                  value={usage.generations}
                />
                <UsageBar
                  label="Saved projects"
                  limit={10}
                  value={projectCount}
                />
              </div>
              <p className="usage-note">
                Usage is counted locally in this prototype and resets monthly.
              </p>
            </section>
          ) : null}
        </main>
      </section>
    </div>
  );
}
