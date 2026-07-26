import { Check, RotateCcw, X } from "lucide-react";
import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
} from "../projects/store";

interface AppearancePanelProps {
  appearance: AppearanceSettings;
  onChange: (appearance: AppearanceSettings) => void;
  onClose: () => void;
}

const ColorField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="color-field">
    <span>{label}</span>
    <span className="color-value">
      <input
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
      <code>{value.toUpperCase()}</code>
    </span>
  </label>
);

export function AppearancePanel({
  appearance,
  onChange,
  onClose,
}: AppearancePanelProps) {
  return (
    <aside className="appearance-panel">
      <div className="drawer-heading">
        <div>
          <span>Appearance</span>
          <strong>Customize AirLab</strong>
        </div>
        <button aria-label="Close appearance panel" onClick={onClose} type="button">
          <X size={18} />
        </button>
      </div>

      <section>
        <span className="drawer-label">Theme presets</span>
        <div className="theme-presets">
          {APPEARANCE_PRESETS.map((preset) => {
            const selected =
              JSON.stringify(preset.values) === JSON.stringify(appearance);
            return (
              <button
                className={selected ? "is-selected" : ""}
                key={preset.name}
                onClick={() => onChange(preset.values)}
                type="button"
              >
                <i
                  style={{
                    background: preset.values.interfaceColor,
                    color: preset.values.textColor,
                  }}
                >
                  Aa
                </i>
                <span>{preset.name}</span>
                {selected ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <span className="drawer-label">Custom colors</span>
        <div className="color-fields">
          <ColorField
            label="Interface"
            onChange={(interfaceColor) =>
              onChange({ ...appearance, interfaceColor })
            }
            value={appearance.interfaceColor}
          />
          <ColorField
            label="Primary text"
            onChange={(textColor) => onChange({ ...appearance, textColor })}
            value={appearance.textColor}
          />
          <ColorField
            label="Muted text"
            onChange={(mutedTextColor) =>
              onChange({ ...appearance, mutedTextColor })
            }
            value={appearance.mutedTextColor}
          />
          <ColorField
            label="Accent & model"
            onChange={(accentColor) =>
              onChange({ ...appearance, accentColor })
            }
            value={appearance.accentColor}
          />
        </div>
      </section>

      <button
        className="reset-theme"
        onClick={() => onChange(DEFAULT_APPEARANCE)}
        type="button"
      >
        <RotateCcw size={15} />
        Restore default
      </button>
    </aside>
  );
}
