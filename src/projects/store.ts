import {
  normalizeParameters,
  type BallParameters,
} from "../geometry/types";

const PROJECTS_KEY = "airlab.projects.v1";
const APPEARANCE_KEY = "airlab.appearance.v1";

export interface SavedProject {
  id: string;
  name: string;
  parameters: BallParameters;
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

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  interfaceColor: "#f4f5f2",
  textColor: "#1c211b",
  mutedTextColor: "#72786f",
  accentColor: "#789a4a",
  defaultBallColor: "#7fa84f",
};

export const APPEARANCE_PRESETS: Array<{
  name: string;
  values: AppearanceSettings;
}> = [
  {
    name: "Light",
    values: DEFAULT_APPEARANCE,
  },
  {
    name: "Warm gray",
    values: {
      interfaceColor: "#e9e7e1",
      textColor: "#262520",
      mutedTextColor: "#77736b",
      accentColor: "#bd6748",
      defaultBallColor: "#d88952",
    },
  },
  {
    name: "Dark",
    values: {
      interfaceColor: "#20221f",
      textColor: "#f1f2ed",
      mutedTextColor: "#a4aaa0",
      accentColor: "#a3c96d",
      defaultBallColor: "#96bf5e",
    },
  },
];

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

export const loadProjects = (): SavedProject[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (project): project is SavedProject =>
          typeof project?.id === "string" &&
          typeof project?.name === "string" &&
          typeof project?.parameters === "object",
      )
      .map((project) => ({
        ...project,
        parameters: migrateParameters(project.parameters),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
};

const writeProjects = (projects: SavedProject[]) => {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
};

export const upsertProject = (
  projects: SavedProject[],
  name: string,
  parameters: BallParameters,
  existingId?: string | null,
) => {
  const now = new Date().toISOString();
  const existing = existingId
    ? projects.find((project) => project.id === existingId)
    : undefined;
  const project: SavedProject = {
    id: existing?.id ?? createId(),
    name: name.trim() || "Untitled ball",
    parameters: { ...parameters },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = [
    project,
    ...projects.filter((candidate) => candidate.id !== project.id),
  ];
  writeProjects(next);
  return { project, projects: next };
};

export const removeProject = (projects: SavedProject[], id: string) => {
  const next = projects.filter((project) => project.id !== id);
  writeProjects(next);
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
