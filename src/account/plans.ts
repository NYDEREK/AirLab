export type PlanId = "explorer" | "maker" | "merchant";
export type AccountPlan = PlanId | "unlicensed";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  price: number;
  color: string;
  description: string;
  durationLabel: string;
  durationDays: number | null;
  exportLimit: number | null;
  projectLimit: number | null;
  licenseLabel: string;
  features: string[];
}

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: "explorer",
    name: "Explorer",
    price: 19,
    color: "#f0bd13",
    description:
      "A focused starting point for discovering AirLab and creating personal projects.",
    durationLabel: "1 year",
    durationDays: 365,
    exportLimit: 10,
    projectLimit: 1,
    licenseLabel: "Personal use",
    features: [
      "AirLab access for 1 year",
      "10 STL or 3MF exports per month",
      "1 saved project",
      "All sport and utility templates",
      "All structures and surface patterns",
      "Personal-use license",
    ],
  },
  {
    id: "maker",
    name: "Maker",
    price: 99,
    color: "#2788ee",
    description:
      "The complete creative toolkit for makers who want full access without renewals.",
    durationLabel: "Lifetime",
    durationDays: null,
    exportLimit: 100,
    projectLimit: 15,
    licenseLabel: "Personal use",
    features: [
      "Lifetime AirLab access",
      "100 STL or 3MF exports per month",
      "15 saved projects",
      "All templates, patterns and mesh qualities",
      "Custom bands, text and logo tools",
      "Personal-use license",
    ],
  },
  {
    id: "merchant",
    name: "Merchant",
    price: 199,
    color: "#ff681d",
    description:
      "Unlimited creation plus commercial rights for selling physical AirLab prints.",
    durationLabel: "Lifetime",
    durationDays: null,
    exportLimit: null,
    projectLimit: null,
    licenseLabel: "Commercial physical prints",
    features: [
      "Lifetime AirLab access",
      "Unlimited STL and 3MF exports",
      "Unlimited saved projects",
      "Every feature included in Maker",
      "Commercial license for physical prints",
      "Use generated designs in your products",
    ],
  },
];

export const planById = (plan: AccountPlan) =>
  PLAN_DEFINITIONS.find((candidate) => candidate.id === plan) ?? null;

export const planRank = (plan: AccountPlan) =>
  PLAN_DEFINITIONS.findIndex((candidate) => candidate.id === plan);

export const formatPlanLimit = (limit: number | null) =>
  limit === null ? "Unlimited" : String(limit);
