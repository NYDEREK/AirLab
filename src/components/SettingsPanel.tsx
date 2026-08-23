import {
  BarChart3,
  Copy,
  CreditCard,
  KeyRound,
  LogOut,
  Palette,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  PLAN_DEFINITIONS,
  planById,
  planUsageLimit,
} from "../account/plans";
import {
  PLAN_ACCESS_CODES,
  type AccountSession,
  type UsageState,
} from "../account/store";
import type { AppearanceSettings } from "../projects/store";
import { AppearancePanel } from "./AppearancePanel";
import { PlanCards } from "./PlanCards";

export type SettingsTab =
  | "appearance"
  | "account"
  | "subscription"
  | "usage"
  | "admin";

interface SettingsPanelProps {
  account: AccountSession | null;
  appearance: AppearanceSettings;
  initialTab?: SettingsTab;
  projectCount: number;
  usage: UsageState;
  onActivate: (code: string) => void;
  onAppearanceChange: (appearance: AppearanceSettings) => void;
  onClose: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

const baseTabs: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof Palette;
}> = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: UserRound },
  { id: "subscription", label: "Available plans", icon: CreditCard },
  { id: "usage", label: "Usage", icon: BarChart3 },
];

const UsageBar = ({
  label,
  value,
  limit,
}: {
  label: string;
  value: number;
  limit: number | null;
}) => {
  const percentage =
    limit === null ? 0 : Math.min(100, (value / Math.max(1, limit)) * 100);
  return (
    <div className="usage-row">
      <div>
        <span>{label}</span>
        <strong>
          {limit === null ? `${value} · Unlimited` : `${value} / ${limit}`}
        </strong>
      </div>
      <i className={limit === null ? "is-unlimited" : undefined}>
        <b style={{ width: limit === null ? "100%" : `${percentage}%` }} />
      </i>
    </div>
  );
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Lifetime";

export function SettingsPanel({
  account,
  appearance,
  initialTab = "appearance",
  projectCount,
  usage,
  onActivate,
  onAppearanceChange,
  onClose,
  onSignIn,
  onSignOut,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [activationCode, setActivationCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const plan = account ? planById(account.plan) : null;
  const tabs = account?.isAdmin
    ? [
        ...baseTabs,
        { id: "admin" as const, label: "Admin", icon: ShieldCheck },
      ]
    : baseTabs;

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
                    {account.isAdmin ? <b>Administrator</b> : null}
                  </div>
                  <p className="account-privacy-note">
                    This profile and its projects are stored locally on this
                    device.
                  </p>
                  <button className="settings-secondary" onClick={onSignOut}>
                    <LogOut size={15} />
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <p>Sign in to open your local AirLab workspace.</p>
                  <button className="settings-primary" onClick={onSignIn}>
                    Sign in to AirLab
                  </button>
                </>
              )}
            </section>
          ) : null}

          {tab === "subscription" ? (
            <section className="settings-content settings-plans">
              <span className="settings-eyebrow">Available plans</span>
              <h3>AirLab access</h3>
              {plan ? (
                <div
                  className="plan-card"
                  style={{ "--plan-color": plan.color } as React.CSSProperties}
                >
                  <div>
                    <span>{plan.name}</span>
                    <strong>{plan.durationLabel} access</strong>
                    <p>
                      {plan.licenseLabel} ·{" "}
                      {account?.expiresAt
                        ? `valid until ${formatDate(account.expiresAt)}`
                        : "no expiration"}
                    </p>
                  </div>
                  <b>Current plan</b>
                </div>
              ) : null}

              {!account?.isAdmin ? (
                <form
                  className="settings-activation"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onActivate(activationCode);
                    setActivationCode("");
                  }}
                >
                  <label>
                    Activation code
                    <span>
                      <KeyRound size={15} />
                      <input
                        onChange={(event) =>
                          setActivationCode(event.target.value)
                        }
                        placeholder="AIRLAB-..."
                        required
                        value={activationCode}
                      />
                      <button type="submit">Activate</button>
                    </span>
                  </label>
                </form>
              ) : null}

              <PlanCards compact currentPlan={account?.plan} />
              <div className="campaign-placeholder is-compact">
                <strong>MakerWorld campaign</strong>
                <span>The campaign link will be added when it goes live.</span>
                <button disabled type="button">
                  Coming soon
                </button>
              </div>
            </section>
          ) : null}

          {tab === "usage" ? (
            <section className="settings-content">
              <span className="settings-eyebrow">Monthly usage</span>
              <h3>{usage.month}</h3>
              <div className="usage-list">
                <UsageBar
                  label="Exports"
                  limit={planUsageLimit(
                    account?.plan,
                    "exports",
                    account?.isAdmin,
                  )}
                  value={usage.exports}
                />
                <UsageBar
                  label="Saved projects"
                  limit={planUsageLimit(
                    account?.plan,
                    "projects",
                    account?.isAdmin,
                  )}
                  value={projectCount}
                />
              </div>
              <p className="usage-note">
                Export usage resets each calendar month. Projects stay on this
                device until you delete them.
              </p>
            </section>
          ) : null}

          {tab === "admin" && account?.isAdmin ? (
            <section className="settings-content admin-settings">
              <span className="settings-eyebrow">Administrator</span>
              <h3>Plan access codes</h3>
              <p>
                Share the matching code with a backer after confirming their
                reward tier.
              </p>
              <div className="admin-code-list">
                {PLAN_DEFINITIONS.map((definition) => {
                  const code = PLAN_ACCESS_CODES[definition.id];
                  return (
                    <article
                      key={definition.id}
                      style={
                        {
                          "--plan-color": definition.color,
                        } as React.CSSProperties
                      }
                    >
                      <div>
                        <span>{definition.name}</span>
                        <strong>{code}</strong>
                      </div>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(code);
                          setCopiedCode(code);
                        }}
                        type="button"
                      >
                        <Copy size={14} />
                        {copiedCode === code ? "Copied" : "Copy"}
                      </button>
                    </article>
                  );
                })}
              </div>
              <p className="usage-note">
                Offline codes are intended for this campaign build. A future
                online license service can issue individual revocable codes.
              </p>
            </section>
          ) : null}
        </main>
      </section>
    </div>
  );
}
