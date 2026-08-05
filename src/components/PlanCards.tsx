import { Check } from "lucide-react";
import explorerImage from "../assets/plans/explorer-tier.jpg";
import makerImage from "../assets/plans/maker-tier.jpg";
import merchantImage from "../assets/plans/merchant-tier.jpg";
import {
  PLAN_DEFINITIONS,
  type AccountPlan,
  type PlanId,
} from "../account/plans";

const images: Record<PlanId, string> = {
  explorer: explorerImage,
  maker: makerImage,
  merchant: merchantImage,
};

interface PlanCardsProps {
  compact?: boolean;
  currentPlan?: AccountPlan;
}

export function PlanCards({
  compact = false,
  currentPlan = "unlicensed",
}: PlanCardsProps) {
  return (
    <div className={`tier-grid${compact ? " is-compact" : ""}`}>
      {PLAN_DEFINITIONS.map((plan) => (
        <article
          className={`tier-card tier-${plan.id}`}
          key={plan.id}
          style={{ "--tier-color": plan.color } as React.CSSProperties}
        >
          <img alt={`${plan.name} tier`} src={images[plan.id]} />
          <div className="tier-card-content">
            <div className="tier-card-title">
              <div>
                <span>{plan.name} tier</span>
                <strong>USD {plan.price}</strong>
              </div>
              {currentPlan === plan.id ? <b>Current plan</b> : null}
            </div>
            <p>{plan.description}</p>
            <div className="tier-facts">
              <span>
                Access <strong>{plan.durationLabel}</strong>
              </span>
              <span>
                License <strong>{plan.licenseLabel}</strong>
              </span>
            </div>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={13} />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}
