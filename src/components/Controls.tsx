import type { ReactNode } from "react";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  columns?: number;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  columns = options.length,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="segmented-control"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          className={option.value === value ? "is-active" : ""}
          disabled={option.disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  displayValue?: string;
  onChange: (value: number) => void;
}

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  displayValue,
  onChange,
}: RangeFieldProps) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="range-field">
      <span className="field-heading">
        <span>
          {label}
          {hint ? <small>{hint}</small> : null}
        </span>
        <span className="number-entry">
          {displayValue ? (
            <strong>{displayValue}</strong>
          ) : (
            <input
              max={max}
              min={min}
              onChange={(event) => onChange(Number(event.target.value))}
              step={step}
              type="number"
              value={value}
            />
          )}
          {unit ? <span>{unit}</span> : null}
        </span>
      </span>
      <input
        className="range-input"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        style={{ "--range-progress": `${progress}%` } as React.CSSProperties}
        type="range"
        value={value}
      />
    </label>
  );
}
