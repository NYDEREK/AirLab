import {
  normalizeParameters,
  type BallParameters,
} from "../geometry/types";

const LEGACY_PROJECTS_KEY = "airlab.projects.v1";
const LEGACY_MIGRATION_KEY = "airlab.projects.v1.migrated";
const PROJECTS_KEY_PREFIX = "airlab.projects.v2";
const APPEARANCE_KEY = "airlab.appearance.v1";

export interface SavedProject {
  id: string;
  name: string;
  parameters: BallParameters;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppearanceSettings {
  interfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  defaultBallColor: string;
}

export type AppearanceThemeColors = Pick<
  AppearanceSettings,
  "interfaceColor" | "textColor" | "mutedTextColor"
>;

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  interfaceColor: "#f4f5f2",
  textColor: "#1c211b",
  mutedTextColor: "#72786f",
  accentColor: "#789a4a",
  defaultBallColor: "#7fa84f",
};

export const APPEARANCE_PRESETS: Array<{
  name: string;
  values: AppearanceThemeColors;
}> = [
  {
    name: "Light",
    values: {
      interfaceColor: DEFAULT_APPEARANCE.interfaceColor,
      textColor: DEFAULT_APPEARANCE.textColor,
      mutedTextColor: DEFAULT_APPEARANCE.mutedTextColor,
    },
  },
  {
    name: "Warm gray",
    values: {
      interfaceColor: "#e9e7e1",
      textColor: "#262520",
      mutedTextColor: "#77736b",
    },
  },
  {
    name: "Dark",
    values: {
      interfaceColor: "#20221f",
      textColor: "#f1f2ed",
      mutedTextColor: "#a4aaa0",
    },
  },
];

export const applyAppearanceTheme = (
  appearance: AppearanceSettings,
  theme: AppearanceThemeColors,
): AppearanceSettings => ({
  ...appearance,
  ...theme,
});

export const appearanceUsesTheme = (
  appearance: AppearanceSettings,
  theme: AppearanceThemeColors,
) =>
  appearance.interfaceColor === theme.interfaceColor &&
  appearance.textColor === theme.textColor &&
  appearance.mutedTextColor === theme.mutedTextColor;

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const migrateParameters = (
  input: Partial<BallParameters>,
): BallParameters => {
  const parameters = normalizeParameters(input);
  const sports = {
    "ping-pong": {
      pattern: "dots" as const,
      wallThickness: 1.25,
      featureWidth: 2.8,
      density: 2,
    },
    tennis: {
      pattern: "dots" as const,
      wallThickness: 1.6,
      featureWidth: 4.6,
      seamWidth: 5.2,
      seamDepth: 0.3,
      density: 2,
    },
    football: {
      pattern: "hexagons" as const,
      wallThickness: 1.8,
      featureWidth: 1.35,
      cellSize: 6.5,
      cellFrequency: 2,
      seamWidth: 3.4,
      seamDepth: 0.3,
      density: 3,
    },
    basketball: {
      pattern: "hexagons" as const,
      wallThickness: 1.8,
      featureWidth: 1.3,
      cellSize: 6.5,
      cellFrequency: 8,
      seamWidth: 3,
      seamDepth: 0.3,
      density: 3,
    },
    volleyball: {
      pattern: "hexagons" as const,
      wallThickness: 1.8,
      featureWidth: 1.35,
      cellSize: 6.5,
      cellFrequency: 8,
      seamWidth: 4.2,
      seamDepth: 0.3,
      density: 3,
    },
    golf: {
      pattern: "dots" as const,
      wallThickness: 1.4,
      featureWidth: 2.1,
      density: 3,
    },
  };
  const sport = sports[parameters.template as keyof typeof sports];
  if (!sport || parameters.mode !== "lattice") return parameters;
  return {
    ...parameters,
    ...sport,
    mode: "perforated",
    seamOperation: "raised",
  };
};

const projectKey = (accountId: string) =>
  `${PROJECTS_KEY_PREFIX}:${accountId}`;

export const loadProjects = (accountId?: string | null): SavedProject[] => {
  if (!accountId) return [];
  try {
    const key = projectKey(accountId);
    const stored = localStorage.getItem(key);
    const legacy = localStorage.getItem(LEGACY_PROJECTS_KEY);
    const canMigrateLegacy =
      accountId !== "airlab-admin" &&
      !stored &&
      Boolean(legacy) &&
      !localStorage.getItem(LEGACY_MIGRATION_KEY);
    const parsed = JSON.parse(
      stored ?? (canMigrateLegacy ? legacy : null) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    const projects = parsed
      .filter(
        (project): project is SavedProject =>
          typeof project?.id === "string" &&
          typeof project?.name === "string" &&
          typeof project?.parameters === "object",
      )
      .map((project) => ({
        ...project,
        thumbnail:
          typeof project.thumbnail === "string" &&
          project.thumbnail.startsWith("data:image/")
            ? project.thumbnail
            : undefined,
        parameters: migrateParameters(project.parameters),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (canMigrateLegacy) {
      localStorage.setItem(key, JSON.stringify(projects));
      localStorage.setItem(LEGACY_MIGRATION_KEY, accountId);
    }
    return projects;
  } catch {
    return [];
  }
};

const writeProjects = (accountId: string, projects: SavedProject[]) => {
  localStorage.setItem(projectKey(accountId), JSON.stringify(projects));
};

export const upsertProject = (
  accountId: string,
  projects: SavedProject[],
  name: string,
  parameters: BallParameters,
  existingId?: string | null,
  thumbnail?: string | null,
) => {
  const now = new Date().toISOString();
  const existing = existingId
    ? projects.find((project) => project.id === existingId)
    : undefined;
  const project: SavedProject = {
    id: existing?.id ?? createId(),
    name: name.trim() || "Untitled ball",
    parameters: { ...parameters },
    thumbnail: thumbnail ?? existing?.thumbnail,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = [
    project,
    ...projects.filter((candidate) => candidate.id !== project.id),
  ];
  writeProjects(accountId, next);
  return { project, projects: next };
};

export const removeProject = (
  accountId: string,
  projects: SavedProject[],
  id: string,
) => {
  const next = projects.filter((project) => project.id !== id);
  writeProjects(accountId, next);
  return next;
};

export const loadAppearance = (): AppearanceSettings => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(APPEARANCE_KEY) ?? "null",
    ) as Partial<AppearanceSettings> | null;
    if (!parsed) return DEFAULT_APPEARANCE;
    return {
      interfaceColor:
        typeof parsed.interfaceColor === "string"
          ? parsed.interfaceColor
          : DEFAULT_APPEARANCE.interfaceColor,
      textColor:
        typeof parsed.textColor === "string"
          ? parsed.textColor
          : DEFAULT_APPEARANCE.textColor,
      mutedTextColor:
        typeof parsed.mutedTextColor === "string"
          ? parsed.mutedTextColor
          : DEFAULT_APPEARANCE.mutedTextColor,
      accentColor:
        typeof parsed.accentColor === "string"
          ? parsed.accentColor
          : DEFAULT_APPEARANCE.accentColor,
      defaultBallColor:
        typeof parsed.defaultBallColor === "string"
          ? parsed.defaultBallColor
          : DEFAULT_APPEARANCE.defaultBallColor,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
};

export const saveAppearance = (appearance: AppearanceSettings) => {
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
};
