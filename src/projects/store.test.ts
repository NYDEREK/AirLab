import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMETERS } from "../geometry/types";
import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE,
  appearanceUsesTheme,
  applyAppearanceTheme,
  loadProjects,
  upsertProject,
} from "./store";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("saved project thumbnails", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores a rendered thumbnail and preserves it on later saves", () => {
    const thumbnail = "data:image/webp;base64,UklGRg==";
    const created = upsertProject(
      "maker-account",
      [],
      "Rendered ball",
      DEFAULT_PARAMETERS,
      null,
      thumbnail,
    );

    expect(loadProjects("maker-account")[0]?.thumbnail).toBe(thumbnail);

    const updated = upsertProject(
      "maker-account",
      created.projects,
      "Rendered ball renamed",
      DEFAULT_PARAMETERS,
      created.project.id,
      null,
    );
    expect(updated.project.thumbnail).toBe(thumbnail);
  });
});

describe("appearance themes", () => {
  it("keeps custom accent and model colors when switching themes", () => {
    const customized = {
      ...DEFAULT_APPEARANCE,
      accentColor: "#ef476f",
      defaultBallColor: "#118ab2",
    };
    const dark = APPEARANCE_PRESETS.find((preset) => preset.name === "Dark");

    expect(dark).toBeDefined();
    const result = applyAppearanceTheme(customized, dark!.values);

    expect(result).toMatchObject({
      interfaceColor: "#20221f",
      textColor: "#f1f2ed",
      mutedTextColor: "#a4aaa0",
      accentColor: "#ef476f",
      defaultBallColor: "#118ab2",
    });
    expect(appearanceUsesTheme(result, dark!.values)).toBe(true);
  });
});
