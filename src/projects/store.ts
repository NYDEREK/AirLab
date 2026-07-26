import type { BallParameters } from "../geometry/types";

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
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  interfaceColor: "#f4f5f2",
  textColor: "#1c211b",
  mutedTextColor: "#72786f",
  accentColor: "#789a4a",
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
    },
  },
  {
    name: "Dark",
    values: {
      interfaceColor: "#20221f",
      textColor: "#f1f2ed",
      mutedTextColor: "#a4aaa0",
      accentColor: "#a3c96d",
    },
  },
];

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
};

export const saveAppearance = (appearance: AppearanceSettings) => {
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
};
