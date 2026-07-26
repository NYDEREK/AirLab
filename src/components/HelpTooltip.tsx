import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

interface HelpTooltipProps {
  label: string;
  children: ReactNode;
}

export function HelpTooltip({ label, children }: HelpTooltipProps) {
  return (
    <span className="help-tooltip">
      <button aria-label={`Help: ${label}`} type="button">
        <CircleHelp size={15} />
      </button>
      <span className="tooltip-card" role="tooltip">
        <strong>{label}</strong>
        {children}
      </span>
    </span>
  );
}
